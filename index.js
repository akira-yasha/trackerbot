// index.js — DonationBot + Striker (CommonJS)

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Local modules
const { postOrRefreshLauncher } = require('./commands/striker/launcher.js');
const { loadDB, makePages, embedForPage } = require('./commands/striker/utils.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.commands = new Collection();

/* ---------------------------
 * Load slash commands
 * ------------------------- */
const commandsRoot = path.join(__dirname, 'commands');
const slashJSON = [];

for (const folder of fs.readdirSync(commandsRoot, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  const folderPath = path.join(commandsRoot, folder.name);

  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const full = path.join(folderPath, entry.name);
    try {
      const mod = require(full);
      if (mod?.data?.name && typeof mod.execute === 'function') {
        client.commands.set(mod.data.name, mod);
        if (typeof mod.data.toJSON === 'function') slashJSON.push(mod.data.toJSON());
      }
    } catch (e) {
      console.warn(`⚠️ Failed to load command ${full}:`, e.message);
    }
  }
}

/* ---------------------------
 * Register slash commands
 * ------------------------- */
async function registerCommands() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.warn('⚠️ Missing DISCORD_TOKEN or CLIENT_ID in .env');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    if (GUILD_ID) {
      console.log(`🔁 Registering ${slashJSON.length} guild commands...`);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: slashJSON });
      console.log('✅ Guild commands registered.');
    } else {
      console.log(`🔁 Registering ${slashJSON.length} global commands...`);
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashJSON });
      console.log('✅ Global commands registered.');
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

/* ---------------------------
 * Helpers
 * ------------------------- */
function buildPagerRow(chiefKey, page, total) {
  const prev = new ButtonBuilder()
    .setCustomId(`page:${chiefKey}:${page - 1}`)
    .setEmoji('◀️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 0);

  const next = new ButtonBuilder()
    .setCustomId(`page:${chiefKey}:${page + 1}`)
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= total - 1);

  return new ActionRowBuilder().addComponents(prev, next);
}

/* ---------------------------
 * Interaction handling
 * ------------------------- */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) return await cmd.execute(interaction);
    }

    // Launcher buttons → open modal
    // customId: "open_modal:strike" or "open_modal:warning"
    if (interaction.isButton() && interaction.customId.startsWith('open_modal:')) {
      const kind = interaction.customId.split(':')[1]; // "strike" | "warning"
      if (!['strike', 'warning'].includes(kind)) return;

      const modal = new ModalBuilder()
        .setCustomId(`infraction_modal:${kind}`)
        .setTitle(kind === 'strike' ? 'Add Strike' : 'Add Warning');

      const chiefInput = new TextInputBuilder()
        .setCustomId('chief')
        .setLabel('Chief Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Kira')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(64);

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Brief reason (will be shown publicly)')
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(300);

      modal.addComponents(
        new ActionRowBuilder().addComponents(chiefInput),
        new ActionRowBuilder().addComponents(reasonInput),
      );

      return interaction.showModal(modal);
    }

    // Modal submit → handle infraction add
    if (interaction.isModalSubmit() && interaction.customId.startsWith('infraction_modal:')) {
      const { handleInfractionModal } = require('./commands/striker/infractionModalHandler.js');
      return handleInfractionModal(interaction);
    }

    // ◀️/▶️ pager buttons — customId: "page:<chiefKey>:<pageIndex>"
    if (interaction.isButton() && interaction.customId.startsWith('page:')) {
      const [, chiefKey, pageStr] = interaction.customId.split(':');
      const page = parseInt(pageStr, 10) || 0;

      const DATA_PATH = path.resolve('./data/strikerdata.json');
      const db = loadDB(DATA_PATH);
      const chief = db.chiefs?.[chiefKey];
      if (!chief) {
        return interaction.reply({ content: 'Chief not found.', ephemeral: true });
      }

      const pages = makePages(chief, 1000);
      const total = pages.length;
      const clamped = Math.min(Math.max(page, 0), total - 1);

      const embed = embedForPage(chief.name, pages[clamped], clamped, total);
      const components = [buildPagerRow(chiefKey, clamped, total)];

      return interaction.update({
        embeds: [embed],
        components,
        allowedMentions: { parse: [] },
      });
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable?.()) {
      const msg = { content: '❌ Error handling interaction.', flags: 64 };
      try {
        if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
        else await interaction.reply(msg);
      } catch {}
    }
  }
});

/* ---------------------------
 * Sticky refresher on new messages
 * ------------------------- */
const LOG_CHANNEL_ID = process.env.STRIKER_LOG_CHANNEL;
const stickyCooldown = new Map();
const STICKY_COOLDOWN_MS = 2000;

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!LOG_CHANNEL_ID) return;
    if (message.channelId !== LOG_CHANNEL_ID) return;
    if (message.author?.id === client.user.id) return;

    // simple cooldown per-channel
    const now = Date.now();
    const last = stickyCooldown.get(message.channelId) || 0;
    if (now - last < STICKY_COOLDOWN_MS) return;
    stickyCooldown.set(message.channelId, now);

    // don't loop on the launcher itself
    const DATA_PATH = path.resolve('./data/strikerdata.json');
    const db = fs.existsSync(DATA_PATH)
      ? JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
      : { launchers: {} };

    const currentLauncherId = db.launchers?.[message.channelId];
    if (currentLauncherId && message.id === currentLauncherId) return;

    try {
      await postOrRefreshLauncher(message.channel);
    } catch (e) {
      console.error('Sticky refresh error:', e.message);
    }
  } catch (e) {
    console.error('MessageCreate watcher error:', e.message);
  }
});

/* ---------------------------
 * Login
 * ------------------------- */
client.login(process.env.DISCORD_TOKEN);

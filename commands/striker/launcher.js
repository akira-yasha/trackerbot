// commands/striker/launcher.js (CommonJS)
const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const DATA_PATH = path.resolve('./data/strikerdata.json');

function loadDB() {
  if (!fs.existsSync(DATA_PATH)) return { chiefs: {}, launchers: {} };
  const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  if (!db.launchers) db.launchers = {};
  if (!db.chiefs) db.chiefs = {};
  return db;
}
function saveDB(db) { fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2)); }

async function postOrRefreshLauncher(channel, { title, note } = {}) {
  const db = loadDB();
  const prevId = db.launchers[channel.id];

  if (prevId) {
    try {
      const old = await channel.messages.fetch(prevId);
      if (old?.deletable) await old.delete().catch(() => {});
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setTitle(title || 'Strikes & Warnings')
    .setDescription(note || '**Strike:** Minor infractions like using fragments on the wrong day.\n-# No action will be taken for strikes. It is for logging purposes only\n\n**Warning:** More serious infractions where you DM the user and verbally warn them\n-# Receiving 3 strikes for the same thing will warrant a warning.\n\n__When adding a strike/warning, copy the persons Chief name **exactly**__')
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_modal:strike')
      .setLabel('Add Strike')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Danger),   // red
    new ButtonBuilder()
      .setCustomId('open_modal:warning')
      .setLabel('Add Warning')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Danger),  // green
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.launchers[channel.id] = msg.id;
  saveDB(db);
  return msg;
}

module.exports.postOrRefreshLauncher = postOrRefreshLauncher;

module.exports.data = new SlashCommandBuilder()
  .setName('strike-launcher')
  .setDescription('Post or refresh the strike launcher message in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(o => o.setName('title').setDescription('Optional title'))
  .addStringOption(o => o.setName('note').setDescription('Optional note'));

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ flags: 64 });
  try {
    await postOrRefreshLauncher(interaction.channel, {
      title: interaction.options.getString('title'),
      note:  interaction.options.getString('note'),
    });
    await interaction.editReply('Launcher posted. Consider pinning it 🧷');
  } catch (e) {
    console.error('strike-launcher failed:', e);
    await interaction.editReply('Could not post the launcher. Ensure I can Send Messages & Embed Links.');
  }
};

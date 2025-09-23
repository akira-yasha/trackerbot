// commands/striker/strikes.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const path = require('node:path');
const { loadDB, getChief, makePages, embedForPage } = require('./utils.js');
const { postOrRefreshLauncher } = require('./launcher.js');

const DATA_PATH = path.resolve('./data/strikerdata.json');
const LOG_CHANNEL_ID = process.env.STRIKER_LOG_CHANNEL;

function pagerRow(chiefKey, page, total) {
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

module.exports.data = new SlashCommandBuilder()
  .setName('strikes')
  .setDescription('Show strikes & warnings (list or detail)')
  .addStringOption(o =>
    o.setName('chief')
      .setDescription('Chief name (leave empty to show all)')
      .setRequired(false)
  );

module.exports.execute = async (interaction) => {
  try {
    await interaction.deferReply({ ephemeral: false });

    const db = loadDB(DATA_PATH);
    const wanted = interaction.options.getString('chief');

    // ------ LIST MODE (no chief provided) ------
    if (!wanted) {
      const chiefs = Object.values(db.chiefs || {});
      if (chiefs.length === 0) {
        await interaction.editReply('No infractions logged yet.');
        return;
      }

      // Only include chiefs that actually have at least one strike or warning
      const rows = chiefs
        .map(c => ({
          name: c.name,
          strikes: Array.isArray(c.strikes) ? c.strikes.length : 0,
          warnings: Array.isArray(c.warnings) ? c.warnings.length : 0,
        }))
        .filter(r => r.strikes > 0 || r.warnings > 0)
        // Sort by total infractions desc, then name asc
        .sort((a, b) => (b.strikes + b.warnings) - (a.strikes + a.warnings) || a.name.localeCompare(b.name));

      if (rows.length === 0) {
        await interaction.editReply('No infractions logged yet.');
        return;
      }

      // Build three inline columns. Mentions are not needed here.
      const chiefsCol   = rows.map(r => r.name).join('\n');
      const strikesCol  = rows.map(r => String(r.strikes)).join('\n');
      const warningsCol = rows.map(r => String(r.warnings)).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xb21010)
        .setTitle('Chief Infractions')
        .addFields(
          { name: 'Chief',    value: chiefsCol,   inline: true },
          { name: 'Strikes',  value: strikesCol,  inline: true },
          { name: 'Warnings', value: warningsCol, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      if (LOG_CHANNEL_ID && interaction.channelId === LOG_CHANNEL_ID) {
        try { await postOrRefreshLauncher(interaction.channel); } catch (e) {
          console.error('Launcher refresh (after /strikes list) failed:', e?.message || e);
        }
      }
      return;
    }

    // ------ DETAIL MODE (specific chief) ------
    const chiefName = wanted.trim();
    const chief = getChief(db, chiefName);
    const chiefKey = chief.name.toLowerCase();

    const pages = makePages(chief, 1000);
    const total = pages.length;
    const page  = 0;

    const embed = embedForPage(chief.name, pages[page], page, total);
    const components = total > 1 ? [pagerRow(chiefKey, page, total)] : [];

    await interaction.editReply({
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    });

    if (LOG_CHANNEL_ID && interaction.channelId === LOG_CHANNEL_ID) {
      try { await postOrRefreshLauncher(interaction.channel); } catch (e) {
        console.error('Launcher refresh (after /strikes detail) failed:', e?.message || e);
      }
    }
  } catch (err) {
    console.error('/strikes error:', err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Something went wrong.');
      } else {
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true });
      }
    } catch {}
  }
};

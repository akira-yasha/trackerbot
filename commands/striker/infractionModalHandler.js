const fs = require('fs');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { postOrRefreshLauncher } = require('./launcher.js');
const { makePages, embedForPage, loadDB, saveChief, getChief } = require('./utils.js');

const DATA_PATH = path.resolve('./data/strikerdata.json');
const CONFIG_PATH = path.resolve('./data/strikerconfig.json');

// --- helpers ---
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

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

async function handleInfractionModal(interaction) {
  const [, kind] = interaction.customId.split(':'); // "strike" | "warning"
  await interaction.deferReply({ ephemeral: true });

  try {
    const chiefName = interaction.fields.getTextInputValue('chief').trim();
    const reason    = interaction.fields.getTextInputValue('reason').trim();
    const issuer    = interaction.user;

    const db = loadDB(DATA_PATH);
    const c  = getChief(db, chiefName);

    if (kind === 'strike') {
      c.strikes.push({ ts: Date.now(), reason, issuer: issuer.id });
    } else if (kind === 'warning') {
      c.warnings.push({ ts: Date.now(), reason, issuer: issuer.id, sentBy: issuer.id });
    } else {
      await interaction.editReply('Unknown infraction type.');
      return;
    }

    saveChief(DATA_PATH, db, c);

    // --- resolve log channel id: config first, then env fallbacks
    const config = loadConfig();
    const guildConfig = config[interaction.guildId] || {};
    const logChannelId =
      guildConfig.strikeLogChannelId ||
      process.env.STRIKE_LOG_CHANNEL_ID ||
      process.env.INFRACTION_LOG_CHANNEL_ID ||
      null;

    if (!logChannelId || !/^\d{17,20}$/.test(logChannelId)) {
      await interaction.editReply('⚠️ Strike log channel is not configured. Use `/strikechannel` to set it.');
      return;
    }

    // one declaration only; prefer cache then fetch
    const logChannel =
      interaction.client.channels.cache.get(logChannelId) ??
      await interaction.client.channels.fetch(logChannelId);

    if (!logChannel || !logChannel.isTextBased()) {
      await interaction.editReply('⚠️ Configured strike log channel is invalid or not a text channel.');
      return;
    }

    const pages = makePages(c, 1000);
    const total = pages.length;
    const page  = 0;

    const embed = embedForPage(c.name, pages[page], page, total);
    const components = total > 1 ? [pagerRow(c.name.toLowerCase(), page, total)] : [];

    await logChannel.send({
      content:
        kind === 'strike'
          ? `**${issuer}** added a **strike** for **${c.name}**.\nReason: ${reason}`
          : `**${issuer}** added a **warning** for **${c.name}**.\nReason: ${reason}`,
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    });

    try { await postOrRefreshLauncher(logChannel); } catch {}

    // clean up the ephemeral deferred reply
    try { await interaction.deleteReply(); }
    catch { try { await interaction.editReply({ content: '\u200b' }); } catch {} }

  } catch (err) {
    console.error('handleInfractionModal error:', err);
    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply('Something went wrong while logging the infraction.');
      }
    } catch {}
  }
}

module.exports = { handleInfractionModal };

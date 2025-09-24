const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { postOrRefreshLauncher } = require('./launcher.js');
const { makePages, embedForPage, loadDB, saveChief, getChief } = require('./utils.js');

const DATA_PATH = path.resolve('./data/strikerdata.json');

// Prefer these var names in Railway:
// STRIKE_LOG_CHANNEL_ID or INFRACTION_LOG_CHANNEL_ID

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

// Resolve the log channel id from env or guild config
function resolveLogChannelId(interaction, guildSettings) {
  return (
    process.env.STRIKE_LOG_CHANNEL_ID ||            // recommended Railway var
    process.env.INFRACTION_LOG_CHANNEL_ID ||        // fallback var name
    guildSettings?.strikeLogChannelId ||            // per-guild config fields
    guildSettings?.infractionLogChannelId ||        // alternate name
    null
  );
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

    // Try to pull a guild settings object if you keep one in memory
    const guildSettings =
      interaction.client?.guildConfigs?.get?.(interaction.guildId) ?? null;

    const logChannelId = resolveLogChannelId(interaction, guildSettings);

    // Validate it's a Discord snowflake (17–20 digits)
    if (!logChannelId || !/^\d{17,20}$/.test(logChannelId)) {
      console.error('[Striker] Missing/invalid log channel id:', logChannelId, {
        env: {
          STRIKE_LOG_CHANNEL_ID: !!process.env.STRIKE_LOG_CHANNEL_ID,
          INFRACTION_LOG_CHANNEL_ID: !!process.env.INFRACTION_LOG_CHANNEL_ID,
        }
      });

      await interaction.editReply([
        '⚠️ Strike log channel isn’t configured.',
        'Set a valid channel ID in Railway variables as `STRIKE_LOG_CHANNEL_ID`',
        'or configure your guild settings for `strikeLogChannelId`.'
      ].join('\n'));
      return;
    }

    // One declaration only — prefer cache, fallback to fetch
    const logChannel =
      interaction.client.channels.cache.get(logChannelId) ??
      await interaction.client.channels.fetch(logChannelId);

    if (!logChannel || !logChannel.isTextBased()) {
      await interaction.editReply('⚠️ The configured log channel can’t be found or isn’t a text channel.');
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
    // Clean up the ephemeral deferred reply
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

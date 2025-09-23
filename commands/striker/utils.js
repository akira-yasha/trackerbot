const fs = require('node:fs');
const { EmbedBuilder } = require('discord.js');

function loadDB(DATA_PATH) {
  if (!fs.existsSync(DATA_PATH)) return { chiefs: {}, launchers: {} };
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function saveDB(DATA_PATH, db) { fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2)); }
function getChief(db, chiefName) {
  const key = chiefName.trim().toLowerCase();
  return db.chiefs?.[key] ?? { name: chiefName.trim(), strikes: [], warnings: [] };
}
function saveChief(DATA_PATH, db, chief) {
  if (!db.chiefs) db.chiefs = {};
  db.chiefs[chief.name.toLowerCase()] = chief;
  saveDB(DATA_PATH, db);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).replace(' ', ', ');
}
const mention = (id) => `<@!${id}>`;
const truncate = (s, n) => (!s ? '' : s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…');

/** Build linear blocks (no page header in blocks) — newest → oldest. */
function buildBlocks(chief) {
  const blocks = [];

  const strikes = [...(chief.strikes || [])].sort((a, b) => b.ts - a.ts);
  const warns   = [...(chief.warnings || [])].sort((a, b) => b.ts - a.ts);

  // Strikes
  blocks.push({ type: 'section', section: 'Strikes', text: '**__Strikes__**\n' });
  if (strikes.length === 0) {
    blocks.push({ type: 'entry', section: 'Strikes', text: 'No strikes.\n\n' });
  } else {
    for (const s of strikes) {
      const head   = `> **${formatDate(s.ts)} — Logged by ${mention(s.issuer)}**\n`;
      const reason = `> ${truncate(s.reason || '—', 700)}\n\n`;
      blocks.push({ type: 'entry', section: 'Strikes', text: head + reason });
    }
  }

  // Warnings (start on page 1 unless we overflow)
  blocks.push({ type: 'section', section: 'Warnings', text: '**__Warnings__**\n' });
  if (warns.length === 0) {
    blocks.push({ type: 'entry', section: 'Warnings', text: 'No warnings.\n\n' });
  } else {
    for (const w of warns) {
      const head   = `> **${formatDate(w.ts)} — Issued by ${mention(w.issuer)}**\n`;
      const reason = `> ${truncate(w.reason || '—', 700)}\n\n`;
      blocks.push({ type: 'entry', section: 'Warnings', text: head + reason });
    }
  }

  return blocks;
}

/** Make array of page descriptions; each starts with the main header, ≤ limit. */
function makePages(chief, pageCharLimit = 1000) {
  const header = `### Infraction Summary — ${chief.name}\n\n`;
  const headerLen = header.length;

  const blocks = buildBlocks(chief);
  const pages = [];

  let current = header;
  let currentSection = null; // 'Strikes' | 'Warnings'

  const startNew = (repeatSectionHeader = '') => {
    current = header + (repeatSectionHeader ? `**__${repeatSectionHeader}__**\n` : '');
  };

  for (const b of blocks) {
    // if we’re about to overflow, push current and start a new one
    const nextLen = current.length + b.text.length;
    if (nextLen > pageCharLimit) {
      pages.push(current);
      // if we broke mid-section, repeat that section header on the next page
      const repeat = b.type === 'entry' ? (currentSection || '') : (b.section || '');
      startNew(repeat);
    }

    // if this is a section block, update currentSection
    if (b.type === 'section') currentSection = b.section;

    // append
    current += b.text;
  }

  if (current.trim().length > 0) pages.push(current);
  if (pages.length === 0) pages.push(header + 'No data.\n');

  return pages;
}

function embedForPage(chiefName, pageText, pageIndex, totalPages) {
  return new EmbedBuilder()
    .setColor(0xb21010)
    .setDescription(pageText)
    .setFooter({ text: `Page ${pageIndex + 1}/${totalPages}` })
    .setTimestamp();
}

module.exports = {
  loadDB, saveDB, getChief, saveChief, makePages, embedForPage,
};

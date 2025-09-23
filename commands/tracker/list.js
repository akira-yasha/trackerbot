// commands/tracker/list.js
const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const DATA_PATH = path.join(__dirname, "../../data/trackerdata.json");

function loadData() {
  if (!fs.existsSync(DATA_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return {};
  }
}

function fmt(currency, amount) {
  const n = Number(amount);
  let s = n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${currency}${s}`;
}


function pct(current, goal) {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((current / goal) * 100)));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("list")
    .setDescription("List all trackers in this server."),
  async execute(interaction) {
    const data = loadData();
    const gid = interaction.guild.id;
    const trackers = data[gid] ?? [];

    if (!trackers.length) {
      return interaction.reply({
        content: "ℹ️ No trackers yet. Use `/start` to create one.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📊 Trackers in this server")
      .setColor(0x3498db);

    for (const t of trackers) {
    const progress = `${fmt(t.currency, t.current)} / ${fmt(t.currency, t.goal)} (${pct(t.current, t.goal)}%)`;
      const channelMention = `<#${t.channelId}>`;

      embed.addFields(
        { name: "Name", value: t.name, inline: true },
        { name: "Progress", value: progress, inline: true },
        { name: "Channel", value: channelMention, inline: true },
      );
    }

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

// commands/tracker/edit.js
const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const DATA_PATH = path.join(__dirname, "../../data/trackerdata.json");
const IMAGES_PATH = path.join(__dirname, "../../images");

// Suggested currencies (autocomplete list). Users can still type anything.
const CURRENCY_SUGGESTIONS = [
  { name: "Dollar ($)", value: "$" },
  { name: "Euro (€)", value: "€" },
  { name: "Pound (£)", value: "£" },
  { name: "Yen (¥)", value: "¥" },
  { name: "Australian Dollar (A$)", value: "A$" },
  { name: "Canadian Dollar (C$)", value: "C$" },
  { name: "Bitcoin (₿)", value: "₿" },
];

function loadData() {
  if (!fs.existsSync(DATA_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveData(obj) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(obj, null, 2), "utf8");
}

function pct(current, goal) {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((current / goal) * 100)));
}

function progressImageName(progress) {
  const p = Math.max(0, Math.min(100, Math.floor(progress)));
  return `progress-${p}.png`;
}

// Smart currency formatter: no decimals for whole numbers; keep 1–2 when needed
function fmt(currency, amount) {
  const n = Number(amount);
  let s = n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${currency}${s}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("edit")
    .setDescription("Edit a tracker's settings without removing it.")
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Existing tracker name to edit")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("new_name").setDescription("Change the tracker's name")
    )
    .addIntegerOption((o) =>
      o.setName("goal").setDescription("Set a new goal amount (integer)")
    )
    .addNumberOption((o) =>
      o.setName("current").setDescription("Set a new current amount (overwrites current)")
    )
    .addStringOption((o) =>
      o
        .setName("currency")
        .setDescription("Change currency (try $, €, £, A$, ...)")
        .setAutocomplete(true)
    )
    .addStringOption((o) =>
      o.setName("message").setDescription("Set/replace the optional message/description")
    )
    .addStringOption((o) =>
      o.setName("donate_url").setDescription("Set/replace the donate URL (Ko-fi/PayPal link)")
    )
    .addBooleanOption((o) =>
      o.setName("clear_donate_url").setDescription("Remove the donate URL & button")
    )
    .addChannelOption((o) =>
      o
        .setName("move_to_channel")
        .setDescription("Move the card to another text/news channel")
        .addChannelTypes(0, 5) // 0 = GuildText, 5 = GuildAnnouncement
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.options.getString("name", true);
    const newName = interaction.options.getString("new_name") || null;
    const newGoal = interaction.options.getInteger("goal");
    const newCurrent = interaction.options.getNumber("current");
    const newCurrency = interaction.options.getString("currency") || null;
    const newMessage = interaction.options.getString("message") || null;
    const newDonateUrl = interaction.options.getString("donate_url") || null;
    const clearDonate = interaction.options.getBoolean("clear_donate_url") || false;
    const moveChannel = interaction.options.getChannel("move_to_channel") || null;

    const data = loadData();
    const gid = interaction.guild.id;
    const trackers = data[gid] ?? [];
    const tracker = trackers.find((t) => t.name.toLowerCase() === name.toLowerCase());

    if (!tracker) {
      return interaction.editReply({ content: `❌ Tracker **${name}** not found.` });
    }

    const summary = [];

    if (newName && newName.trim().toLowerCase() !== tracker.name.toLowerCase()) {
      const exists = trackers.some(
        (t) => t !== tracker && t.name.toLowerCase() === newName.trim().toLowerCase()
      );
      if (exists) {
        return interaction.editReply({ content: `❌ Another tracker named **${newName}** already exists.` });
      }
      summary.push(`• Name: **${tracker.name}** → **${newName.trim()}**`);
      tracker.name = newName.trim();
    }

    if (typeof newGoal === "number") {
      if (newGoal <= 0) {
        return interaction.editReply({ content: "❌ Goal must be greater than 0." });
      }
      summary.push(`• Goal: ${fmt(tracker.currency, tracker.goal)} → ${fmt(tracker.currency, newGoal)}`);
      tracker.goal = newGoal;
      if (tracker.current > tracker.goal) {
        tracker.current = tracker.goal;
        summary.push(`• Current clamped to goal: ${fmt(tracker.currency, tracker.current)}`);
      }
    }

    if (typeof newCurrent === "number") {
      if (newCurrent < 0) {
        return interaction.editReply({ content: "❌ Current cannot be negative." });
      }
      if (tracker.goal > 0 && newCurrent > tracker.goal) {
        summary.push(
          `• Current: ${fmt(tracker.currency, tracker.current)} → ${fmt(tracker.currency, tracker.goal)} (clamped to goal)`
        );
        tracker.current = tracker.goal;
      } else {
        summary.push(`• Current: ${fmt(tracker.currency, tracker.current)} → ${fmt(tracker.currency, newCurrent)}`);
        tracker.current = newCurrent;
      }
    }

    if (newCurrency && newCurrency !== tracker.currency) {
      summary.push(`• Currency: **${tracker.currency}** → **${newCurrency}**`);
      tracker.currency = newCurrency;
    }

    if (newMessage !== null) {
      summary.push(`• Message: ${tracker.customMessage ? "updated" : "set"}`);
      tracker.customMessage = newMessage;
    }

    if (clearDonate) {
      if (tracker.donateUrl) {
        summary.push(`• Donate URL: **cleared**`);
        tracker.donateUrl = "";
      }
    } else if (newDonateUrl !== null) {
      summary.push(`• Donate URL: ${tracker.donateUrl ? "updated" : "set"}`);
      tracker.donateUrl = newDonateUrl;
    }

    const progress = pct(tracker.current, tracker.goal);
    const imageFile = progressImageName(progress);
    const imagePath = path.join(IMAGES_PATH, imageFile);
    const files = [];
    if (fs.existsSync(imagePath)) {
      files.push(new AttachmentBuilder(imagePath).setName(imageFile));
    }

    const embed = new EmbedBuilder()
      .setDescription(`# ${tracker.name} Goal Tracker${tracker.customMessage ? `\n${tracker.customMessage}` : ""}`)
      .addFields(
        { name: "Goal", value: fmt(tracker.currency, tracker.goal), inline: true },
        { name: "Current", value: fmt(tracker.currency, tracker.current), inline: true }
      )
      .setColor(0xC6B1D9);

    if (files.length) embed.setImage(`attachment://${imageFile}`);

    const rows = [];
    if (tracker.donateUrl) {
      embed.setFooter({
        text: "⚠️ If you donate, please include your Discord name in the donation message.",
      });
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("☕ Donate through Ko-fi")
            .setURL(tracker.donateUrl)
        )
      );
    }

    try {
      const oldChannel = await interaction.client.channels.fetch(tracker.channelId);
      const oldMsg = await oldChannel.messages.fetch(tracker.messageId);

      if (moveChannel && moveChannel.id !== tracker.channelId) {
        const newMsg = await moveChannel.send({ embeds: [embed], files, components: rows });
        await oldMsg.delete().catch(() => {});
        tracker.channelId = newMsg.channel.id;
        tracker.messageId = newMsg.id;
        summary.push(`• Moved card to ${moveChannel}.`);
      } else {
        await oldMsg.edit({ embeds: [embed], files, components: rows });
      }
    } catch (e) {
      console.error("Error updating/moving tracker card:", e);
      return interaction.editReply({
        content: "⚠️ Saved changes to storage, but I couldn't edit or move the original card (message missing or permissions).",
      });
    }

    saveData(data);

    const changes = summary.length ? summary.join("\n") : "No changes provided — nothing to update.";
    return interaction.editReply({ content: `✅ **${tracker.name}** updated.\n${changes}` });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "currency") {
      const query = String(focused.value || "").toLowerCase();
      const out = [];
      const seen = new Set();
      const push = (n, v) => {
        if (!seen.has(v)) {
          seen.add(v);
          out.push({ name: n, value: v });
        }
      };
      if (query) push(`Use “${focused.value}”`, focused.value);
      for (const c of CURRENCY_SUGGESTIONS) {
        if (c.name.toLowerCase().includes(query) || c.value.toLowerCase().includes(query)) {
          push(c.name, c.value);
        }
        if (out.length >= 25) break;
      }
      return interaction.respond(out);
    }

    const data = loadData();
    const gid = interaction.guild.id;
    const names = (data[gid] ?? []).map((t) => t.name);
    const q = String(focused.value || "").toLowerCase();
    const filtered = names
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    return interaction.respond(filtered);
  },
};

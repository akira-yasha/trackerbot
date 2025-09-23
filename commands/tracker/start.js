// commands/tracker/start.js
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
    .setName("start")
    .setDescription("Create a donation/progress tracker.")
    .addStringOption((o) =>
      o.setName("name")
        .setDescription("Tracker name")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("goal")
        .setDescription("Goal amount")
        .setRequired(true)
    )
    // 🔸 currency is now OPTIONAL with autocomplete
    .addStringOption((o) =>
      o.setName("currency")
        .setDescription("Currency symbol (try $, €, £, A$, ...)")
        .setAutocomplete(true)
    )
    // 🔸 channel is now OPTIONAL; defaults to the channel where /start is run
    .addChannelOption((o) =>
      o.setName("channel")
        .setDescription("Channel to post the tracker in (defaults to here)")
    )
    .addStringOption((o) =>
      o.setName("message")
        .setDescription("Optional message/description")
    )
    .addStringOption((o) =>
      o.setName("donate_url")
        .setDescription("Optional donate link (adds a button)")
    ),

  async execute(interaction) {
    const name = interaction.options.getString("name");
    const goal = interaction.options.getInteger("goal");
    const currency = interaction.options.getString("currency") || "$"; // default if omitted
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel; // default to current channel
    const customMessage = interaction.options.getString("message") || "";
    const donateUrl = interaction.options.getString("donate_url") || "";

    const data = loadData();
    const gid = interaction.guild.id;
    data[gid] ??= [];

    // Remove any existing tracker with the same name
    const existingIndex = data[gid].findIndex(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    if (existingIndex !== -1) {
      data[gid].splice(existingIndex, 1);
    }

    const progress = pct(0, goal);
    const imageFile = progressImageName(progress);
    const imagePath = path.join(IMAGES_PATH, imageFile);

    const files = [];
    if (fs.existsSync(imagePath)) {
      files.push(new AttachmentBuilder(imagePath).setName(imageFile));
    }

    const embed = new EmbedBuilder()
      .setDescription(`# ${name} Goal Tracker${customMessage ? `\n${customMessage}` : ""}`)
      .addFields(
        { name: "Goal", value: fmt(currency, goal), inline: true },
        { name: "Current", value: fmt(currency, 0), inline: true }
      )
      .setColor(0xC6B1D9);

    if (files.length) {
      embed.setImage(`attachment://${imageFile}`);
    }

    const rows = [];
    if (donateUrl) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("☕ Donate through Ko-fi")
            .setURL(donateUrl)
        )
      );
    }

    let sent;
    try {
      sent = await targetChannel.send({
        embeds: [embed],
        files,
        components: rows,
      });
    } catch (e) {
      console.error("Error sending tracker card:", e);
      return interaction.reply({
        content: "❌ I couldn't post the tracker (missing permissions or invalid channel).",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Save tracker info
    data[gid].push({
      name,
      goal,
      current: 0,
      currency,
      channelId: sent.channel.id,
      messageId: sent.id,
      customMessage,
      donateUrl,
    });

    saveData(data);

    await interaction.reply({
      content:
        targetChannel.id === interaction.channelId
          ? `✅ Tracker **${name}** created here.`
          : `✅ Tracker **${name}** created in ${targetChannel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },

  // 🔸 Autocomplete for currency field (optional field)
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true); // { name, value }
    if (focused.name !== "currency") return interaction.respond([]);

    const query = String(focused.value || "").toLowerCase();

    // Always let the user use their raw typed value first
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
      if (
        c.name.toLowerCase().includes(query) ||
        c.value.toLowerCase().includes(query)
      ) {
        push(c.name, c.value);
      }
      if (out.length >= 25) break;
    }

    return interaction.respond(out);
  },
};

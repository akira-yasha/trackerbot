// commands/tracker/add.js
const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");

const DATA_PATH = path.join(__dirname, "../../data/trackerdata.json");
const IMAGES_PATH = path.join(__dirname, "../../images");

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
    .setName("add")
    .setDescription("Add an amount to an existing tracker.")
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Tracker name")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addNumberOption((o) =>
      o
        .setName("amount")
        .setDescription("Amount to add (e.g., 25.50).")
        .setRequired(true)
    )
    .addUserOption((o) =>
      o
        .setName("mention")
        .setDescription('Who donated? (defaults to "Someone")')
    )
    .addStringOption((o) =>
      o
        .setName("note")
        .setDescription("Optional note shown in your confirmation.")
    )
    .addBooleanOption((o) =>
      o
        .setName("announce")
        .setDescription('Post a public “🎉 donated …” message (default: true).')
    ),

  async execute(interaction) {
    const name = interaction.options.getString("name", true);
    const amount = interaction.options.getNumber("amount", true);
    const mentionUser = interaction.options.getUser("mention") || null;
    const note = interaction.options.getString("note") || "";
    const announce = interaction.options.getBoolean("announce");
    const shouldAnnounce = announce !== null ? announce : true;

    if (!(amount > 0)) {
      return interaction.reply({
        content: "❌ Amount must be greater than 0.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const data = loadData();
    const gid = interaction.guild.id;
    const trackers = data[gid] ?? [];
    const tracker = trackers.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );

    if (!tracker) {
      return interaction.editReply({ content: `❌ Tracker **${name}** not found.` });
    }

    // Update totals
    tracker.current = Math.min(
      tracker.goal,
      Number(tracker.current) + Number(amount)
    );

    const progress = pct(tracker.current, tracker.goal);

    // Prepare image (progress-%)
    const imageFile = progressImageName(progress);
    const imagePath = path.join(IMAGES_PATH, imageFile);
    const files = [];
    if (fs.existsSync(imagePath)) {
      files.push(new AttachmentBuilder(imagePath).setName(imageFile));
    }

    // Rebuild embed (inline fields + keep Ko-fi warning footer if donateUrl exists)
    const embed = new EmbedBuilder()
      .setDescription(
        `# ${tracker.name} Goal Tracker${
          tracker.customMessage ? `\n${tracker.customMessage}` : ""
        }`
      )
      .addFields(
        { name: "Goal", value: fmt(tracker.currency, tracker.goal), inline: true },
        { name: "Current", value: fmt(tracker.currency, tracker.current), inline: true }
      )
      .setColor(0xC6B1D9);

    if (files.length) {
      embed.setImage(`attachment://${imageFile}`);
    }

    if (tracker.donateUrl) {
      embed.setFooter({
        text:
          "⚠️ If you donate, please include your Discord name in the donation message.",
      });
    }

    // Edit the original tracker message and optionally announce
    let editOK = true;
    try {
      const channel = await interaction.client.channels.fetch(tracker.channelId);
      const msg = await channel.messages.fetch(tracker.messageId);

      await msg.edit({
        embeds: [embed],
        files, // must reattach so attachment:// still works
        components: msg.components, // keep Donate button row if present
      });

      if (shouldAnnounce) {
        const donorText = mentionUser ? `<@${mentionUser.id}>` : "**Someone**";
        await channel.send(
          `🎉 ${donorText} donated **${fmt(tracker.currency, amount)}** to the **${tracker.name} Goal!** 🎉`
        );
      }
    } catch (err) {
      editOK = false;
      console.error("Error updating tracker message:", err);
    }

    saveData(data);

    const reached = tracker.current >= tracker.goal;
    const base = `✅ Added ${fmt(tracker.currency, amount)} to **${tracker.name}**. Now at ${fmt(
      tracker.currency,
      tracker.current
    )} / ${fmt(tracker.currency, tracker.goal)} (${progress}%).`;
    const tail = reached ? " 🎉 Goal reached!" : "";
    const extra = note ? `\n📝 ${note}` : "";
    const editNote = editOK
      ? ""
      : "\n⚠️ Totals saved, but I could not edit the original card (maybe deleted or missing permissions).";

    return interaction.editReply({ content: `${base}${tail}${extra}${editNote}` });
  },

  // Autocomplete for tracker names
  async autocomplete(interaction) {
    try {
      const focused = String(interaction.options.getFocused() ?? "").toLowerCase();
      const data = loadData();
      const gid = interaction.guild.id;
      const names = (data[gid] ?? []).map((t) => t.name);
      const filtered = names
        .filter((n) => n.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }));
      return interaction.respond(filtered);
    } catch (e) {
      console.error("Autocomplete error:", e);
      return interaction.respond([]);
    }
  },
};

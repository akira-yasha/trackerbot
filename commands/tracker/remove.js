const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a tracker")
    .addStringOption(option =>
      option.setName("name")
        .setDescription("Name of the tracker")
        .setRequired(true)
        .setAutocomplete(true) // 👈 enable autocomplete
    ),

  async execute(interaction) {
    const name = interaction.options.getString("name");
    const dataPath = path.join(__dirname, "../../data/trackerdata.json");

    let trackers = {};
    if (fs.existsSync(dataPath)) {
      trackers = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    }

    const guildTrackers = trackers[interaction.guild.id] || [];
    const tracker = guildTrackers.find(t => t.name.toLowerCase() === name.toLowerCase());

    if (!tracker) {
      return interaction.reply({ content: `❌ Tracker **${name}** not found.`, ephemeral: true });
    }

    try {
      const channel = await interaction.guild.channels.fetch(tracker.channelId);
      const message = await channel.messages.fetch(tracker.messageId);
      await message.delete();
    } catch (err) {
      console.error("Could not delete tracker message:", err);
    }

    // Remove from data
    trackers[interaction.guild.id] = guildTrackers.filter(t => t.name.toLowerCase() !== name.toLowerCase());
    fs.writeFileSync(dataPath, JSON.stringify(trackers, null, 2));

    await interaction.reply({ content: `✅ Tracker **${name}** has been removed.`, ephemeral: true });
  }
};

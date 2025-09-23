// commands/tracker/help.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all available DonationBot commands"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("🤖 DonationBot Help")
      .setColor(0x5865f2)
      .setDescription("Here are the available commands for tracking donations and goals:")
      .addFields(
        { name: "/start", value: "Create a new donation tracker.\nRequired: `name`, `goal`\nOptional: `currency`, `channel`, `message`, `donate_url`", inline: false },
        { name: "/add", value: "Add an amount to a tracker.\nRequired: `name`, `amount`\nOptional: `mention`, `note`, `announce`", inline: false },
        { name: "/list", value: "List all trackers in this server.", inline: false },
        { name: "/remove", value: "Remove a tracker by name.", inline: false },
        { name: "/edit", value: "Edit tracker settings without removing it.\nOptions: `new_name`, `goal`, `current`, `currency`, `message`, `donate_url`, `clear_donate_url`, `move_to_channel`", inline: false },
        { name: "/help", value: "Show this help message.", inline: false }
      )
      .setFooter({ text: "⚠️ Reminder: If you donate, please include your Discord name in the donation message." });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

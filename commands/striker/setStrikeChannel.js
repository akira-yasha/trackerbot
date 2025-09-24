const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve('./data/strikerconfig.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('strikechannel')
    .setDescription('Set the log channel for strikes/warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel where infractions will be logged')
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    if (!channel.isTextBased()) {
      return interaction.reply({ content: '⚠️ Must be a text channel.', ephemeral: true });
    }

    const config = loadConfig();
    config[interaction.guildId] = { strikeLogChannelId: channel.id };
    saveConfig(config);

    await interaction.reply({
      content: `✅ Strike log channel set to ${channel}`,
      ephemeral: true
    });
  }
};

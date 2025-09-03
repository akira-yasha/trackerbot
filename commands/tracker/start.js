// commands/tracker/start.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Starts a donation tracker.')
        .addStringOption(option =>
            option.setName('currency')
                .setDescription('The currency symbol')
                .setRequired(false))
        .addNumberOption(option =>
            option.setName('amount')
                .setDescription('The amount to track')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('note')
                .setDescription('Optional note')
                .setRequired(false)),
    
    async execute(interaction) {
        const currency = interaction.options.getString('currency') || '';
        const amount = interaction.options.getNumber('amount') || '';
        const note = interaction.options.getString('note') || '';

        let response = `This would create a tracker for ${currency} ${amount}`;
        if (note) response += ` - ${note}`;

        await interaction.reply(response);
    },
}; // End of start command

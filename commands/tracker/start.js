const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Create a new donation tracker')
        .addStringOption(option =>
            option.setName('currency')
                .setDescription('Choose a currency symbol')
                .setRequired(true)
                .addChoices(
                    { name: 'Dollar ($)', value: '$' },
                    { name: 'Euro (€)', value: '€' },
                    { name: 'Peso (₱)', value: '₱' },
                    { name: 'Yen (¥)', value: '¥' },
                    { name: 'Pound (£)', value: '£' }
                )
        )
        .addNumberOption(option =>
            option.setName('amount')
                .setDescription('Set the goal amount')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('note')
                .setDescription('Optional note or description')
                .setRequired(false)
        ),

    async execute(interaction) {
        const currency = interaction.options.getString('currency');
        const amount = interaction.options.getNumber('amount');
        const note = interaction.options.getString('note') || 'No note provided';

        await interaction.reply(
            `🛠 This would create a tracker for **${currency}${amount}**\n` +
            `Note: ${note}`
        );
    },
};

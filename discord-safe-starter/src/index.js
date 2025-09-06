// Discord-safe starter (compliant): verification, tickets, simple shop (roles), tax calc.
const path = require('path');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits, Partials, Routes, REST, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { QuickDB } = require('st.db');
const config = require('./config.js');

// === Basic guards ===
if (!config.bot.token) {
  console.error('DISCORD_TOKEN missing in .env'); process.exit(1);
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: 'safe-session-secret',
  resave: false,
  saveUninitialized: false
}));

// === DBs ===
const users = new QuickDB({ filePath: path.join(__dirname, '..', 'data', 'users.sqlite') });
const purchases = new QuickDB({ filePath: path.join(__dirname, '..', 'data', 'purchases.sqlite') });

// === Discord client ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.GuildMember, Partials.User]
});

// === Passport (Discord OAuth2) for verification ===
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: config.bot.clientId,
  clientSecret: config.bot.clientSecret,
  callbackURL: `${config.web.baseUrl}/auth/callback`,
  scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  // Store minimal profile (no auto-join, compliant usage)
  await users.set(profile.id, {
    id: profile.id,
    username: profile.username,
    accessToken,
    refreshToken,
    updatedAt: Date.now()
  });
  return done(null, profile);
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/', (req, res) => res.render('index', { user: req.user, config }));
app.get('/auth/login', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), async (req, res) => {
  // Give verified role if the user is in the guild
  try {
    const guild = await client.guilds.fetch(config.bot.guildId);
    const member = await guild.members.fetch(req.user.id).catch(() => null);
    if (member && config.bot.verifiedRoleId) {
      await member.roles.add(config.bot.verifiedRoleId).catch(() => {});
    }
  } catch (e) {
    console.warn('Verification role assignment skipped:', e?.message);
  }
  res.render('success', { user: req.user, config });
});

app.listen(config.web.port, () => {
  console.log(`🌐 Web listening on ${config.web.port} (${config.web.baseUrl})`);
});

// === Register slash commands ===
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.bot.token);
  const body = [
    { name: 'setup', description: 'إرسال بانل الشراء/التحقق' },
    { name: 'tax', description: 'حسبة ضريبة بروبوت + وسيط', options: [{ name: 'amount', description: 'المبلغ (مثال 10000)', type: 4, required: true }] }
  ];
  await rest.put(Routes.applicationCommands(config.bot.clientId), { body });
  console.log('✅ Slash commands registered');
}

// === Helpers ===
function ownerOnly(userId) {
  return config.bot.ownerIds.includes(String(userId));
}

// === Client events ===
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  registerCommands().catch(console.error);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setup') {
        if (!ownerOnly(interaction.user.id)) return interaction.reply({ content: '❌ ليس لديك صلاحية.', ephemeral: true });

        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle('خدمة موثقة ومطابقة لقوانين ديسكورد')
          .setDescription('تحقق من حسابك ثم افتح تذكرة لشراء **أدوار/خدمات داخل السيرفر**.
> لا نقوم ببيع أعضاء أو إدخال قسري.')
          .setFooter({ text: interaction.guild.name })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('✅ تحقق الآن').setURL(`${config.web.baseUrl}/auth/login`),
          new ButtonBuilder().setCustomId('open_ticket').setLabel('🎟️ فتح تذكرة').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: 'تم الإرسال ✅', ephemeral: true });
      }

      if (interaction.commandName === 'tax') {
        const amt = interaction.options.getInteger('amount');
        const tax = parseInt(amt / 0.95 + 1);
        const tax2 = parseInt(tax / 0.95 + 1);
        const rate = parseInt(amt * 0.02);
        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setDescription([
            `> المبلغ كامل : \`${amt}\``,
            `> مع ضريبة بروبوت : \`${tax}\``,
            `> مع ضريبة الوسيط : \`${tax2}\``,
            `> نسبة الوسيط 2% : \`${rate}\``,
            `> الإجمالي الكلي : \`${tax2 + rate}\``
          ].join('\n'));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    // Buttons
    if (interaction.isButton()) {
      if (interaction.customId === 'open_ticket') {
        const categoryId = config.bot.categoryId;
        const category = categoryId ? interaction.guild.channels.cache.get(categoryId) : null;
        if (!category || category.type !== 4) { // 4 = GuildCategory
          return interaction.reply({ content: '❌ لم يتم العثور على كاتيجوري صالح في الإعدادات.', ephemeral: true });
        }

        const ch = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`.slice(0, 30),
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });

        const intro = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle('تذكرة خدمة')
          .setDescription('مرحبًا! اكتب طلبك هنا أو اضغط الزر لفتح نموذج شراء دور مدفوع.')
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy_role').setLabel('🛒 شراء دور').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger)
        );

        await ch.send({ content: `${interaction.user}`, embeds: [intro], components: [row] });
        return interaction.reply({ content: `✅ تم فتح تذكرتك: ${ch}`, ephemeral: true });
      }

      if (interaction.customId === 'close_ticket') {
        await interaction.reply({ content: 'سيتم إغلاق التذكرة بعد 5 ثواني...', ephemeral: true });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        return;
      }

      if (interaction.customId === 'buy_role') {
        const modal = new ModalBuilder()
          .setCustomId('buy_modal')
          .setTitle('شراء دور');

        const roleId = new TextInputBuilder()
          .setCustomId('role_id')
          .setLabel('ID الدور المطلوب')
          .setStyle(TextInputStyle.Short)
          .setMinLength(10).setMaxLength(30).setRequired(true);

        const amount = new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('السعر (كريدت)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(roleId),
          new ActionRowBuilder().addComponents(amount)
        );

        return interaction.showModal(modal);
      }
    }

    // Modals
    if (interaction.isModalSubmit() && interaction.customId === 'buy_modal') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const priceStr = interaction.fields.getTextInputValue('amount');
      const price = Number(priceStr);
      if (!Number.isFinite(price) || price <= 0) {
        return interaction.reply({ content: '❌ سعر غير صالح.', ephemeral: true });
      }

      // Store a pending purchase (mock)
      const id = `${interaction.user.id}-${Date.now()}`;
      await purchases.set(id, { userId: interaction.user.id, roleId, price, status: 'pending' });

      const embed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('طلب شراء دور')
        .setDescription([
          `**المستخدم:** <@${interaction.user.id}>`,
          `**الدور:** \`${roleId}\``,
          `**السعر:** \`${price}\``,
          '',
          'قم بالتحويل للبائع ثم اكتب هنا "تم التحويل" ليقوم الادمن بالمراجعة.'
        ].join('\n'));

      return interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error('interaction error:', err);
    if (interaction.isRepliable()) {
      try { await interaction.reply({ content: 'حدث خطأ غير متوقع.', ephemeral: true }); } catch {}
    }
  }
});

client.login(config.bot.token);

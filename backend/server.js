require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const TOKEN = process.env.BOT_TOKEN;
const MY_WALLET = process.env.MY_WALLET;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const PORT = process.env.PORT || 3000;
const ADMIN_ID = process.env.ADMIN_ID;

// -------------------------------------------------------
// CONNESSIONE MONGODB
// -------------------------------------------------------
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connesso'))
  .catch(err => console.error('❌ MongoDB errore:', err.message));

// -------------------------------------------------------
// MODELLI DATABASE
// -------------------------------------------------------
const UserSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  balance: { type: Number, default: 0 },
  bonusBalance: { type: Number, default: 0 },
  bonusWagered: { type: Number, default: 0 },
  bonusTarget: { type: Number, default: 0 },
  bonusUsed: { type: Boolean, default: false },
  processedHashes: [String],
  wallet: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const BetSchema = new mongoose.Schema({
  userId: String,
  amount: Number,
  prediction: String,
  odds: Number,
  matchId: String,
  useBonus: Boolean,
  status: { type: String, default: 'pending' },
  potentialWin: Number,
  date: { type: Date, default: Date.now }
});

const WithdrawalSchema = new mongoose.Schema({
  userId: String,
  amount: Number,
  wallet: String,
  status: { type: String, default: 'pending' },
  date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Bet = mongoose.model('Bet', BetSchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

// -------------------------------------------------------
// SETUP EXPRESS
// -------------------------------------------------------
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// -------------------------------------------------------
// FUNZIONI UTILI
// -------------------------------------------------------
async function getUser(userId) {
  const id = String(userId);
  let user = await User.findOne({ telegramId: id });
  if (!user) {
    user = await User.create({ telegramId: id });
  }
  return user;
}

async function applyWelcomeBonus(userId, depositAmount) {
  const user = await getUser(userId);
  if (user.bonusUsed) return 0;

  const bonusAmount = Math.min(depositAmount, 200);
  user.bonusBalance += bonusAmount;
  user.bonusTarget = depositAmount + bonusAmount; // wagering = deposito + bonus
  user.bonusWagered = 0;
  user.bonusUsed = true;
  await user.save();

  bot.sendMessage(userId,
    `🎁 *Bonus Benvenuto attivato!*\n\n` +
    `Hai ricevuto *${bonusAmount}€* di bonus!\n` +
    `Per sbloccarlo devi scommettere: *${user.bonusTarget}€* totali su quote ≥1.30`,
    { parse_mode: 'Markdown' }
  );

  return bonusAmount;
}

async function checkDeposits(userId) {
  try {
    const response = await axios.get('https://toncenter.com/api/v2/getTransactions', {
      params: { address: MY_WALLET, limit: 20 }
    });

    const transactions = response.data.result;
    if (!transactions) return false;

    const user = await getUser(userId);
    let depositFound = false;

    for (let tx of transactions) {
      const inMsg = tx.in_msg;
      if (!inMsg || !inMsg.message || !inMsg.value) continue;

      const memo = inMsg.message.trim();
      const txHash = tx.transaction_id.hash;
      const amountTon = parseInt(inMsg.value) / 1_000_000_000;

      if (memo === String(userId) && !user.processedHashes.includes(txHash)) {
        user.balance += amountTon;
        user.processedHashes.push(txHash);
        depositFound = true;
        await user.save();

        const bonus = await applyWelcomeBonus(userId, amountTon);

        bot.sendMessage(userId,
          `✅ *Deposito confermato!*\n` +
          `+${amountTon.toFixed(2)}€\n` +
          `💰 Saldo: ${user.balance.toFixed(2)}€` +
          (bonus > 0 ? `\n🎁 Bonus: +${bonus.toFixed(2)}€` : ''),
          { parse_mode: 'Markdown' }
        );
      }
    }
    return depositFound;
  } catch (err) {
    console.error('[ERRORE TON API]', err.message);
    return false;
  }
}

// -------------------------------------------------------
// ODDS API
// -------------------------------------------------------
async function getOdds(sportKey) {
  try {
    const res = await axios.get(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: 'eu',
        markets: 'h2h',
        oddsFormat: 'decimal'
      }
    });
    return res.data;
  } catch (err) {
    console.error('[ERRORE ODDS API]', err.message);
    return [];
  }
}

// -------------------------------------------------------
// BOT TELEGRAM
// -------------------------------------------------------
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await getUser(chatId);

  bot.sendMessage(chatId,
    `🎰 *Benvenuto nella Bet App!*\n\n` +
    `🎁 Primo deposito? Ricevi il *100% di bonus fino a 200€*!\n\n` +
    `Clicca il bottone per iniziare.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔥 Apri App', web_app: { url: process.env.FRONTEND_URL } }
        ]]
      }
    }
  );
});

bot.onText(/\/saldo/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUser(chatId);
  bot.sendMessage(chatId,
    `💰 Saldo: *${user.balance.toFixed(2)}€*\n🎁 Bonus: *${user.bonusBalance.toFixed(2)}€*`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/supporto/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🆘 *Supporto*\n\nPer depositi in USDT, USDC, BTC o ETH contatta l'amministratore.\n\nSpecifica:\n- La crypto che vuoi usare\n- L'importo\n\nRiceverai l'indirizzo corretto entro pochi minuti.`,
    { parse_mode: 'Markdown' }
  );
});

// -------------------------------------------------------
// API REST
// -------------------------------------------------------

app.get('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await getUser(userId);
    await checkDeposits(userId);
    const fresh = await getUser(userId);

    res.json({
      balance: fresh.balance,
      bonusBalance: fresh.bonusBalance,
      bonusWagered: fresh.bonusWagered,
      bonusTarget: fresh.bonusTarget,
      bonusUsed: fresh.bonusUsed,
      depositAddress: MY_WALLET,
      memo: userId,
      wallet: fresh.wallet
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/odds/:sportKey', async (req, res) => {
  try {
    const odds = await getOdds(req.params.sportKey);
    const filtered = odds.map(game => ({
      ...game,
      bookmakers: game.bookmakers.map(bm => ({
        ...bm,
        markets: bm.markets.map(market => ({
          ...market,
          outcomes: market.outcomes.map(o => ({
            ...o,
            price: Math.max(o.price, 1.30)
          }))
        }))
      }))
    }));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bet', async (req, res) => {
  try {
    const { userId, amount, prediction, odds, matchId, useBonus } = req.body;
    if (!userId || !amount || !prediction || !odds) {
      return res.status(400).json({ error: 'Dati mancanti' });
    }

    const user = await getUser(userId);
    if (amount <= 0) return res.json({ success: false, message: 'Importo non valido' });

    if (useBonus && user.bonusBalance >= amount) {
      user.bonusBalance -= amount;
      user.bonusWagered += amount;

      if (user.bonusWagered >= user.bonusTarget && user.bonusTarget > 0) {
        const sbloccato = user.bonusBalance;
        user.balance += sbloccato;
        user.bonusBalance = 0;
        bot.sendMessage(userId,
          `🎉 *Wagering completato!*\n+${sbloccato.toFixed(2)}€ aggiunti al saldo prelevabile!`,
          { parse_mode: 'Markdown' }
        );
      }
    } else if (user.balance >= amount) {
      user.balance -= amount;
      if (user.bonusUsed && user.bonusWagered < user.bonusTarget) {
        user.bonusWagered += amount;
        if (user.bonusWagered >= user.bonusTarget) {
          const sbloccato = user.bonusBalance;
          user.balance += sbloccato;
          user.bonusBalance = 0;
          bot.sendMessage(userId,
            `🎉 *Wagering completato!*\n+${sbloccato.toFixed(2)}€ aggiunti al saldo prelevabile!`,
            { parse_mode: 'Markdown' }
          );
        }
      }
    } else {
      return res.json({ success: false, message: 'Saldo insufficiente' });
    }

    await user.save();

    const bet = await Bet.create({
      userId, amount, prediction, odds, matchId, useBonus,
      potentialWin: amount * odds
    });

    res.json({ success: true, newBalance: user.balance, newBonus: user.bonusBalance, bet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, wallet } = req.body;
    const user = await getUser(userId);

    if (!wallet) return res.json({ success: false, message: 'Inserisci wallet' });
    if (amount <= 0) return res.json({ success: false, message: 'Importo non valido' });
    if (user.balance < amount) return res.json({ success: false, message: 'Saldo insufficiente' });

    user.wallet = wallet;
    user.balance -= amount;
    await user.save();

    await Withdrawal.create({ userId, amount, wallet });

    if (ADMIN_ID) {
      bot.sendMessage(ADMIN_ID,
        `💸 *Nuova richiesta prelievo!*\n\n` +
        `👤 Utente: ${userId}\n` +
        `💰 Importo: ${amount}€\n` +
        `👛 Wallet: \`${wallet}\``,
        { parse_mode: 'Markdown' }
      );
    }

    res.json({ success: true, message: 'Richiesta inviata! Elaboreremo entro 24h.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin endpoints
app.get('/api/admin/withdrawals', async (req, res) => {
  const w = await Withdrawal.find({ status: 'pending' }).sort({ date: -1 });
  res.json(w);
});

app.get('/api/admin/users', async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

app.get('/api/admin/bets', async (req, res) => {
  const bets = await Bet.find().sort({ date: -1 }).limit(100);
  res.json(bets);
});

app.listen(PORT, () => {
  console.log(`✅ Backend attivo su http://localhost:${PORT}`);
  console.log(`🔑 Bot token: ${TOKEN ? 'caricato' : '⚠️ MANCANTE'}`);
  console.log(`💳 Wallet: ${MY_WALLET || '⚠️ MANCANTE'}`);
  console.log(`🎲 Odds API: ${ODDS_API_KEY ? 'caricata' : '⚠️ MANCANTE'}`);
  console.log(`🗄️ MongoDB: connecting...`);
});
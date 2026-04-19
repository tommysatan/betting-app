require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
const MY_WALLET = process.env.MY_WALLET;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const PORT = process.env.PORT || 3000;

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
// DATABASE
// -------------------------------------------------------
let usersDb = {};
let betsDb = [];
let withdrawalsDb = [];

function getUser(userId) {
  const id = String(userId);
  if (!usersDb[id]) {
    usersDb[id] = {
      balance: 0,
      bonusBalance: 0,
      bonusWagered: 0,
      bonusTarget: 0,
      bonusUsed: false,
      processedHashes: [],
      bets: [],
      wallet: null
    };
  }
  return usersDb[id];
}

// -------------------------------------------------------
// BONUS BENVENUTO
// -------------------------------------------------------
function applyWelcomeBonus(userId, depositAmount) {
  const user = getUser(userId);
  if (user.bonusUsed) return 0;

  const bonusAmount = Math.min(depositAmount, 100);
  user.bonusBalance += bonusAmount;
  user.bonusTarget = bonusAmount * 3; // wagering 3x
  user.bonusWagered = 0;
  user.bonusUsed = true;

  bot.sendMessage(userId,
    `🎁 *Bonus Benvenuto attivato!*\n\n` +
    `Hai ricevuto *${bonusAmount}€* di bonus!\n` +
    `Per sbloccarlo devi scommettere: *${user.bonusTarget}€*\n\n` +
    `Il bonus verrà aggiunto al tuo saldo prelevabile una volta completato il wagering.`,
    { parse_mode: 'Markdown' }
  );

  return bonusAmount;
}

// -------------------------------------------------------
// CONTROLLA DEPOSITI TON
// -------------------------------------------------------
async function checkDeposits(userId) {
  try {
    const response = await axios.get('https://toncenter.com/api/v2/getTransactions', {
      params: { address: MY_WALLET, limit: 20 }
    });

    const transactions = response.data.result;
    if (!transactions) return false;

    const user = getUser(userId);
    let depositFound = false;

    for (let tx of transactions) {
      const inMsg = tx.in_msg;
      if (!inMsg || !inMsg.message || !inMsg.value) continue;

      const memo = inMsg.message.trim();
      const txHash = tx.transaction_id.hash;
      const amountTon = parseInt(inMsg.value) / 1_000_000_000;

      const giaProcessata = user.processedHashes.includes(txHash);

      if (memo === String(userId) && !giaProcessata) {
        user.balance += amountTon;
        user.processedHashes.push(txHash);
        depositFound = true;

        // Applica bonus solo al primo deposito
        const bonus = applyWelcomeBonus(userId, amountTon);

        bot.sendMessage(userId,
          `✅ *Deposito confermato!*\n` +
          `+${amountTon.toFixed(2)} TON\n` +
          `💰 Saldo: ${user.balance.toFixed(2)} TON` +
          (bonus > 0 ? `\n🎁 Bonus: +${bonus.toFixed(2)} TON` : ''),
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
async function getSports() {
  try {
    const res = await axios.get(`https://api.the-odds-api.com/v4/sports/`, {
      params: { apiKey: ODDS_API_KEY }
    });
    // Filtriamo solo calcio e tennis
    return res.data.filter(s =>
      s.group === 'Soccer' || s.group === 'Tennis'
    );
  } catch (err) {
    console.error('[ERRORE ODDS API sports]', err.message);
    return [];
  }
}

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
    console.error('[ERRORE ODDS API odds]', err.message);
    return [];
  }
}

// -------------------------------------------------------
// BOT TELEGRAM
// -------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  getUser(chatId);

  bot.sendMessage(chatId,
    `🎰 *Benvenuto nella Bet App!*\n\n` +
    `🎁 Primo deposito? Ricevi il 100% di bonus fino a 100 TON!\n\n` +
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
  await checkDeposits(chatId);
  const user = getUser(chatId);
  bot.sendMessage(chatId,
    `💰 Saldo: *${user.balance.toFixed(2)} TON*\n` +
    `🎁 Bonus: *${user.bonusBalance.toFixed(2)} TON*`,
    { parse_mode: 'Markdown' }
  );
});

// -------------------------------------------------------
// API
// -------------------------------------------------------

app.get('/api/user/:id', async (req, res) => {
  const userId = req.params.id;
  const user = getUser(userId);
  await checkDeposits(userId);
  res.json({
    balance: user.balance,
    bonusBalance: user.bonusBalance,
    bonusWagered: user.bonusWagered,
    bonusTarget: user.bonusTarget,
    bonusUsed: user.bonusUsed,
    depositAddress: MY_WALLET,
    memo: userId,
    wallet: user.wallet
  });
});

// Sports disponibili
app.get('/api/sports', async (req, res) => {
  const sports = await getSports();
  res.json(sports);
});

// Quote per uno sport
app.get('/api/odds/:sportKey', async (req, res) => {
  const odds = await getOdds(req.params.sportKey);
  // Quota minima 1.30
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
});

// Piazza scommessa
app.post('/api/bet', (req, res) => {
  const { userId, amount, prediction, odds, matchId, useBonus } = req.body;

  if (!userId || !amount || !prediction || !odds) {
    return res.status(400).json({ error: 'Dati mancanti' });
  }

  const user = getUser(userId);

  if (amount <= 0) return res.json({ success: false, message: 'Importo non valido' });

  // Usa bonus o saldo normale
  if (useBonus && user.bonusBalance >= amount) {
    user.bonusBalance -= amount;
    user.bonusWagered += amount;

    // Controlla se wagering completato
    if (user.bonusWagered >= user.bonusTarget && user.bonusTarget > 0) {
      user.balance += user.bonusBalance;
      const sbloccato = user.bonusBalance;
      user.bonusBalance = 0;
      bot.sendMessage(userId,
        `🎉 *Wagering completato!*\n+${sbloccato.toFixed(2)} TON aggiunti al saldo!`,
        { parse_mode: 'Markdown' }
      );
    }
  } else if (user.balance >= amount) {
    user.balance -= amount;
    if (user.bonusUsed && user.bonusWagered < user.bonusTarget) {
      user.bonusWagered += amount;
    }
  } else {
    return res.json({ success: false, message: 'Saldo insufficiente' });
  }

  const bet = {
    id: Date.now(),
    userId,
    amount,
    prediction,
    odds,
    matchId,
    status: 'pending',
    date: new Date().toLocaleString('it-IT'),
    potentialWin: (amount * odds).toFixed(2)
  };

  user.bets.push(bet);
  betsDb.push(bet);

  res.json({ success: true, newBalance: user.balance, newBonus: user.bonusBalance, bet });
});

// Richiesta prelievo
app.post('/api/withdraw', (req, res) => {
  const { userId, amount, wallet } = req.body;
  const user = getUser(userId);

  if (!wallet) return res.json({ success: false, message: 'Inserisci wallet TON' });
  if (amount <= 0) return res.json({ success: false, message: 'Importo non valido' });
  if (user.balance < amount) return res.json({ success: false, message: 'Saldo insufficiente' });

  user.wallet = wallet;
  user.balance -= amount;

  const withdrawal = {
    id: Date.now(),
    userId,
    amount,
    wallet,
    status: 'pending',
    date: new Date().toLocaleString('it-IT')
  };

  withdrawalsDb.push(withdrawal);

  // Notifica admin (te)
  const ADMIN_ID = process.env.ADMIN_ID;
  if (ADMIN_ID) {
    bot.sendMessage(ADMIN_ID,
      `💸 *Nuova richiesta prelievo!*\n\n` +
      `👤 Utente: ${userId}\n` +
      `💰 Importo: ${amount} TON\n` +
      `👛 Wallet: \`${wallet}\``,
      { parse_mode: 'Markdown' }
    );
  }

  res.json({ success: true, message: 'Richiesta inviata! Elaboreremo entro 24h.' });
});

// Admin — vedi prelievi pendenti
app.get('/api/admin/withdrawals', (req, res) => {
  res.json(withdrawalsDb.filter(w => w.status === 'pending'));
});

// Admin — vedi tutti gli utenti
app.get('/api/admin/users', (req, res) => {
  res.json(usersDb);
});

app.listen(PORT, () => {
  console.log(`✅ Backend attivo su http://localhost:${PORT}`);
  console.log(`🔑 Bot token: ${TOKEN ? 'caricato' : '⚠️ MANCANTE'}`);
  console.log(`💳 Wallet: ${MY_WALLET || '⚠️ MANCANTE'}`);
  console.log(`🎲 Odds API: ${ODDS_API_KEY ? 'caricata' : '⚠️ MANCANTE'}`);
});
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const TOKEN = process.env.BOT_TOKEN;
const MY_WALLET = process.env.MY_WALLET;
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// -------------------------------------------------------
// DATABASE IN MEMORIA (si azzera al riavvio, ok per test)
// -------------------------------------------------------
// Struttura:
// usersDb[userId] = { balance: 0, processedHashes: [], bets: [] }
let usersDb = {};

function getUser(userId) {
  const id = String(userId);
  if (!usersDb[id]) {
    usersDb[id] = { balance: 0, processedHashes: [], bets: [] };
  }
  return usersDb[id];
}

// -------------------------------------------------------
// VERIFICA FIRMA TELEGRAM (sicurezza)
// -------------------------------------------------------
function verifyTelegramData(initData) {
  try {
    if (!initData) return false;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return hash === expectedHash;
  } catch {
    return false;
  }
}

// -------------------------------------------------------
// CONTROLLA DEPOSITI SULLA BLOCKCHAIN TON
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

        bot.sendMessage(userId,
          `✅ Deposito confermato!\n` +
          `+${amountTon.toFixed(2)} TON\n` +
          `💰 Saldo attuale: ${user.balance.toFixed(2)} TON`
        );

        console.log(`[DEPOSITO] Utente ${userId} → +${amountTon} TON (hash: ${txHash})`);
      }
    }

    return depositFound;
  } catch (err) {
    console.error('[ERRORE TON API]', err.message);
    return false;
  }
}

// -------------------------------------------------------
// BOT TELEGRAM — COMANDI
// -------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  getUser(chatId); // crea utente se non esiste

  bot.sendMessage(chatId,
    `🎰 *Benvenuto nella Bet App!*\n\n` +
    `Qui puoi scommettere con i tuoi amici usando TON.\n\n` +
    `Clicca il bottone qui sotto per aprire l'app.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🔥 Apri App Scommesse',
            web_app: { url: process.env.FRONTEND_URL }
          }
        ]]
      }
    }
  );
});

bot.onText(/\/saldo/, async (msg) => {
  const chatId = msg.chat.id;
  await checkDeposits(chatId);
  const user = getUser(chatId);
  bot.sendMessage(chatId, `💰 Il tuo saldo è: *${user.balance.toFixed(2)} TON*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/scommesse/, (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);

  if (user.bets.length === 0) {
    return bot.sendMessage(chatId, 'Non hai ancora piazzato scommesse.');
  }

  const lista = user.bets.map((b, i) =>
    `${i + 1}. ${b.prediction} — ${b.amount} TON (${b.date})`
  ).join('\n');

  bot.sendMessage(chatId, `📋 *Le tue scommesse:*\n\n${lista}`, { parse_mode: 'Markdown' });
});

// -------------------------------------------------------
// API REST — usate dal frontend React
// -------------------------------------------------------

// GET /api/user/:id — dati utente + controlla nuovi depositi
app.get('/api/user/:id', async (req, res) => {
  const userId = req.params.id;
  const user = getUser(userId);

  await checkDeposits(userId);

  res.json({
    balance: user.balance,
    depositAddress: MY_WALLET,
    memo: userId,
    betsCount: user.bets.length
  });
});

// POST /api/bet — piazza una scommessa
app.post('/api/bet', (req, res) => {
  const { userId, amount, prediction, initData } = req.body;

  // --- Decommenta questa riga quando vai in produzione ---
  // if (!verifyTelegramData(initData)) return res.status(401).json({ error: 'Non autorizzato' });

  if (!userId || !amount || !prediction) {
    return res.status(400).json({ error: 'Dati mancanti' });
  }

  const user = getUser(userId);

  if (amount <= 0) {
    return res.json({ success: false, message: 'Importo non valido' });
  }

  if (user.balance < amount) {
    return res.json({ success: false, message: 'Saldo insufficiente' });
  }

  user.balance -= amount;
  user.bets.push({
    prediction,
    amount,
    date: new Date().toLocaleString('it-IT')
  });

  console.log(`[BET] Utente ${userId} → ${amount} TON su "${prediction}" | Saldo rimasto: ${user.balance.toFixed(2)}`);

  res.json({ success: true, newBalance: user.balance });
});

// GET /api/admin — vedi tutti gli utenti (solo per debug locale)
app.get('/api/admin', (req, res) => {
  res.json(usersDb);
});

// -------------------------------------------------------
// AVVIO SERVER
// -------------------------------------------------------
// Servi il frontend dal backend
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.listen(PORT, () => {
  console.log(`✅ Backend attivo su http://localhost:${PORT}`);
  console.log(`🔑 Bot token: ${TOKEN ? 'caricato' : '⚠️ MANCANTE'}`);
  console.log(`💳 Wallet: ${MY_WALLET ? MY_WALLET : '⚠️ MANCANTE'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || '⚠️ non impostato'}`);
});
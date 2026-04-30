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
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connesso'))
  .catch(err => console.error('❌ MongoDB errore:', err.message));

// -------------------------------------------------------
// MODELLI
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
  homeTeam: String,
  awayTeam: String,
  commenceTime: Date,
  useBonus: Boolean,
  status: { type: String, default: 'pending' }, // pending, won, lost
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
// SETUP
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
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
// -------------------------------------------------------
// FUNZIONI UTILI
// -------------------------------------------------------
async function getUser(userId) {
  const id = String(userId);
  let user = await User.findOne({ telegramId: id });
  if (!user) user = await User.create({ telegramId: id });
  return user;
}

async function applyWelcomeBonus(userId, depositAmount) {
  const user = await getUser(userId);
  if (user.bonusUsed) return 0;
  const bonusAmount = Math.min(depositAmount, 200);
  user.bonusBalance += bonusAmount;
  user.bonusTarget = depositAmount + bonusAmount;
  user.bonusWagered = 0;
  user.bonusUsed = true;
  await user.save();
  bot.sendMessage(userId,
    `🎁 *Bonus Benvenuto attivato!*\n+${bonusAmount}€ di bonus!\nWagering richiesto: *${user.bonusTarget}€* su quote ≥1.30`,
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
    let found = false;
    for (let tx of transactions) {
      const inMsg = tx.in_msg;
      if (!inMsg || !inMsg.message || !inMsg.value) continue;
      const memo = inMsg.message.trim();
      const txHash = tx.transaction_id.hash;
      const amount = parseInt(inMsg.value) / 1_000_000_000;
      if (memo === String(userId) && !user.processedHashes.includes(txHash)) {
        user.balance += amount;
        user.processedHashes.push(txHash);
        found = true;
        await user.save();
        const bonus = await applyWelcomeBonus(userId, amount);
        bot.sendMessage(userId,
          `✅ *Deposito confermato!* +${amount.toFixed(2)}€\n💰 Saldo: ${user.balance.toFixed(2)}€` +
          (bonus > 0 ? `\n🎁 Bonus: +${bonus.toFixed(2)}€` : ''),
          { parse_mode: 'Markdown' }
        );
      }
    }
    return found;
  } catch (err) {
    console.error('[TON API]', err.message);
    return false;
  }
}

// -------------------------------------------------------
// RISULTATI AUTOMATICI
// -------------------------------------------------------
async function checkAndSettleBets() {
  try {
    console.log('[RISULTATI] Controllo scommesse pendenti...');
    const pendingBets = await Bet.find({ status: 'pending' });
    if (pendingBets.length === 0) return;

    // Raggruppa per sport (estraiamo dai matchId)
    const sports = [
      'soccer_serie_a', 'soccer_epl', 'soccer_spain_la_liga',
      'soccer_germany_bundesliga', 'soccer_france_ligue_one',
      'soccer_uefa_champs_league', 'soccer_italy_serie_b',
      'soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga',
      'soccer_turkey_super_league'
    ];

    for (const sport of sports) {
      try {
        const res = await axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/scores/`, {
          params: {
            apiKey: ODDS_API_KEY,
            daysFrom: 3
          }
        });

        const scores = res.data;

        for (const score of scores) {
          if (!score.completed) continue;

          // Trova scommesse su questa partita
          const bets = pendingBets.filter(b => b.matchId === score.id);
          if (bets.length === 0) continue;

          // Determina vincitore
          const home = score.scores?.find(s => s.name === score.home_team);
          const away = score.scores?.find(s => s.name === score.away_team);

          if (!home || !away) continue;

          const homeScore = parseInt(home.score);
          const awayScore = parseInt(away.score);

          let winner = null;
          if (homeScore > awayScore) winner = score.home_team;
          else if (awayScore > homeScore) winner = score.away_team;
          else winner = 'Draw';

          console.log(`[RISULTATI] ${score.home_team} ${homeScore}-${awayScore} ${score.away_team} → Vincitore: ${winner}`);

          // Liquida ogni scommessa
          for (const bet of bets) {
            const user = await getUser(bet.userId);
            const won = bet.prediction === winner ||
              (bet.prediction === 'Draw' && winner === 'Draw');

            if (won) {
              const vincita = bet.potentialWin;
              user.balance += vincita;
              await user.save();

              bet.status = 'won';
              await bet.save();

              bot.sendMessage(bet.userId,
                `🎉 *Hai vinto!*\n\n` +
                `⚽ ${bet.homeTeam} vs ${bet.awayTeam}\n` +
                `✅ Risultato: ${homeScore}-${awayScore}\n` +
                `💰 Vincita: +${vincita.toFixed(2)}€\n` +
                `💳 Saldo attuale: ${user.balance.toFixed(2)}€`,
                { parse_mode: 'Markdown' }
              );
            } else {
              bet.status = 'lost';
              await bet.save();

              bot.sendMessage(bet.userId,
                `😔 *Scommessa persa*\n\n` +
                `⚽ ${bet.homeTeam} vs ${bet.awayTeam}\n` +
                `❌ Risultato: ${homeScore}-${awayScore}\n` +
                `📊 Saldo attuale: ${user.balance.toFixed(2)}€`,
                { parse_mode: 'Markdown' }
              );
            }
          }
        }
      } catch (err) {
        console.error(`[RISULTATI] Errore sport ${sport}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[RISULTATI] Errore generale:', err.message);
  }
}

// Controlla risultati ogni ora
setInterval(checkAndSettleBets, 60 * 60 * 1000);
// Anche subito all'avvio
setTimeout(checkAndSettleBets, 10000);

// -------------------------------------------------------
// BOT TELEGRAM
// -------------------------------------------------------
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await getUser(chatId);
  bot.sendMessage(chatId,
    `🎰 *Benvenuto nella Bet App!*\n\n🎁 Primo deposito? Ricevi il *100% di bonus fino a 200€*!`,
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
    `🆘 *Supporto BetZone*\n\n` +
    `Per accreditare un deposito inviaci:\n\n` +
    `1️⃣ La crypto usata (USDT/USDC/BTC/ETH)\n` +
    `2️⃣ L'importo inviato\n` +
    `3️⃣ L'hash della transazione\n\n` +
    `✅ Accrediteremo il saldo entro 30-60 minuti.\n\n` +
    `📩 Contatto admin: @thecrowreal`,
    { parse_mode: 'Markdown' }
  );
});

// -------------------------------------------------------
// API REST
// -------------------------------------------------------

app.get('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    await getUser(userId);
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
    const res2 = await axios.get(`https://api.the-odds-api.com/v4/sports/${req.params.sportKey}/odds/`, {
      params: { apiKey: ODDS_API_KEY, regions: 'eu', markets: 'h2h', oddsFormat: 'decimal' }
    });
    const filtered = res2.data.map(game => ({
      ...game,
      bookmakers: game.bookmakers.map(bm => ({
        ...bm,
        markets: bm.markets.map(market => ({
          ...market,
          outcomes: market.outcomes.map(o => ({ ...o, price: Math.max(o.price, 1.30) }))
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
    const { userId, amount, prediction, odds, matchId, homeTeam, awayTeam, commenceTime, useBonus } = req.body;
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
        bot.sendMessage(userId, `🎉 *Wagering completato!* +${sbloccato.toFixed(2)}€ sbloccati!`, { parse_mode: 'Markdown' });
      }
    } else if (user.balance >= amount) {
      user.balance -= amount;
      if (user.bonusUsed && user.bonusWagered < user.bonusTarget) {
        user.bonusWagered += amount;
        if (user.bonusWagered >= user.bonusTarget) {
          const sbloccato = user.bonusBalance;
          user.balance += sbloccato;
          user.bonusBalance = 0;
          bot.sendMessage(userId, `🎉 *Wagering completato!* +${sbloccato.toFixed(2)}€ sbloccati!`, { parse_mode: 'Markdown' });
        }
      }
    } else {
      return res.json({ success: false, message: 'Saldo insufficiente' });
    }

    await user.save();

    const bet = await Bet.create({
      userId, amount, prediction, odds, matchId,
      homeTeam, awayTeam, commenceTime,
      useBonus, potentialWin: amount * odds
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
        `💸 *Nuova richiesta prelievo!*\n👤 Utente: ${userId}\n💰 Importo: ${amount}€\n👛 Wallet: \`${wallet}\``,
        { parse_mode: 'Markdown' }
      );
    }
    res.json({ success: true, message: 'Richiesta inviata! Elaboreremo entro 24h.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// ADMIN API
// -------------------------------------------------------

// Middleware admin
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Non autorizzato' });
  next();
}

// Carica saldo manuale
app.post('/api/admin/credit', adminAuth, async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const user = await getUser(userId);
    user.balance += amount;
    await user.save();
    bot.sendMessage(userId,
      `✅ *Deposito accreditato!*\n+${amount}€\n💰 Saldo: ${user.balance.toFixed(2)}€\n${note ? `📝 ${note}` : ''}`,
      { parse_mode: 'Markdown' }
    );
    res.json({ success: true, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista utenti
app.get('/api/admin/users', adminAuth, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

// Lista prelievi pendenti
app.get('/api/admin/withdrawals', adminAuth, async (req, res) => {
  const w = await Withdrawal.find({ status: 'pending' }).sort({ date: -1 });
  res.json(w);
});

// Conferma prelievo
app.post('/api/admin/withdrawal/confirm', adminAuth, async (req, res) => {
  const { withdrawalId } = req.body;
  const w = await Withdrawal.findByIdAndUpdate(withdrawalId, { status: 'completed' }, { new: true });
  bot.sendMessage(w.userId, `✅ *Prelievo confermato!*\n💸 ${w.amount}€ inviati a \`${w.wallet}\``, { parse_mode: 'Markdown' });
  res.json({ success: true });
});

// Lista scommesse
app.get('/api/admin/bets', adminAuth, async (req, res) => {
  const bets = await Bet.find().sort({ date: -1 }).limit(100);
  res.json(bets);
});

// Forza controllo risultati
app.post('/api/admin/settle', adminAuth, async (req, res) => {
  await checkAndSettleBets();
  res.json({ success: true, message: 'Controllo risultati completato' });
});

app.listen(PORT, () => {
  console.log(`✅ Backend attivo su http://localhost:${PORT}`);
  console.log(`🔑 Bot token: ${TOKEN ? 'caricato' : '⚠️ MANCANTE'}`);
  console.log(`💳 Wallet: ${MY_WALLET || '⚠️ MANCANTE'}`);
  console.log(`🎲 Odds API: ${ODDS_API_KEY ? 'caricata' : '⚠️ MANCANTE'}`);
  console.log(`🗄️ MongoDB: connecting...`);
});
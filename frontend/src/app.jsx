import React from 'react';
import { useEffect, useState } from 'react';
import axios from 'axios';

// ⚠️ Cambia questo URL con quello ngrok del backend quando usi Telegram
// Per test nel browser lascia localhost
const API_URL = 'https://betting-app-9lkg.onrender.com';

// Partite disponibili (le puoi cambiare a mano)
const PARTITE = [
  {
    id: 1,
    label: 'T1 vs G2',
    opzioni: [
      { team: 'T1', moltiplicatore: 1.5, colore: '#1d4ed8' },
      { team: 'G2', moltiplicatore: 2.0, colore: '#ea580c' },
    ]
  },
  {
    id: 2,
    label: 'NaVi vs FaZe',
    opzioni: [
      { team: 'NaVi', moltiplicatore: 1.8, colore: '#15803d' },
      { team: 'FaZe', moltiplicatore: 1.9, colore: '#b91c1c' },
    ]
  }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [betAmount, setBetAmount] = useState(0.1);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'ok' o 'err'
  const [tab, setTab] = useState('scommetti'); // 'scommetti' o 'deposita'

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand(); // apre la mini app a schermo intero
    }

    // Prende l'ID reale da Telegram, altrimenti usa uno finto per i test browser
    const userId = tg?.initDataUnsafe?.user?.id || '999999999';
    caricaUtente(userId);
  }, []);

  const caricaUtente = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/api/user/${id}`);
      setUser({ ...res.data, id: String(id) });
    } catch {
      mostraMessaggio('❌ Impossibile connettersi al server', 'err');
    } finally {
      setLoading(false);
    }
  };

  const aggiornaSaldo = () => {
    if (!user) return;
    setLoading(true);
    caricaUtente(user.id);
  };

  const mostraMessaggio = (testo, tipo = 'ok') => {
    setMessage(testo);
    setMessageType(tipo);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleBet = async (team) => {
    if (!user) return;

    if (betAmount <= 0) {
      return mostraMessaggio('⚠️ Inserisci un importo valido', 'err');
    }

    if (betAmount > user.balance) {
      return mostraMessaggio('⚠️ Saldo insufficiente', 'err');
    }

    try {
      const res = await axios.post(`${API_URL}/api/bet`, {
        userId: user.id,
        amount: betAmount,
        prediction: team,
        initData: window.Telegram?.WebApp?.initData || ''
      });

      if (res.data.success) {
        setUser(prev => ({ ...prev, balance: res.data.newBalance }));
        mostraMessaggio(`✅ Scommessa piazzata: ${betAmount} TON su ${team}`, 'ok');
      } else {
        mostraMessaggio(`❌ ${res.data.message}`, 'err');
      }
    } catch {
      mostraMessaggio('❌ Errore di connessione', 'err');
    }
  };

  // -------------------------------------------------------
  // LOADING
  // -------------------------------------------------------
  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner}>⏳</div>
        <p>Caricamento...</p>
      </div>
    );
  }

  // -------------------------------------------------------
  // UI PRINCIPALE
  // -------------------------------------------------------
  return (
    <div style={s.page}>

      {/* HEADER */}
      <div style={s.header}>
        <span style={s.logo}>🏆 Bet App</span>
        <div style={s.saldoBadge}>
          💰 {user?.balance?.toFixed(2)} TON
        </div>
      </div>

      {/* TAB NAV */}
      <div style={s.tabs}>
        <button
          style={{ ...s.tab, ...(tab === 'scommetti' ? s.tabActive : {}) }}
          onClick={() => setTab('scommetti')}
        >
          🎯 Scommetti
        </button>
        <button
          style={{ ...s.tab, ...(tab === 'deposita' ? s.tabActive : {}) }}
          onClick={() => setTab('deposita')}
        >
          📥 Deposita
        </button>
      </div>

      {/* ---- TAB: SCOMMETTI ---- */}
      {tab === 'scommetti' && (
        <div>
          {/* Selettore importo */}
          <div style={s.card}>
            <p style={s.cardLabel}>Importo da scommettere</p>
            <div style={s.row}>
              <input
                type="number"
                value={betAmount}
                min="0.1"
                step="0.1"
                onChange={(e) => setBetAmount(Number(e.target.value))}
                style={s.input}
              />
              <span style={{ color: '#aaa' }}>TON</span>
            </div>
            {/* Scorciatoie rapide */}
            <div style={s.row}>
              {[0.1, 0.5, 1, 2].map(v => (
                <button key={v} style={s.chip} onClick={() => setBetAmount(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Partite */}
          {PARTITE.map(partita => (
            <div key={partita.id} style={s.card}>
              <p style={s.cardLabel}>⚔️ {partita.label}</p>
              <div style={s.row}>
                {partita.opzioni.map(opt => (
                  <button
                    key={opt.team}
                    style={{ ...s.btnBet, background: opt.colore }}
                    onClick={() => handleBet(opt.team)}
                  >
                    {opt.team}
                    <span style={s.molt}>x{opt.moltiplicatore}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- TAB: DEPOSITA ---- */}
      {tab === 'deposita' && (
        <div>
          <div style={s.card}>
            <p style={s.cardLabel}>Come ricaricare il saldo</p>
            <p style={s.small}>
              1. Apri <strong>Tonkeeper</strong> o qualsiasi wallet TON<br />
              2. Invia TON a questo indirizzo:<br />
            </p>
            <div style={s.addressBox}>{user?.depositAddress}</div>
            <button
              style={s.btnCopy}
              onClick={() => {
                navigator.clipboard.writeText(user.depositAddress);
                mostraMessaggio('📋 Indirizzo copiato!', 'ok');
              }}
            >
              📋 Copia indirizzo
            </button>

            <p style={{ ...s.small, marginTop: 16 }}>
              3. Nel campo <strong>Commento / Memo</strong> scrivi esattamente:
            </p>
            <div style={s.memoBox}>{user?.memo}</div>
            <button
              style={s.btnCopy}
              onClick={() => {
                navigator.clipboard.writeText(user.memo);
                mostraMessaggio('📋 Memo copiato!', 'ok');
              }}
            >
              📋 Copia memo
            </button>

            <p style={{ ...s.small, marginTop: 16, color: '#f87171' }}>
              ⚠️ Senza il memo corretto il deposito NON verrà accreditato.
            </p>
          </div>

          <div style={s.card}>
            <p style={s.cardLabel}>Saldo attuale</p>
            <p style={{ fontSize: 28, color: '#4ade80', margin: '8px 0' }}>
              {user?.balance?.toFixed(2)} TON
            </p>
            <button style={s.btnRefresh} onClick={aggiornaSaldo}>
              🔄 Controlla nuovo deposito
            </button>
          </div>
        </div>
      )}

      {/* MESSAGGIO FEEDBACK */}
      {message && (
        <div style={{
          ...s.toast,
          background: messageType === 'ok' ? '#15803d' : '#b91c1c'
        }}>
          {message}
        </div>
      )}

    </div>
  );
}

// -------------------------------------------------------
// STILI
// -------------------------------------------------------
const s = {
  page: {
    padding: '0 0 80px 0',
    fontFamily: 'Arial, sans-serif',
    background: '#0f172a',
    minHeight: '100vh',
    color: 'white',
  },
  center: {
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center', alignItems: 'center',
    height: '100vh', background: '#0f172a', color: 'white'
  },
  spinner: { fontSize: 40, marginBottom: 10 },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px',
    background: '#1e293b',
    borderBottom: '1px solid #334155'
  },
  logo: { fontSize: 18, fontWeight: 'bold' },
  saldoBadge: {
    background: '#065f46', color: '#4ade80',
    padding: '6px 12px', borderRadius: 20, fontSize: 14, fontWeight: 'bold'
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #334155',
    background: '#1e293b'
  },
  tab: {
    flex: 1, padding: '12px 0',
    background: 'transparent', color: '#94a3b8',
    border: 'none', cursor: 'pointer', fontSize: 14
  },
  tabActive: {
    color: 'white',
    borderBottom: '2px solid #3b82f6'
  },
  card: {
    background: '#1e293b',
    margin: '12px',
    borderRadius: 12,
    padding: 16,
    border: '1px solid #334155'
  },
  cardLabel: { fontWeight: 'bold', marginBottom: 10, color: '#cbd5e1', fontSize: 14 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  input: {
    width: 80, padding: '8px 10px',
    background: '#0f172a', color: 'white',
    border: '1px solid #475569', borderRadius: 8, fontSize: 16
  },
  chip: {
    padding: '6px 14px',
    background: '#334155', color: 'white',
    border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 13
  },
  btnBet: {
    flex: 1, padding: '14px 8px',
    color: 'white', border: 'none',
    borderRadius: 10, cursor: 'pointer',
    fontWeight: 'bold', fontSize: 15,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
  },
  molt: { fontSize: 11, opacity: 0.85 },
  addressBox: {
    background: '#0f172a', padding: 12,
    borderRadius: 8, fontSize: 11,
    wordBreak: 'break-all', color: '#94a3b8',
    border: '1px solid #334155', marginTop: 8
  },
  memoBox: {
    background: '#0f172a', padding: 12,
    borderRadius: 8, fontSize: 26,
    fontWeight: 'bold', color: '#facc15',
    textAlign: 'center', letterSpacing: 2,
    border: '1px solid #334155', marginTop: 8
  },
  btnCopy: {
    marginTop: 8, padding: '8px 16px',
    background: '#334155', color: 'white',
    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13
  },
  btnRefresh: {
    padding: '10px 20px',
    background: '#1d4ed8', color: 'white',
    border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 14, width: '100%'
  },
  small: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6 },
  toast: {
    position: 'fixed', bottom: 20, left: 16, right: 16,
    padding: '12px 16px', borderRadius: 10,
    textAlign: 'center', fontWeight: 'bold', fontSize: 14,
    zIndex: 999
  }
};
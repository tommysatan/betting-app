import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = 'https://betting-app-9lkg.onrender.com';

const SPORT_GROUPS = [
  { key: 'soccer_serie_a', label: '🇮🇹 Serie A' },
  { key: 'soccer_epl', label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  { key: 'soccer_spain_la_liga', label: '🇪🇸 La Liga' },
  { key: 'soccer_germany_bundesliga', label: '🇩🇪 Bundesliga' },
  { key: 'soccer_france_ligue_one', label: '🇫🇷 Ligue 1' },
  { key: 'soccer_uefa_champs_league', label: '🏆 Champions League' },
  { key: 'tennis_atp_french_open', label: '🎾 Tennis ATP' },
  { key: 'tennis_wta_french_open', label: '🎾 Tennis WTA' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('sport');
  const [selectedSport, setSelectedSport] = useState(null);
  const [odds, setOdds] = useState([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [betAmount, setBetAmount] = useState(0.1);
  const [useBonus, setUseBonus] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('ok');
  const [withdrawWallet, setWithdrawWallet] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState(0.1);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
    const userId = tg?.initDataUnsafe?.user?.id || '999999999';
    caricaUtente(userId);
  }, []);

  const caricaUtente = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/api/user/${id}`);
      setUser({ ...res.data, id: String(id) });
    } catch {
      mostraMsg('❌ Errore connessione server', 'err');
    } finally {
      setLoading(false);
    }
  };

  const mostraMsg = (testo, tipo = 'ok') => {
    setMessage(testo);
    setMessageType(tipo);
    setTimeout(() => setMessage(''), 4000);
  };

  const caricaOdds = async (sportKey) => {
    setSelectedSport(sportKey);
    setOddsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/odds/${sportKey}`);
      setOdds(res.data);
    } catch {
      mostraMsg('❌ Errore caricamento quote', 'err');
    } finally {
      setOddsLoading(false);
    }
  };

  const handleBet = async (match, outcome, oddValue) => {
    if (!user) return;
    if (oddValue < 1.30) return mostraMsg('⚠️ Quota minima 1.30', 'err');

    const saldoDisponibile = useBonus ? user.bonusBalance : user.balance;
    if (betAmount > saldoDisponibile) return mostraMsg('⚠️ Saldo insufficiente', 'err');

    try {
      const res = await axios.post(`${API_URL}/api/bet`, {
        userId: user.id,
        amount: betAmount,
        prediction: outcome,
        odds: oddValue,
        matchId: match.id,
        useBonus,
        initData: window.Telegram?.WebApp?.initData || ''
      });

      if (res.data.success) {
        setUser(prev => ({ ...prev, balance: res.data.newBalance, bonusBalance: res.data.newBonus }));
        mostraMsg(`✅ Scommesso ${betAmount} TON su ${outcome} @ ${oddValue}`, 'ok');
      } else {
        mostraMsg(`❌ ${res.data.message}`, 'err');
      }
    } catch {
      mostraMsg('❌ Errore connessione', 'err');
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawWallet) return mostraMsg('⚠️ Inserisci wallet TON', 'err');
    if (withdrawAmount <= 0) return mostraMsg('⚠️ Importo non valido', 'err');
    if (withdrawAmount > user.balance) return mostraMsg('⚠️ Saldo insufficiente', 'err');

    try {
      const res = await axios.post(`${API_URL}/api/withdraw`, {
        userId: user.id,
        amount: withdrawAmount,
        wallet: withdrawWallet
      });
      if (res.data.success) {
        setUser(prev => ({ ...prev, balance: prev.balance - withdrawAmount }));
        mostraMsg('✅ Richiesta prelievo inviata! Entro 24h.', 'ok');
      } else {
        mostraMsg(`❌ ${res.data.message}`, 'err');
      }
    } catch {
      mostraMsg('❌ Errore connessione', 'err');
    }
  };

  const wageringPercent = user?.bonusTarget > 0
    ? Math.min((user.bonusWagered / user.bonusTarget) * 100, 100)
    : 0;

  if (loading) return (
    <div style={s.center}>
      <p>⏳ Caricamento...</p>
    </div>
  );

  return (
    <div style={s.page}>

      {/* HEADER */}
      <div style={s.header}>
        <span style={s.logo}>🎰 Bet App</span>
        <div style={s.balances}>
          <span style={s.balBadge}>💰 {user?.balance?.toFixed(2)}</span>
          {user?.bonusBalance > 0 && (
            <span style={s.bonusBadge}>🎁 {user?.bonusBalance?.toFixed(2)}</span>
          )}
        </div>
      </div>

      {/* TABS */}
      <div style={s.tabs}>
        {['sport', 'bonus', 'deposita', 'preleva'].map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
            {t === 'sport' ? '⚽' : t === 'bonus' ? '🎁' : t === 'deposita' ? '📥' : '💸'}
            <span style={s.tabLabel}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* ---- TAB SPORT ---- */}
      {tab === 'sport' && (
        <div>
          {/* Importo e toggle bonus */}
          <div style={s.card}>
            <div style={s.row}>
              <span style={s.label}>Importo:</span>
              <input type="number" value={betAmount} min="0.1" step="0.1"
                onChange={e => setBetAmount(Number(e.target.value))} style={s.input} />
              <span style={{ color: '#aaa' }}>TON</span>
            </div>
            <div style={s.row}>
              {[0.1, 0.5, 1, 5].map(v => (
                <button key={v} style={s.chip} onClick={() => setBetAmount(v)}>{v}</button>
              ))}
            </div>
            {user?.bonusBalance > 0 && (
              <div style={s.row}>
                <label style={{ color: '#facc15', fontSize: 13 }}>
                  <input type="checkbox" checked={useBonus}
                    onChange={e => setUseBonus(e.target.checked)} />
                  {' '}Usa bonus (🎁 {user.bonusBalance.toFixed(2)} TON)
                </label>
              </div>
            )}
          </div>

          {/* Lista campionati */}
          {!selectedSport && (
            <div>
              <p style={s.sectionTitle}>Seleziona campionato:</p>
              {SPORT_GROUPS.map(sg => (
                <button key={sg.key} style={s.sportBtn} onClick={() => caricaOdds(sg.key)}>
                  {sg.label}
                </button>
              ))}
            </div>
          )}

          {/* Partite e quote */}
          {selectedSport && (
            <div>
              <button style={s.backBtn} onClick={() => { setSelectedSport(null); setOdds([]); }}>
                ← Torna ai campionati
              </button>

              {oddsLoading && <p style={s.center}>⏳ Caricamento quote...</p>}

              {!oddsLoading && odds.length === 0 && (
                <p style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>
                  Nessuna partita disponibile ora
                </p>
              )}

              {!oddsLoading && odds.map(match => {
                const bm = match.bookmakers?.[0];
                const market = bm?.markets?.[0];
                const outcomes = market?.outcomes || [];

                return (
                  <div key={match.id} style={s.card}>
                    <p style={s.matchTitle}>
                      {match.home_team} vs {match.away_team}
                    </p>
                    <p style={s.matchDate}>
                      {new Date(match.commence_time).toLocaleString('it-IT')}
                    </p>
                    <div style={s.row}>
                      {outcomes.map(outcome => (
                        <button
                          key={outcome.name}
                          style={{
                            ...s.oddBtn,
                            opacity: outcome.price < 1.30 ? 0.4 : 1
                          }}
                          onClick={() => handleBet(match, outcome.name, outcome.price)}
                          disabled={outcome.price < 1.30}
                        >
                          <span style={s.oddTeam}>{outcome.name === match.home_team ? '1' : outcome.name === match.away_team ? '2' : 'X'}</span>
                          <span style={s.oddValue}>{outcome.price.toFixed(2)}</span>
                          <span style={s.oddName}>{outcome.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- TAB BONUS ---- */}
      {tab === 'bonus' && (
        <div style={s.card}>
          {!user?.bonusUsed ? (
            <div>
              <p style={s.label}>🎁 Bonus Benvenuto</p>
              <p style={{ color: '#aaa', fontSize: 13 }}>
                Fai il tuo primo deposito e ricevi il 100% di bonus fino a 100 TON!
              </p>
              <p style={{ color: '#facc15', marginTop: 10 }}>
                Wagering richiesto: 3x il bonus
              </p>
            </div>
          ) : (
            <div>
              <p style={s.label}>🎁 Il tuo bonus</p>
              <p style={{ color: '#4ade80', fontSize: 22, fontWeight: 'bold' }}>
                {user.bonusBalance.toFixed(2)} TON
              </p>
              <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
                Wagering: {user.bonusWagered.toFixed(2)} / {user.bonusTarget.toFixed(2)} TON
              </p>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${wageringPercent}%` }} />
              </div>
              <p style={{ color: '#aaa', fontSize: 12, textAlign: 'right' }}>
                {wageringPercent.toFixed(0)}%
              </p>
              {wageringPercent >= 100 && (
                <p style={{ color: '#4ade80', fontWeight: 'bold', marginTop: 8 }}>
                  ✅ Wagering completato! Bonus sbloccato!
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- TAB DEPOSITA ---- */}
      {tab === 'deposita' && (
        <div>
          <div style={s.card}>
            <p style={s.label}>📥 Come depositare</p>
            <p style={s.small}>1. Apri Tonkeeper o qualsiasi wallet TON</p>
            <p style={s.small}>2. Invia TON a questo indirizzo:</p>
            <div style={s.addressBox}>{user?.depositAddress}</div>
            <button style={s.btnCopy} onClick={() => {
              navigator.clipboard.writeText(user.depositAddress);
              mostraMsg('📋 Indirizzo copiato!');
            }}>📋 Copia indirizzo</button>
            <p style={{ ...s.small, marginTop: 12 }}>3. Inserisci questo MEMO obbligatorio:</p>
            <div style={s.memoBox}>{user?.memo}</div>
            <button style={s.btnCopy} onClick={() => {
              navigator.clipboard.writeText(user.memo);
              mostraMsg('📋 Memo copiato!');
            }}>📋 Copia memo</button>
            <p style={{ ...s.small, color: '#f87171', marginTop: 12 }}>
              ⚠️ Senza memo il deposito NON verrà accreditato!
            </p>
          </div>
          <div style={s.card}>
            <p style={s.label}>Saldo attuale</p>
            <p style={{ fontSize: 26, color: '#4ade80' }}>{user?.balance?.toFixed(2)} TON</p>
            <button style={s.btnBlue} onClick={() => caricaUtente(user.id)}>🔄 Aggiorna saldo</button>
          </div>
        </div>
      )}

      {/* ---- TAB PRELEVA ---- */}
      {tab === 'preleva' && (
        <div>
          <div style={s.card}>
            <p style={s.label}>💸 Richiedi prelievo</p>
            <p style={s.small}>Saldo disponibile: <strong style={{ color: '#4ade80' }}>{user?.balance?.toFixed(2)} TON</strong></p>
            <p style={{ ...s.small, marginTop: 12 }}>Il tuo wallet TON:</p>
            <input
              type="text"
              placeholder="Incolla qui il tuo indirizzo TON"
              value={withdrawWallet}
              onChange={e => setWithdrawWallet(e.target.value)}
              style={s.inputWide}
            />
            <p style={{ ...s.small, marginTop: 12 }}>Importo da prelevare (TON):</p>
            <div style={s.row}>
              <input type="number" value={withdrawAmount} min="0.1" step="0.1"
                onChange={e => setWithdrawAmount(Number(e.target.value))} style={s.input} />
              <button style={s.chip} onClick={() => setWithdrawAmount(user.balance)}>Max</button>
            </div>
            <button style={{ ...s.btnBlue, marginTop: 16 }} onClick={handleWithdraw}>
              💸 Richiedi prelievo
            </button>
            <p style={{ ...s.small, marginTop: 12, color: '#facc15' }}>
              ⚠️ I prelievi vengono elaborati entro 24h
            </p>
          </div>
        </div>
      )}

      {/* TOAST */}
      {message && (
        <div style={{ ...s.toast, background: messageType === 'ok' ? '#15803d' : '#b91c1c' }}>
          {message}
        </div>
      )}

    </div>
  );
}

const s = {
  page: { padding: '0 0 80px 0', fontFamily: 'Arial', background: '#0f172a', minHeight: '100vh', color: 'white' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: 'white' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#1e293b', borderBottom: '1px solid #334155' },
  logo: { fontSize: 18, fontWeight: 'bold' },
  balances: { display: 'flex', gap: 8 },
  balBadge: { background: '#065f46', color: '#4ade80', padding: '4px 10px', borderRadius: 20, fontSize: 13, fontWeight: 'bold' },
  bonusBadge: { background: '#713f12', color: '#facc15', padding: '4px 10px', borderRadius: 20, fontSize: 13, fontWeight: 'bold' },
  tabs: { display: 'flex', background: '#1e293b', borderBottom: '1px solid #334155' },
  tab: { flex: 1, padding: '10px 4px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  tabActive: { color: 'white', borderBottom: '2px solid #3b82f6' },
  tabLabel: { fontSize: 10 },
  card: { background: '#1e293b', margin: '12px', borderRadius: 12, padding: 16, border: '1px solid #334155' },
  label: { fontWeight: 'bold', marginBottom: 10, color: '#cbd5e1', fontSize: 14 },
  sectionTitle: { color: '#94a3b8', fontSize: 13, padding: '8px 16px' },
  sportBtn: { display: 'block', width: 'calc(100% - 24px)', margin: '6px 12px', padding: '14px 16px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: 15 },
  backBtn: { margin: '8px 12px', padding: '8px 16px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  matchTitle: { fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  matchDate: { color: '#94a3b8', fontSize: 11, marginBottom: 10 },
  oddBtn: { flex: 1, padding: '10px 4px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  oddTeam: { fontSize: 16, fontWeight: 'bold', color: '#3b82f6' },
  oddValue: { fontSize: 18, fontWeight: 'bold', color: '#4ade80' },
  oddName: { fontSize: 9, color: '#94a3b8', textAlign: 'center' },
  progressBar: { background: '#334155', borderRadius: 10, height: 12, marginTop: 8, overflow: 'hidden' },
  progressFill: { background: '#3b82f6', height: '100%', borderRadius: 10, transition: 'width 0.3s' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  input: { width: 70, padding: '8px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: 8, fontSize: 16 },
  inputWide: { width: '100%', padding: '10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: 8, fontSize: 13, marginTop: 6, boxSizing: 'border-box' },
  chip: { padding: '6px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  btnBlue: { width: '100%', padding: 12, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  btnCopy: { marginTop: 8, padding: '8px 16px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  addressBox: { background: '#0f172a', padding: 10, borderRadius: 8, fontSize: 11, wordBreak: 'break-all', color: '#94a3b8', border: '1px solid #334155', marginTop: 8 },
  memoBox: { background: '#0f172a', padding: 10, borderRadius: 8, fontSize: 26, fontWeight: 'bold', color: '#facc15', textAlign: 'center', border: '1px solid #334155', marginTop: 8 },
  small: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6 },
  toast: { position: 'fixed', bottom: 20, left: 16, right: 16, padding: '12px 16px', borderRadius: 10, textAlign: 'center', fontWeight: 'bold', fontSize: 14, zIndex: 999 }
};
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
  { key: 'soccer_italy_serie_b', label: '🇮🇹 Serie B' },
  { key: 'soccer_netherlands_eredivisie', label: '🇳🇱 Eredivisie' },
  { key: 'soccer_portugal_primeira_liga', label: '🇵🇹 Primeira Liga' },
  { key: 'tennis_atp_french_open', label: '🎾 Tennis ATP' },
  { key: 'tennis_wta_french_open', label: '🎾 Tennis WTA' },
];

const CRYPTO_METHODS = [
  { symbol: 'TON', name: 'TON', icon: '💎', color: '#0088cc', desc: 'Accredito istantaneo' },
  { symbol: 'USDT', name: 'Tether', icon: '💵', color: '#26a17b', desc: 'TRC20 / ERC20' },
  { symbol: 'USDC', name: 'USD Coin', icon: '🔵', color: '#2775ca', desc: 'ERC20 / Solana' },
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: '#f7931a', desc: '~30 min conferma' },
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: '#627eea', desc: 'ERC20' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('sport');
  const [selectedSport, setSelectedSport] = useState(null);
  const [odds, setOdds] = useState([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [betAmount, setBetAmount] = useState(0.1);
  const [useBonus, setUseBonus] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('ok');
  const [withdrawWallet, setWithdrawWallet] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState(0.1);
  const [selectedCrypto, setSelectedCrypto] = useState('TON');
  const [showBonusModal, setShowBonusModal] = useState(false);

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
      if (!res.data.bonusUsed) setShowBonusModal(true);
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
    setSearchQuery('');
    try {
      const res = await axios.get(`${API_URL}/api/odds/${sportKey}`);
      setOdds(res.data);
    } catch {
      mostraMsg('❌ Errore caricamento quote', 'err');
    } finally {
      setOddsLoading(false);
    }
  };

  const filteredOdds = odds.filter(match =>
    match.home_team.toLowerCase().includes(searchQuery.toLowerCase()) ||
    match.away_team.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        mostraMsg(`✅ Scommessa: ${betAmount} TON su ${outcome} @ ${oddValue}`, 'ok');
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
        userId: user.id, amount: withdrawAmount, wallet: withdrawWallet
      });
      if (res.data.success) {
        setUser(prev => ({ ...prev, balance: prev.balance - withdrawAmount }));
        mostraMsg('✅ Richiesta inviata! Entro 24h.', 'ok');
      } else {
        mostraMsg(`❌ ${res.data.message}`, 'err');
      }
    } catch {
      mostraMsg('❌ Errore connessione', 'err');
    }
  };

  const wageringPercent = user?.bonusTarget > 0
    ? Math.min((user.bonusWagered / user.bonusTarget) * 100, 100) : 0;

  if (loading) return <div style={s.center}><p>⏳ Caricamento...</p></div>;

  return (
    <div style={s.page}>

      {/* MODAL BONUS BENVENUTO */}
      {showBonusModal && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalIcon}>🎁</div>
            <h2 style={s.modalTitle}>Bonus Benvenuto</h2>
            <p style={s.modalSubtitle}>100% fino a 100 TON</p>
            <div style={s.modalBody}>
              <p style={s.modalText}>✅ Deposita e ricevi il doppio</p>
              <p style={s.modalText}>✅ Usa il bonus subito sulle scommesse</p>
              <p style={s.modalText}>✅ Quota minima: <strong style={{color:'#facc15'}}>1.30</strong></p>
              <p style={s.modalText}>✅ Wagering: gioca <strong style={{color:'#facc15'}}>deposito + bonus x1</strong> per sbloccare</p>
            </div>
            <div style={s.modalCondizioni}>
              <p style={s.modalSmall}>📋 Condizioni: Il bonus viene erogato automaticamente sul primo deposito. Per renderlo prelevabile è necessario giocare l'importo totale (deposito + bonus) almeno una volta su quote minime di 1.30. Es: depositi 50 TON → ricevi 50 TON bonus → devi giocare 100 TON totali su quote ≥1.30.</p>
            </div>
            <button style={s.modalBtn} onClick={() => { setShowBonusModal(false); setTab('deposita'); }}>
              💰 Deposita ora
            </button>
            <button style={s.modalBtnSecondary} onClick={() => setShowBonusModal(false)}>
              Chiudi
            </button>
          </div>
        </div>
      )}

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

      {/* BANNER BONUS (se non ancora usato) */}
      {!user?.bonusUsed && (
        <div style={s.bonusBanner} onClick={() => setShowBonusModal(true)}>
          <span>🎁 <strong>Bonus Benvenuto 100%</strong> fino a 100 TON!</span>
          <span style={s.bannerArrow}>→</span>
        </div>
      )}

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
              <div style={{ ...s.row, marginTop: 10 }}>
                <label style={{ color: '#facc15', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={useBonus} onChange={e => setUseBonus(e.target.checked)} />
                  Usa bonus (🎁 {user.bonusBalance.toFixed(2)} TON)
                </label>
              </div>
            )}
          </div>

          {!selectedSport && (
            <div>
              <p style={s.sectionTitle}>⚽ Seleziona campionato:</p>
              {SPORT_GROUPS.map(sg => (
                <button key={sg.key} style={s.sportBtn} onClick={() => caricaOdds(sg.key)}>
                  {sg.label} <span style={{ float: 'right', color: '#94a3b8' }}>›</span>
                </button>
              ))}
            </div>
          )}

          {selectedSport && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <button style={s.backBtn} onClick={() => { setSelectedSport(null); setOdds([]); setSearchQuery(''); }}>
                  ← Indietro
                </button>
                <input
                  type="text"
                  placeholder="🔍 Cerca squadra..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={s.searchInput}
                />
              </div>

              {oddsLoading && <p style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>⏳ Caricamento quote...</p>}

              {!oddsLoading && filteredOdds.length === 0 && (
                <p style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>
                  {searchQuery ? '🔍 Nessun risultato' : 'Nessuna partita disponibile'}
                </p>
              )}

              {!oddsLoading && filteredOdds.map(match => {
                const bm = match.bookmakers?.[0];
                const market = bm?.markets?.[0];
                const outcomes = market?.outcomes || [];
                return (
                  <div key={match.id} style={s.card}>
                    <p style={s.matchTitle}>{match.home_team} vs {match.away_team}</p>
                    <p style={s.matchDate}>{new Date(match.commence_time).toLocaleString('it-IT')}</p>
                    <div style={s.row}>
                      {outcomes.map(outcome => (
                        <button key={outcome.name}
                          style={{ ...s.oddBtn, opacity: outcome.price < 1.30 ? 0.4 : 1 }}
                          onClick={() => handleBet(match, outcome.name, outcome.price)}
                          disabled={outcome.price < 1.30}>
                          <span style={s.oddTeam}>
                            {outcome.name === match.home_team ? '1' : outcome.name === match.away_team ? '2' : 'X'}
                          </span>
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
        <div>
          {/* Banner bonus */}
          {!user?.bonusUsed && (
            <div style={s.bonusBannerLarge}>
              <div style={s.bonusIconLarge}>🎁</div>
              <h3 style={{ margin: '8px 0 4px', color: 'white' }}>Bonus Benvenuto 100%</h3>
              <p style={{ color: '#facc15', fontSize: 20, fontWeight: 'bold', margin: '4px 0' }}>fino a 100 TON</p>
              <button style={s.modalBtn} onClick={() => { setTab('deposita'); }}>
                💰 Deposita ora e attiva il bonus
              </button>
            </div>
          )}

          <div style={s.card}>
            <p style={s.label}>📋 Condizioni Bonus</p>
            <div style={s.condBox}>
              <p style={s.condItem}>✅ Il bonus è pari al 100% del primo deposito</p>
              <p style={s.condItem}>✅ Importo massimo bonus: <strong>100 TON</strong></p>
              <p style={s.condItem}>✅ Il bonus viene accreditato automaticamente</p>
              <p style={s.condItem}>✅ Quota minima per wagering: <strong>1.30</strong></p>
              <p style={s.condItem}>✅ Per sbloccare il bonus devi giocare <strong>deposito + bonus</strong> su quote ≥1.30</p>
              <p style={s.condItem}>✅ Esempio: depositi 50 TON → bonus 50 TON → devi giocare 100 TON totali</p>
              <p style={s.condItem}>✅ Il bonus sbloccato diventa prelevabile</p>
              <p style={s.condItem}>⚠️ Un solo bonus per utente</p>
            </div>
          </div>

          {user?.bonusUsed && (
            <div style={s.card}>
              <p style={s.label}>🎁 Stato bonus</p>
              <p style={{ color: '#4ade80', fontSize: 22, fontWeight: 'bold' }}>
                {user.bonusBalance.toFixed(2)} TON
              </p>
              <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
                Wagering: {user.bonusWagered.toFixed(2)} / {user.bonusTarget.toFixed(2)} TON
              </p>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${wageringPercent}%` }} />
              </div>
              <p style={{ color: '#aaa', fontSize: 12, textAlign: 'right', marginTop: 4 }}>
                {wageringPercent.toFixed(0)}% completato
              </p>
              {wageringPercent >= 100 && (
                <p style={{ color: '#4ade80', fontWeight: 'bold', marginTop: 8 }}>
                  ✅ Wagering completato! Bonus sbloccato e prelevabile!
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- TAB DEPOSITA ---- */}
      {tab === 'deposita' && (
        <div>
          {!user?.bonusUsed && (
            <div style={s.bonusBannerSmall} onClick={() => setShowBonusModal(true)}>
              🎁 <strong>Primo deposito?</strong> Ricevi il 100% di bonus fino a 100 TON! →
            </div>
          )}

          {/* Selettore crypto */}
          <div style={s.card}>
            <p style={s.label}>💳 Seleziona metodo di pagamento</p>
            <div style={s.cryptoGrid}>
              {CRYPTO_METHODS.map(crypto => (
                <button key={crypto.symbol}
                  style={{
                    ...s.cryptoBtn,
                    borderColor: selectedCrypto === crypto.symbol ? crypto.color : '#334155',
                    background: selectedCrypto === crypto.symbol ? `${crypto.color}22` : '#0f172a'
                  }}
                  onClick={() => setSelectedCrypto(crypto.symbol)}>
                  <span style={s.cryptoIcon}>{crypto.icon}</span>
                  <span style={s.cryptoSymbol}>{crypto.symbol}</span>
                  <span style={s.cryptoName}>{crypto.name}</span>
                  <span style={s.cryptoDesc}>{crypto.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Istruzioni deposito */}
          <div style={s.card}>
            {selectedCrypto === 'TON' ? (
              <div>
                <p style={s.label}>📥 Deposita TON</p>
                <p style={s.small}>Invia TON a questo indirizzo:</p>
                <div style={s.addressBox}>{user?.depositAddress}</div>
                <button style={s.btnCopy} onClick={() => { navigator.clipboard.writeText(user.depositAddress); mostraMsg('📋 Indirizzo copiato!'); }}>
                  📋 Copia indirizzo
                </button>
                <p style={{ ...s.small, marginTop: 12 }}>⚠️ MEMO obbligatorio:</p>
                <div style={s.memoBox}>{user?.memo}</div>
                <button style={s.btnCopy} onClick={() => { navigator.clipboard.writeText(user.memo); mostraMsg('📋 Memo copiato!'); }}>
                  📋 Copia memo
                </button>
                <p style={{ ...s.small, color: '#f87171', marginTop: 10 }}>
                  ⚠️ Senza memo il deposito NON verrà accreditato!
                </p>
              </div>
            ) : (
              <div>
                <p style={s.label}>📥 Deposita {selectedCrypto}</p>
                <div style={s.cryptoInfoBox}>
                  <p style={{ color: '#facc15', fontSize: 13, marginBottom: 8 }}>
                    ⚠️ Per depositare in {selectedCrypto} contatta il supporto:
                  </p>
                  <p style={s.small}>1. Scrivi al bot con il comando /supporto</p>
                  <p style={s.small}>2. Indica la crypto e l'importo che vuoi depositare</p>
                  <p style={s.small}>3. Ti daremo l'indirizzo corretto per il bonifico</p>
                  <p style={s.small}>4. Invia la transazione e mandaci l'hash</p>
                  <p style={{ ...s.small, color: '#4ade80', marginTop: 8 }}>
                    ✅ Accredito entro 30-60 minuti dalla conferma blockchain
                  </p>
                </div>
              </div>
            )}
          </div>

          <div style={s.card}>
            <p style={s.label}>💰 Saldo attuale</p>
            <p style={{ fontSize: 26, color: '#4ade80', margin: '8px 0' }}>{user?.balance?.toFixed(2)} TON</p>
            <button style={s.btnBlue} onClick={() => caricaUtente(user.id)}>🔄 Aggiorna saldo</button>
          </div>
        </div>
      )}

      {/* ---- TAB PRELEVA ---- */}
      {tab === 'preleva' && (
        <div>
          {user?.bonusUsed && wageringPercent < 100 && (
            <div style={s.warnBanner}>
              ⚠️ Hai un bonus attivo. Completa il wagering ({wageringPercent.toFixed(0)}%) per prelevare il bonus.
            </div>
          )}
          <div style={s.card}>
            <p style={s.label}>💸 Richiedi prelievo</p>
            <p style={s.small}>Saldo disponibile: <strong style={{ color: '#4ade80' }}>{user?.balance?.toFixed(2)} TON</strong></p>
            <p style={{ ...s.small, marginTop: 12 }}>Il tuo wallet TON:</p>
            <input type="text" placeholder="Incolla il tuo indirizzo TON"
              value={withdrawWallet} onChange={e => setWithdrawWallet(e.target.value)}
              style={s.inputWide} />
            <p style={{ ...s.small, marginTop: 12 }}>Importo (TON):</p>
            <div style={s.row}>
              <input type="number" value={withdrawAmount} min="0.1" step="0.1"
                onChange={e => setWithdrawAmount(Number(e.target.value))} style={s.input} />
              <button style={s.chip} onClick={() => setWithdrawAmount(user.balance)}>Max</button>
            </div>
            <button style={{ ...s.btnBlue, marginTop: 16 }} onClick={handleWithdraw}>
              💸 Richiedi prelievo
            </button>
            <p style={{ ...s.small, color: '#facc15', marginTop: 12 }}>
              ⚠️ Prelievi elaborati entro 24h
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
  bonusBanner: { background: 'linear-gradient(90deg, #713f12, #92400e)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: 13 },
  bonusBannerSmall: { background: 'linear-gradient(90deg, #713f12, #92400e)', padding: '10px 16px', fontSize: 12, cursor: 'pointer', margin: 12, borderRadius: 10 },
  bonusBannerLarge: { background: 'linear-gradient(135deg, #713f12, #1e293b)', margin: 12, borderRadius: 12, padding: 20, textAlign: 'center', border: '1px solid #92400e' },
  bonusIconLarge: { fontSize: 48 },
  bannerArrow: { fontSize: 18, color: '#facc15' },
  warnBanner: { background: '#422006', margin: 12, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#fbbf24', border: '1px solid #92400e' },
  tabs: { display: 'flex', background: '#1e293b', borderBottom: '1px solid #334155' },
  tab: { flex: 1, padding: '10px 4px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  tabActive: { color: 'white', borderBottom: '2px solid #3b82f6' },
  tabLabel: { fontSize: 9 },
  card: { background: '#1e293b', margin: '12px', borderRadius: 12, padding: 16, border: '1px solid #334155' },
  label: { fontWeight: 'bold', marginBottom: 10, color: '#cbd5e1', fontSize: 14 },
  sectionTitle: { color: '#94a3b8', fontSize: 13, padding: '8px 16px' },
  sportBtn: { display: 'block', width: 'calc(100% - 24px)', margin: '5px 12px', padding: '13px 16px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: 14 },
  backBtn: { padding: '8px 14px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  searchInput: { flex: 1, padding: '8px 12px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: 8, fontSize: 14 },
  matchTitle: { fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  matchDate: { color: '#94a3b8', fontSize: 11, marginBottom: 10 },
  oddBtn: { flex: 1, padding: '10px 4px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  oddTeam: { fontSize: 16, fontWeight: 'bold', color: '#3b82f6' },
  oddValue: { fontSize: 18, fontWeight: 'bold', color: '#4ade80' },
  oddName: { fontSize: 9, color: '#94a3b8', textAlign: 'center' },
  progressBar: { background: '#334155', borderRadius: 10, height: 12, marginTop: 8, overflow: 'hidden' },
  progressFill: { background: 'linear-gradient(90deg, #3b82f6, #06b6d4)', height: '100%', borderRadius: 10, transition: 'width 0.3s' },
  condBox: { background: '#0f172a', borderRadius: 8, padding: 12 },
  condItem: { fontSize: 12, color: '#cbd5e1', marginBottom: 6, lineHeight: 1.5 },
  cryptoGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 },
  cryptoBtn: { padding: '12px 6px', background: '#0f172a', border: '2px solid #334155', borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'all 0.2s' },
  cryptoIcon: { fontSize: 22 },
  cryptoSymbol: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  cryptoName: { color: '#94a3b8', fontSize: 10 },
  cryptoDesc: { color: '#64748b', fontSize: 9, textAlign: 'center' },
  cryptoInfoBox: { background: '#0f172a', borderRadius: 8, padding: 14, border: '1px solid #334155' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  input: { width: 70, padding: '8px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: 8, fontSize: 16 },
  inputWide: { width: '100%', padding: 10, background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: 8, fontSize: 13, marginTop: 6, boxSizing: 'border-box' },
  chip: { padding: '6px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  btnBlue: { width: '100%', padding: 12, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  btnCopy: { marginTop: 8, padding: '8px 16px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  addressBox: { background: '#0f172a', padding: 10, borderRadius: 8, fontSize: 11, wordBreak: 'break-all', color: '#94a3b8', border: '1px solid #334155', marginTop: 8 },
  memoBox: { background: '#0f172a', padding: 10, borderRadius: 8, fontSize: 26, fontWeight: 'bold', color: '#facc15', textAlign: 'center', border: '1px solid #334155', marginTop: 8 },
  small: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#1e293b', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: '1px solid #334155' },
  modalIcon: { fontSize: 48, textAlign: 'center' },
  modalTitle: { textAlign: 'center', color: 'white', margin: '8px 0 4px' },
  modalSubtitle: { textAlign: 'center', color: '#facc15', fontSize: 22, fontWeight: 'bold', margin: '4px 0 16px' },
  modalBody: { background: '#0f172a', borderRadius: 10, padding: 14, marginBottom: 12 },
  modalText: { fontSize: 13, color: '#cbd5e1', marginBottom: 6 },
  modalCondizioni: { background: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 16 },
  modalSmall: { fontSize: 11, color: '#94a3b8', lineHeight: 1.6 },
  modalBtn: { width: '100%', padding: 14, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 15, marginBottom: 8 },
  modalBtnSecondary: { width: '100%', padding: 10, background: '#334155', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  toast: { position: 'fixed', bottom: 20, left: 16, right: 16, padding: '12px 16px', borderRadius: 10, textAlign: 'center', fontWeight: 'bold', fontSize: 14, zIndex: 999 }
};
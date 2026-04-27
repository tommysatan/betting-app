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
  { key: 'soccer_turkey_super_league', label: '🇹🇷 Süper Lig' },
  { key: 'tennis_atp_french_open', label: '🎾 Tennis ATP' },
  { key: 'tennis_wta_french_open', label: '🎾 Tennis WTA' },
];

const CRYPTO_METHODS = [
  { symbol: 'USDT', name: 'Tether', icon: '💵', color: '#26a17b', desc: 'TRC20 / ERC20', address: 'INDIRIZZO_USDT_QUI', network: '⚠️ Rete: TRC20 (Tron) o ERC20 (Ethereum)' },
  { symbol: 'USDC', name: 'USD Coin', icon: '🔵', color: '#2775ca', desc: 'ERC20 / Solana', address: 'INDIRIZZO_USDC_QUI', network: '⚠️ Rete: ERC20 (Ethereum) o Solana' },
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: '#f7931a', desc: '~30 min', address: 'INDIRIZZO_BTC_QUI', network: '⚠️ Rete: Bitcoin mainnet' },
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: '#627eea', desc: 'ERC20', address: 'INDIRIZZO_ETH_QUI', network: '⚠️ Rete: ERC20 (Ethereum)' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('sport');
  const [selectedSport, setSelectedSport] = useState(null);
  const [odds, setOdds] = useState([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [betAmount, setBetAmount] = useState(10);
  const [useBonus, setUseBonus] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  const [withdrawWallet, setWithdrawWallet] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState(10);
  const [selectedCrypto, setSelectedCrypto] = useState('USDT');
  const [showBonus, setShowBonus] = useState(false);

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
      if (!res.data.bonusUsed) setShowBonus(true);
    } catch {
      toast('❌ Errore connessione server', 'err');
    } finally {
      setLoading(false);
    }
  };

  const toast = (testo, tipo = 'ok') => {
    setMsg(testo); setMsgType(tipo);
    setTimeout(() => setMsg(''), 4000);
  };

  const caricaOdds = async (sportKey) => {
    setSelectedSport(sportKey);
    setOddsLoading(true);
    setSearchQuery('');
    try {
      const res = await axios.get(`${API_URL}/api/odds/${sportKey}`);
      setOdds(res.data);
    } catch {
      toast('❌ Errore caricamento quote', 'err');
    } finally {
      setOddsLoading(false);
    }
  };

  const filteredOdds = odds.filter(m =>
    m.home_team.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.away_team.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBet = async (match, outcome, oddValue) => {
    if (!user) return;
    if (oddValue < 1.30) return toast('⚠️ Quota minima 1.30', 'err');
    const saldo = useBonus ? user.bonusBalance : user.balance;
    if (betAmount > saldo) return toast('⚠️ Saldo insufficiente', 'err');
    try {
      const res = await axios.post(`${API_URL}/api/bet`, {
        userId: user.id, amount: betAmount, prediction: outcome,
        odds: oddValue, matchId: match.id,
        homeTeam: match.home_team, awayTeam: match.away_team,
        commenceTime: match.commence_time,
        useBonus, initData: window.Telegram?.WebApp?.initData || ''
      });
      if (res.data.success) {
        setUser(p => ({ ...p, balance: res.data.newBalance, bonusBalance: res.data.newBonus }));
        toast(`✅ ${betAmount}€ su ${outcome} @ ${oddValue}`);
      } else toast(`❌ ${res.data.message}`, 'err');
    } catch { toast('❌ Errore connessione', 'err'); }
  };

  const handleWithdraw = async () => {
    if (!withdrawWallet) return toast('⚠️ Inserisci wallet', 'err');
    if (withdrawAmount <= 0 || withdrawAmount > user.balance) return toast('⚠️ Importo non valido', 'err');
    try {
      const res = await axios.post(`${API_URL}/api/withdraw`, {
        userId: user.id, amount: withdrawAmount, wallet: withdrawWallet
      });
      if (res.data.success) {
        setUser(p => ({ ...p, balance: p.balance - withdrawAmount }));
        toast('✅ Richiesta inviata! Entro 24h.');
      } else toast(`❌ ${res.data.message}`, 'err');
    } catch { toast('❌ Errore connessione', 'err'); }
  };

  const wagPct = user?.bonusTarget > 0
    ? Math.min((user.bonusWagered / user.bonusTarget) * 100, 100) : 0;

  const cryptoSelezionata = CRYPTO_METHODS.find(c => c.symbol === selectedCrypto);

  if (loading) return (
    <div style={s.fullCenter}>
      <div style={{ fontSize: 48 }}>🎰</div>
      <p style={{ color: '#94a3b8', marginTop: 12 }}>Caricamento...</p>
    </div>
  );

  return (
    <div style={s.page}>

      {/* ===== MODAL BONUS ===== */}
      {showBonus && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: 52 }}>🎁</span></div>
            <div style={s.bonusTag}>BENVENUTO</div>
            <div style={s.bonusBig}>BONUS</div>
            <div style={s.bonusPercent}>200%</div>
            <div style={s.bonusAmount}>fino a 200€</div>
            <div style={s.bonusSub}>sul primo deposito in crypto</div>
            <div style={s.bonusPoints}>
              <div style={s.bonusPoint}>✅ Deposita e ricevi il doppio</div>
              <div style={s.bonusPoint}>✅ Usabile su tutte le scommesse</div>
              <div style={s.bonusPoint}>✅ Quota minima: <strong style={{ color: '#facc15' }}>1.30</strong></div>
              <div style={s.bonusPoint}>✅ Wagering: gioca deposito + bonus x1</div>
            </div>
            <div style={s.tac}>
              <p style={s.tacText}>📋 T&C: Il bonus è pari al 200% del primo deposito in crypto fino a 200€. Per sbloccarlo devi giocare l'importo totale (deposito + bonus) su quote ≥1.30. Esempio: depositi 100€ → ricevi 200€ bonus → gioca 300€ totali su quote ≥1.30 → bonus sbloccato e prelevabile. Un solo bonus per utente.</p>
            </div>
            <button style={s.btnGreen} onClick={() => { setShowBonus(false); setTab('deposita'); }}>
              💰 DEPOSITA ORA
            </button>
            <button style={s.btnGray} onClick={() => setShowBonus(false)}>Chiudi</button>
          </div>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div style={s.header}>
        <span style={s.logo}>🎰 Bet App</span>
        <div style={s.balRow}>
          <div style={s.balChip}>💰 {user?.balance?.toFixed(2)}€</div>
          {user?.bonusBalance > 0 && <div style={s.bonChip}>🎁 {user?.bonusBalance?.toFixed(2)}€</div>}
        </div>
      </div>

      {/* ===== BANNER BONUS GLOBALE ===== */}
      {!user?.bonusUsed && (
        <div style={s.topBanner} onClick={() => setShowBonus(true)}>
          🎁 <strong>BONUS 200%</strong> fino a 200€ sul primo deposito! <span style={{ color: '#facc15' }}>→</span>
        </div>
      )}

      {/* ===== TABS ===== */}
      <div style={s.tabBar}>
        {[
          { key: 'sport', icon: '⚽', label: 'Sport' },
          { key: 'bonus', icon: '🎁', label: 'Bonus' },
          { key: 'deposita', icon: '📥', label: 'Deposita' },
          { key: 'preleva', icon: '💸', label: 'Preleva' },
        ].map(t => (
          <button key={t.key}
            style={{ ...s.tabBtn, ...(tab === t.key ? s.tabActive : {}) }}
            onClick={() => setTab(t.key)}>
            <span style={s.tabIcon}>{t.icon}</span>
            <span style={s.tabLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ===== TAB SPORT ===== */}
      {tab === 'sport' && (
        <div>
          {/* Banner bonus dentro sport */}
          {!user?.bonusUsed && (
            <div style={s.sportBonusBanner} onClick={() => setShowBonus(true)}>
              <div>
                <div style={s.sportBonusTitle}>🎁 BONUS BENVENUTO</div>
                <div style={s.sportBonusAmt}>200% fino a 200€ sul primo deposito</div>
              </div>
              <span style={s.sportBonusArrow}>→</span>
            </div>
          )}

          <div style={s.card}>
            <p style={s.cardTitle}>Importo scommessa</p>
            <div style={s.row}>
              <input type="number" value={betAmount} min="1" step="1"
                onChange={e => setBetAmount(Number(e.target.value))} style={s.numInput} />
              <span style={s.unit}>€</span>
            </div>
            <div style={s.chipRow}>
              {[5, 10, 25, 50, 100].map(v => (
                <button key={v} style={s.chip} onClick={() => setBetAmount(v)}>{v}€</button>
              ))}
            </div>
            {user?.bonusBalance > 0 && (
              <label style={s.bonusToggle}>
                <input type="checkbox" checked={useBonus} onChange={e => setUseBonus(e.target.checked)} />
                <span> Usa bonus (🎁 {user.bonusBalance.toFixed(2)}€)</span>
              </label>
            )}
          </div>

          {!selectedSport && (
            <div>
              <p style={s.sectionHead}>Seleziona campionato</p>
              {SPORT_GROUPS.map(sg => (
                <button key={sg.key} style={s.sportRow} onClick={() => caricaOdds(sg.key)}>
                  <span>{sg.label}</span>
                  <span style={s.arrow}>›</span>
                </button>
              ))}
            </div>
          )}

          {selectedSport && (
            <div>
              <div style={s.searchBar}>
                <button style={s.backBtn} onClick={() => { setSelectedSport(null); setOdds([]); }}>←</button>
                <input type="text" placeholder="🔍 Cerca squadra..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  style={s.searchInput} />
              </div>
              {oddsLoading && <p style={s.emptyText}>⏳ Caricamento quote...</p>}
              {!oddsLoading && filteredOdds.length === 0 && (
                <p style={s.emptyText}>{searchQuery ? '🔍 Nessun risultato' : '📭 Nessuna partita disponibile'}</p>
              )}
              {!oddsLoading && filteredOdds.map(match => {
                const outcomes = match.bookmakers?.[0]?.markets?.[0]?.outcomes || [];
                return (
                  <div key={match.id} style={s.matchCard}>
                    <p style={s.matchName}>{match.home_team} vs {match.away_team}</p>
                    <p style={s.matchTime}>{new Date(match.commence_time).toLocaleString('it-IT')}</p>
                    <div style={s.oddsRow}>
                      {outcomes.map(o => (
                        <button key={o.name}
                          style={{ ...s.oddBtn, opacity: o.price < 1.30 ? 0.35 : 1 }}
                          disabled={o.price < 1.30}
                          onClick={() => handleBet(match, o.name, o.price)}>
                          <span style={s.oddSide}>
                            {o.name === match.home_team ? '1' : o.name === match.away_team ? '2' : 'X'}
                          </span>
                          <span style={s.oddPrice}>{o.price.toFixed(2)}</span>
                          <span style={s.oddTeam}>{o.name.length > 10 ? o.name.slice(0, 10) + '…' : o.name}</span>
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

      {/* ===== TAB BONUS ===== */}
      {tab === 'bonus' && (
        <div>
          {!user?.bonusUsed && (
            <div style={s.bonusBannerCard}>
              <div style={{ fontSize: 40, textAlign: 'center' }}>🎁</div>
              <div style={s.bonusBig2}>BONUS 200%</div>
              <div style={s.bonusAmt2}>fino a 200€</div>
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', margin: '8px 0 16px' }}>
                sul primo deposito in crypto
              </p>
              <button style={s.btnGreen} onClick={() => setTab('deposita')}>
                💰 Deposita e attiva il bonus
              </button>
            </div>
          )}
          <div style={s.card}>
            <p style={s.cardTitle}>📋 Condizioni Bonus</p>
            <div style={s.tacBox}>
              <p style={s.tacLine}>✅ Bonus 200% sul primo deposito, max 200€</p>
              <p style={s.tacLine}>✅ Accreditato automaticamente in crypto</p>
              <p style={s.tacLine}>✅ Quota minima per wagering: <strong>1.30</strong></p>
              <p style={s.tacLine}>✅ Devi giocare deposito + bonus su quote ≥1.30</p>
              <p style={s.tacLine}>✅ Es: depositi 100€ → bonus 200€ → gioca 300€ totali</p>
              <p style={s.tacLine}>✅ Bonus sbloccato = prelevabile</p>
              <p style={s.tacLine}>⚠️ Un solo bonus per account</p>
            </div>
          </div>
          {user?.bonusUsed && (
            <div style={s.card}>
              <p style={s.cardTitle}>🎁 Il tuo bonus</p>
              <p style={s.bonusVal}>{user.bonusBalance.toFixed(2)}€</p>
              <p style={s.wagText}>Wagering: {user.bonusWagered.toFixed(2)} / {user.bonusTarget.toFixed(2)}€</p>
              <div style={s.progBar}>
                <div style={{ ...s.progFill, width: `${wagPct}%` }} />
              </div>
              <p style={s.wagPct}>{wagPct.toFixed(0)}% completato</p>
              {wagPct >= 100 && <p style={s.bonusUnlocked}>🎉 Bonus sbloccato e prelevabile!</p>}
            </div>
          )}
        </div>
      )}

      {/* ===== TAB DEPOSITA ===== */}
      {tab === 'deposita' && (
        <div>
          {!user?.bonusUsed && (
            <div style={s.topBanner} onClick={() => setShowBonus(true)}>
              🎁 <strong>Primo deposito?</strong> Ricevi il 200% di bonus fino a 200€! <span style={{ color: '#facc15' }}>→</span>
            </div>
          )}
          <div style={s.card}>
            <p style={s.cardTitle}>💳 Metodo di pagamento</p>
            <div style={s.cryptoGrid}>
              {CRYPTO_METHODS.map(c => (
                <button key={c.symbol}
                  style={{
                    ...s.cryptoCard,
                    borderColor: selectedCrypto === c.symbol ? c.color : '#334155',
                    background: selectedCrypto === c.symbol ? `${c.color}22` : '#0f172a',
                    boxShadow: selectedCrypto === c.symbol ? `0 0 12px ${c.color}44` : 'none'
                  }}
                  onClick={() => setSelectedCrypto(c.symbol)}>
                  <span style={s.cryptoIcon}>{c.icon}</span>
                  <span style={s.cryptoSym}>{c.symbol}</span>
                  <span style={s.cryptoName}>{c.name}</span>
                  <span style={s.cryptoDesc}>{c.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={s.card}>
            <p style={s.cardTitle}>📥 Deposita {selectedCrypto}</p>
            <p style={s.depStep}>1️⃣ Copia l'indirizzo qui sotto</p>
            <div style={s.addressBox}>{cryptoSelezionata.address}</div>
            <button style={s.btnCopy} onClick={() => {
              navigator.clipboard.writeText(cryptoSelezionata.address);
              toast('📋 Indirizzo copiato!');
            }}>📋 Copia indirizzo</button>
            <p style={{ ...s.small, marginTop: 12, color: '#facc15' }}>{cryptoSelezionata.network}</p>
            <p style={{ ...s.depStep, marginTop: 12 }}>2️⃣ Invia l'importo desiderato</p>
            <p style={s.depStep}>3️⃣ Manda l'hash della transazione al supporto con /supporto</p>
            <p style={{ color: '#4ade80', fontSize: 12, marginTop: 10 }}>✅ Accredito entro 30-60 min dalla conferma blockchain</p>
          </div>
          <div style={s.card}>
            <p style={s.cardTitle}>💰 Saldo attuale</p>
            <p style={s.bigBalance}>{user?.balance?.toFixed(2)}€</p>
            <button style={s.btnBlue} onClick={() => caricaUtente(user.id)}>🔄 Aggiorna saldo</button>
          </div>
        </div>
      )}

      {/* ===== TAB PRELEVA ===== */}
      {tab === 'preleva' && (
        <div>
          {user?.bonusUsed && wagPct < 100 && (
            <div style={s.warnBox}>
              ⚠️ Hai un bonus attivo ({wagPct.toFixed(0)}% wagering completato). Il bonus sarà prelevabile dopo il completamento.
            </div>
          )}
          <div style={s.card}>
            <p style={s.cardTitle}>💸 Richiedi prelievo</p>
            <p style={s.small}>Saldo disponibile: <strong style={{ color: '#4ade80' }}>{user?.balance?.toFixed(2)}€</strong></p>
            <p style={{ ...s.small, marginTop: 14 }}>Il tuo wallet (USDT / BTC / ETH / altro):</p>
            <input type="text" placeholder="Incolla il tuo indirizzo wallet"
              value={withdrawWallet} onChange={e => setWithdrawWallet(e.target.value)}
              style={s.wideInput} />
            <p style={{ ...s.small, marginTop: 12 }}>Importo (€):</p>
            <div style={s.row}>
              <input type="number" value={withdrawAmount} min="1" step="1"
                onChange={e => setWithdrawAmount(Number(e.target.value))} style={s.numInput} />
              <button style={s.chip} onClick={() => setWithdrawAmount(user.balance)}>Max</button>
            </div>
            <button style={{ ...s.btnGreen, marginTop: 16 }} onClick={handleWithdraw}>
              💸 Richiedi prelievo
            </button>
            <p style={{ ...s.small, color: '#facc15', marginTop: 12 }}>⚠️ Prelievi elaborati entro 24h lavorative</p>
          </div>
        </div>
      )}

      {/* ===== FOOTER ADM ===== */}
      <div style={s.footer}>
        <div style={s.admBadge}>
          <div style={s.admLeft}>
            <div style={s.admShield}>🏛️</div>
            <div>
              <div style={s.admTitle}>ADM</div>
              <div style={s.admSub}>Agenzia Dogane e Monopoli</div>
            </div>
          </div>
        </div>
        <p style={s.admText}>Il gioco è vietato ai minori di 18 anni e può causare dipendenza patologica.</p>
        <p style={s.admText}>Gioca responsabilmente. 18+</p>
      </div>

      {/* ===== TOAST ===== */}
      {msg && (
        <div style={{ ...s.toast, background: msgType === 'ok' ? '#15803d' : '#991b1b' }}>
          {msg}
        </div>
      )}

    </div>
  );
}

const s = {
  page: { fontFamily: "'Arial', sans-serif", background: '#0f172a', minHeight: '100vh', color: 'white', paddingBottom: 40 },
  fullCenter: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' },
  modal: { background: '#1e293b', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, border: '1px solid #334155' },
  bonusTag: { textAlign: 'center', color: '#94a3b8', fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 4 },
  bonusBig: { textAlign: 'center', fontSize: 52, fontWeight: '900', color: '#facc15', lineHeight: 1, letterSpacing: 2 },
  bonusPercent: { textAlign: 'center', fontSize: 72, fontWeight: '900', color: 'white', lineHeight: 1 },
  bonusAmount: { textAlign: 'center', fontSize: 32, fontWeight: '800', color: '#4ade80', marginTop: 4 },
  bonusSub: { textAlign: 'center', color: '#94a3b8', fontSize: 13, margin: '8px 0 16px' },
  bonusPoints: { background: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 12 },
  bonusPoint: { fontSize: 13, color: '#cbd5e1', marginBottom: 6 },
  tac: { background: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 16 },
  tacText: { fontSize: 10, color: '#64748b', lineHeight: 1.6, margin: 0 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 },
  logo: { fontSize: 17, fontWeight: 'bold' },
  balRow: { display: 'flex', gap: 6 },
  balChip: { background: '#065f46', color: '#4ade80', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 'bold' },
  bonChip: { background: '#713f12', color: '#facc15', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 'bold' },
  topBanner: { background: 'linear-gradient(90deg, #92400e, #b45309)', padding: '10px 16px', fontSize: 13, cursor: 'pointer', textAlign: 'center' },
  sportBonusBanner: { background: 'linear-gradient(90deg, #1e3a5f, #713f12)', margin: '10px 12px', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid #facc15' },
  sportBonusTitle: { color: '#facc15', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  sportBonusAmt: { color: 'white', fontSize: 12, marginTop: 3 },
  sportBonusArrow: { color: '#facc15', fontSize: 22, fontWeight: 'bold' },
  tabBar: { display: 'flex', background: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 49, zIndex: 99 },
  tabBtn: { flex: 1, padding: '8px 4px', background: 'transparent', color: '#64748b', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  tabActive: { color: 'white', borderBottom: '2px solid #3b82f6' },
  tabIcon: { fontSize: 18 },
  tabLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { background: '#1e293b', margin: '10px 12px', borderRadius: 14, padding: 16, border: '1px solid #334155' },
  cardTitle: { fontWeight: 'bold', color: '#cbd5e1', fontSize: 14, marginBottom: 12 },
  sectionHead: { color: '#64748b', fontSize: 12, padding: '6px 16px', textTransform: 'uppercase', letterSpacing: 1 },
  sportRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 'calc(100% - 24px)', margin: '4px 12px', padding: '13px 16px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: 10, cursor: 'pointer', fontSize: 14 },
  arrow: { color: '#4ade80', fontSize: 20 },
  searchBar: { display: 'flex', gap: 8, padding: '8px 12px', alignItems: 'center' },
  backBtn: { padding: '8px 14px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16 },
  searchInput: { flex: 1, padding: '8px 12px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: 8, fontSize: 14 },
  emptyText: { textAlign: 'center', color: '#64748b', padding: 30 },
  matchCard: { background: '#1e293b', margin: '6px 12px', borderRadius: 12, padding: 14, border: '1px solid #334155' },
  matchName: { fontWeight: 'bold', fontSize: 13, marginBottom: 2, color: 'white' },
  matchTime: { color: '#64748b', fontSize: 10, marginBottom: 10 },
  oddsRow: { display: 'flex', gap: 6 },
  oddBtn: { flex: 1, padding: '10px 4px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  oddSide: { fontSize: 15, fontWeight: 'bold', color: '#60a5fa' },
  oddPrice: { fontSize: 19, fontWeight: '900', color: '#4ade80' },
  oddTeam: { fontSize: 8, color: '#64748b', textAlign: 'center' },
  bonusBannerCard: { background: 'linear-gradient(135deg, #713f12, #1e3a5f)', margin: '10px 12px', borderRadius: 14, padding: 20, border: '1px solid #92400e' },
  bonusBig2: { textAlign: 'center', fontSize: 36, fontWeight: '900', color: '#facc15', letterSpacing: 2 },
  bonusAmt2: { textAlign: 'center', fontSize: 28, fontWeight: '800', color: '#4ade80', marginBottom: 4 },
  tacBox: { background: '#0f172a', borderRadius: 10, padding: 14 },
  tacLine: { fontSize: 12, color: '#cbd5e1', marginBottom: 6, lineHeight: 1.5 },
  bonusVal: { fontSize: 32, fontWeight: '900', color: '#4ade80', margin: '4px 0 8px' },
  wagText: { color: '#94a3b8', fontSize: 12 },
  progBar: { background: '#334155', borderRadius: 10, height: 10, marginTop: 8, overflow: 'hidden' },
  progFill: { background: 'linear-gradient(90deg, #3b82f6, #06b6d4)', height: '100%', borderRadius: 10, transition: 'width 0.4s' },
  wagPct: { color: '#64748b', fontSize: 11, textAlign: 'right', marginTop: 4 },
  bonusUnlocked: { color: '#4ade80', fontWeight: 'bold', marginTop: 10, textAlign: 'center' },
  cryptoGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 },
  cryptoCard: { padding: '14px 8px', background: '#0f172a', border: '2px solid #334155', borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'all 0.2s' },
  cryptoIcon: { fontSize: 26 },
  cryptoSym: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  cryptoName: { color: '#94a3b8', fontSize: 11 },
  cryptoDesc: { color: '#64748b', fontSize: 10 },
  addressBox: { background: '#0f172a', padding: 10, borderRadius: 8, fontSize: 11, wordBreak: 'break-all', color: '#94a3b8', border: '1px solid #334155', marginTop: 8, marginBottom: 8 },
  btnCopy: { padding: '8px 16px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  depStep: { fontSize: 13, color: '#cbd5e1', marginBottom: 8, lineHeight: 1.5 },
  bigBalance: { fontSize: 36, fontWeight: '900', color: '#4ade80', margin: '4px 0 12px' },
  warnBox: { background: '#422006', margin: '10px 12px', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#fbbf24', border: '1px solid #92400e' },
  wideInput: { width: '100%', padding: 10, background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: 8, fontSize: 13, marginTop: 6, boxSizing: 'border-box' },
  row: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 },
  numInput: { width: 80, padding: '8px 10px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: 8, fontSize: 16 },
  unit: { color: '#64748b', fontSize: 14 },
  chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  chip: { padding: '6px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  bonusToggle: { display: 'flex', alignItems: 'center', gap: 6, color: '#facc15', fontSize: 13, marginTop: 10, cursor: 'pointer' },
  small: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6 },
  btnGreen: { width: '100%', padding: 14, background: 'linear-gradient(90deg, #059669, #0d9488)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 15, marginBottom: 8 },
  btnBlue: { width: '100%', padding: 12, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  btnGray: { width: '100%', padding: 10, background: '#334155', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  footer: { margin: '24px 12px 20px', padding: 16, borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  admBadge: { background: '#1e293b', border: '1px solid #1e3a8a', borderRadius: 12, padding: '12px 20px' },
  admLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  admShield: { fontSize: 32 },
  admTitle: { color: '#1d4ed8', fontWeight: '900', fontSize: 20, letterSpacing: 3 },
  admSub: { color: '#94a3b8', fontSize: 10, letterSpacing: 1 },
  admText: { color: '#475569', fontSize: 10, textAlign: 'center', lineHeight: 1.5, margin: 0 },
  toast: { position: 'fixed', bottom: 20, left: 16, right: 16, padding: '13px 16px', borderRadius: 12, textAlign: 'center', fontWeight: 'bold', fontSize: 14, zIndex: 9999 },
};
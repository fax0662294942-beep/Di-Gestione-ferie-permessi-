// ============================================================
// FERIE & PERMESSI — React App (versione completa)
// ============================================================

const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ============================================================
// 1. UTILITY
// ============================================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcolaMesiLavorati(dataInizioContratto, anno, mese) {
    if (!dataInizioContratto) return mese;
    const inizio = new Date(dataInizioContratto);
    const fine = new Date(anno, mese - 1, 1);
    if (inizio > fine) return 0;
    const diffMesi = (fine.getFullYear() - inizio.getFullYear()) * 12 +
                     (fine.getMonth() - inizio.getMonth()) + 1;
    return Math.min(diffMesi, mese);
}

// ============================================================
// 2. FESTIVITÀ
// ============================================================

function calcolaPasquetta(anno) {
    // Algoritmo di Gauss per la Pasqua
    const a = anno % 19;
    const b = Math.floor(anno / 100);
    const c = anno % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31);
    const giorno = ((h + l - 7 * m + 114) % 31) + 1;
    const pasqua = new Date(anno, mese - 1, giorno);
    pasqua.setDate(pasqua.getDate() + 1); // Pasquetta
    return pasqua;
}

function getFestivitaItalia(anno) {
    const pasquetta = calcolaPasquetta(anno);
    return [
        { id: 'capodanno', name: 'Capodanno', month: 1, day: 1, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'epifania', name: 'Epifania', month: 1, day: 6, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'pasquetta', name: 'Pasquetta', month: pasquetta.getMonth() + 1, day: pasquetta.getDate(), ricorrente: false, year: anno },
        { id: 'liberazione', name: 'Liberazione', month: 4, day: 25, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'lavoratori', name: 'Lavoratori', month: 5, day: 1, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'repubblica', name: 'Repubblica', month: 6, day: 2, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'ferragosto', name: 'Ferragosto', month: 8, day: 15, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'ognissanti', name: 'Ognissanti', month: 11, day: 1, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'immacolata', name: 'Immacolata', month: 12, day: 8, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'natale', name: 'Natale', month: 12, day: 25, ricorrente: true, fromYear: null, untilYear: null },
        { id: 'santo_stefano', name: 'Santo Stefano', month: 12, day: 26, ricorrente: true, fromYear: null, untilYear: null }
    ];
}

function calcolaGiorniLavorativi(dateFrom, dateTo, workdayConfig, festivita) {
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    let giorni = 0;
    const current = new Date(start);
    
    while (current <= end) {
        const day = current.getDay();
        let isLavorativo = true;
        
        if (workdayConfig.escludiSabato && day === 6) isLavorativo = false;
        if (workdayConfig.escludiDomenica && day === 0) isLavorativo = false;
        
        if (isLavorativo) {
            const mese = current.getMonth() + 1;
            const giorno = current.getDate();
            const anno = current.getFullYear();
            
            for (const festa of festivita || []) {
                let isFesta = false;
                
                if (festa.ricorrente) {
                    const fromOk = festa.fromYear === null || anno >= festa.fromYear;
                    const untilOk = festa.untilYear === null || anno <= festa.untilYear;
                    if (fromOk && untilOk && festa.month === mese && festa.day === giorno) {
                        isFesta = true;
                        break;
                    }
                } else {
                    if (festa.year === anno && festa.month === mese && festa.day === giorno) {
                        isFesta = true;
                        break;
                    }
                }
                
                if (isFesta) {
                    isLavorativo = false;
                    break;
                }
            }
        }
        
        if (isLavorativo) giorni++;
        current.setDate(current.getDate() + 1);
    }
    return giorni;
}

// ============================================================
// 3. PERMESSI CCNL
// ============================================================

function getScaglionePermessi(anniServizioMesi) {
    if (anniServizioMesi < 24) return { label: '0-2 anni', oreAnnue: 32 };
    if (anniServizioMesi < 48) return { label: '2-4 anni', oreAnnue: 68 };
    return { label: '5+ anni', oreAnnue: 104 };
}

function calcolaPermessiMensiliCCNL(dataAssunzione, anno, mese) {
    if (!dataAssunzione) return 0;
    const assunzione = new Date(dataAssunzione);
    const dataRif = new Date(anno, mese - 1, 1);
    const mesiDiff = (dataRif.getFullYear() - assunzione.getFullYear()) * 12 +
                     (dataRif.getMonth() - assunzione.getMonth());
    const scaglione = getScaglionePermessi(mesiDiff);
    return scaglione.oreAnnue / 12;
}

// ============================================================
// 4. CALCOLI SALDO (FIFO)
// ============================================================

function getResiduoAnniPrecedenti(user, annoCorrente) {
    const { dataInizioContratto, calcMode, anni, entries } = user;
    const annoInizio = dataInizioContratto ? new Date(dataInizioContratto).getFullYear() : Math.min(...Object.keys(anni).map(Number));
    const anniKeys = Object.keys(anni).map(Number);
    const annoMin = Math.min(annoInizio, ...anniKeys);
    
    let residuoFerie = 0;
    let residuoPermessi = 0;
    
    for (let y = annoMin; y < annoCorrente; y++) {
        const matFerie = anni[y]?.ferieAnnue || 26;
        const matPermessi = anni[y]?.permessiOreAnnui || 0;
        
        const usedFerie = entries
            .filter(e => e.anno === y && e.tipo === 'ferie' && !e.sim)
            .reduce((sum, e) => sum + e.qty, 0);
        
        const usedPermessi = entries
            .filter(e => e.anno === y && (e.tipo === 'permesso' || e.tipo === 'permesso_pagato') && !e.sim)
            .reduce((sum, e) => sum + e.qty, 0);
        
        const coeff = calcMode === '1.2' ? 1.2 : 1;
        residuoFerie = Math.max(0, residuoFerie + matFerie - (usedFerie * coeff));
        residuoPermessi = residuoPermessi + matPermessi - usedPermessi;
    }
    
    return { ferie: residuoFerie, permessi: residuoPermessi };
}

function calcolaSaldo(user, anno, mese) {
    if (!user) return null;
    const { dataInizioContratto, calcMode, anni, entries } = user;
    const prevRes = getResiduoAnniPrecedenti(user, anno);
    
    const mesiLavorati = dataInizioContratto ? calcolaMesiLavorati(dataInizioContratto, anno, mese) : mese;
    const matFerieMensile = (anni[anno]?.ferieAnnue || 26) / 12;
    const matFerie = matFerieMensile * mesiLavorati;
    
    let matPermessi = 0;
    if (calcMode === '1.2') {
        for (let m = 1; m <= mese; m++) {
            matPermessi += calcolaPermessiMensiliCCNL(dataInizioContratto, anno, m);
        }
    } else {
        matPermessi = (anni[anno]?.permessiOreAnnui || 0) / 12 * mese;
    }
    
    const vociFerie = entries.filter(e => 
        e.anno === anno && e.mese === mese && e.tipo === 'ferie' && !e.sim
    );
    const vociPermessi = entries.filter(e => 
        e.anno === anno && e.mese === mese && (e.tipo === 'permesso' || e.tipo === 'permesso_pagato') && !e.sim
    );
    
    const coeff = calcMode === '1.2' ? 1.2 : 1;
    const usedFerie = vociFerie.reduce((sum, e) => sum + e.qty * coeff, 0);
    const usedPermessi = vociPermessi.reduce((sum, e) => sum + e.qty, 0);
    
    let usedFromPrevFerie = Math.min(prevRes.ferie, usedFerie);
    let usedFromCurrFerie = Math.max(0, usedFerie - prevRes.ferie);
    
    let usedFromPrevPermessi = 0;
    let usedFromCurrPermessi = 0;
    if (prevRes.permessi >= 0) {
        usedFromPrevPermessi = Math.min(prevRes.permessi, usedPermessi);
        usedFromCurrPermessi = Math.max(0, usedPermessi - prevRes.permessi);
    } else {
        usedFromCurrPermessi = usedPermessi;
    }
    
    return {
        prev: {
            ferie: prevRes.ferie,
            permessi: prevRes.permessi,
            usedFerie: usedFromPrevFerie,
            usedPermessi: usedFromPrevPermessi,
            residuoFerie: prevRes.ferie - usedFromPrevFerie,
            residuoPermessi: prevRes.permessi - usedFromPrevPermessi
        },
        current: {
            matFerie,
            matPermessi,
            usedFerie: usedFromCurrFerie,
            usedPermessi: usedFromCurrPermessi,
            residuoFerie: matFerie - usedFromCurrFerie,
            residuoPermessi: matPermessi - usedFromCurrPermessi
        },
        totali: {
            ferie: prevRes.ferie - usedFromPrevFerie + matFerie - usedFromCurrFerie,
            permessi: prevRes.permessi - usedFromPrevPermessi + matPermessi - usedFromCurrPermessi
        }
    };
}

// ============================================================
// 5. GESTIONE FESTIVITÀ (CRUD)
// ============================================================

function aggiungiFestivita(user, festivita) {
    const updatedUser = {
        ...user,
        festivita: [...(user.festivita || []), { 
            id: generateId(),
            ...festivita,
            ricorrente: festivita.ricorrente !== false,
            fromYear: festivita.fromYear || null,
            untilYear: festivita.untilYear || null,
            year: festivita.ricorrente ? null : (festivita.year || null)
        }]
    };
    return updatedUser;
}

function rimuoviFestivita(user, id) {
    const updatedUser = {
        ...user,
        festivita: (user.festivita || []).filter(f => f.id !== id)
    };
    return updatedUser;
}

// ============================================================
// 6. COMPONENTI REACT
// ============================================================

// --- HEADER ---
function Header({ user, onUserChange, onSync, onLogout, onLogin, isLoggedIn, onOpenSettings }) {
    return (
        <header className="app-header">
            <div className="logo">
                <span>📋</span>
                <span>Ferie & Permessi</span>
            </div>
            <div className="header-actions">
                {isLoggedIn ? (
                    <>
                        <button onClick={onSync} title="Sync Firestore">☁️</button>
                        <button onClick={onLogout} title="Logout">🚪</button>
                    </>
                ) : (
                    <button onClick={onLogin} title="Login">🔑</button>
                )}
                {user && (
                    <>
                        <button onClick={onOpenSettings} title="Impostazioni" style={{ fontSize: 20 }}>⚙️</button>
                        <div className="user-chip" onClick={onUserChange}>
                            <div className="avatar">{user.name?.[0] || '?'}</div>
                            <span className="name">{user.name || 'Utente'}</span>
                        </div>
                    </>
                )}
            </div>
        </header>
    );
}

// --- MONTH NAVIGATOR ---
function MonthNavigator({ month, year, onChange, onYearChange }) {
    const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    
    const prevMonth = () => {
        if (month === 0) { onChange(11); onYearChange(year - 1); }
        else { onChange(month - 1); }
    };
    const nextMonth = () => {
        if (month === 11) { onChange(0); onYearChange(year + 1); }
        else { onChange(month + 1); }
    };
    
    return (
        <div className="month-nav">
            <button onClick={prevMonth}>‹</button>
            <span className="month-label">{mesi[month]} {year}</span>
            <button onClick={nextMonth}>›</button>
        </div>
    );
}

// --- TABS ---
function Tabs({ active, onChange }) {
    const tabs = [
        { id: 'piano', label: '📋 Piano' },
        { id: 'simulazione', label: '🔮 Simula' },
        { id: 'calendario', label: '📅 Calendario' },
        { id: 'statistiche', label: '📊 Statistiche' },
        { id: 'impostazioni', label: '⚙️ Impostazioni' }
    ];
    return (
        <div className="tabs">
            {tabs.map(t => (
                <button key={t.id} className={`tab-btn ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
                    {t.label}
                </button>
            ))}
        </div>
    );
}

// --- BALANCE CARD ---
function BalanceCard({ title, emoji, data, type }) {
    const isFerie = type === 'ferie';
    const unit = isFerie ? 'gg' : 'h';
    return (
        <div className="card">
            <div className="card-title"><span className="emoji">{emoji}</span> {title}</div>
            <div className="balance-grid">
                <div className="balance-item">
                    <div className="label">Precedenti</div>
                    <div className={`value ${data.prevResiduo < 0 ? 'red' : 'green'}`}>
                        {data.prevResiduo.toFixed(1)} {unit}
                    </div>
                </div>
                <div className="balance-item">
                    <div className="label">Correnti</div>
                    <div className="value blue">{data.currResiduo.toFixed(1)} {unit}</div>
                </div>
                <div className="balance-item">
                    <div className="label">Totale</div>
                    <div className={`value ${data.totale < 0 ? 'red' : 'green'}`}>
                        {data.totale.toFixed(1)} {unit}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- REQUEST LIST ---
function RequestList({ entries, onDelete, onToggleObbligata, onConfirm, user, type, showConfirm }) {
    const filtered = entries.filter(e => e.tipo === type && !e.sim);
    if (filtered.length === 0) {
        return <div className="empty-state"><div className="emoji">📭</div><div>Nessuna voce</div></div>;
    }

    const coeff = user?.calcMode === '1.2' ? 1.2 : 1;
    return filtered.map(entry => {
        const isLiquidato = entry.tipo === 'permesso_pagato';
        const isObbligata = entry.obbligata || false;
        const qty = entry.qty * (entry.tipo === 'ferie' ? coeff : 1);
        const unit = entry.tipo === 'ferie' ? 'gg' : 'h';

        return (
            <div key={entry.id} className="request-item approved">
                <div>
                    <div style={{ fontWeight: 600 }}>
                        {entry.note || (entry.tipo === 'ferie' ? '🌴 Ferie' : entry.tipo === 'permesso_pagato' ? '💰 Liquidazione' : '🕐 Permesso')}
                        {isObbligata && <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 8 }}>🏢 obbligata</span>}
                        {isLiquidato && <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 8 }}>💰 liquidato</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatDate(entry.dateFrom)} → {formatDate(entry.dateTo)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {qty.toFixed(1)} {unit}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {!isLiquidato && (
                        <button onClick={() => onToggleObbligata(entry.id)} style={{ background: 'none', border: 'none', color: isObbligata ? 'var(--amber)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }} title="Toggle obbligata">🏢</button>
                    )}
                    {showConfirm && entry.sim && (
                        <button onClick={() => onConfirm(entry.id)} style={{ background: 'var(--green)', border: 'none', color: 'var(--bg)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✅ Conferma</button>
                    )}
                    <button onClick={() => onDelete(entry.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18 }}>🗑</button>
                </div>
            </div>
        );
    });
}

// --- MODALI ---
function ModalFerie({ isOpen, onClose, onSave, user, year, month }) {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [qty, setQty] = useState(1);
    const [note, setNote] = useState('');
    const [obbligata, setObbligata] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const oggi = new Date().toISOString().split('T')[0];
            setDateFrom(oggi); setDateTo(oggi); setQty(1); setNote(''); setObbligata(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (dateFrom && dateTo && user) {
            const festivita = user.festivita || getFestivitaItalia(new Date(dateFrom).getFullYear());
            const workdayConfig = user.workdayConfig || { escludiSabato: true, escludiDomenica: true };
            const giorni = calcolaGiorniLavorativi(dateFrom, dateTo, workdayConfig, festivita);
            setQty(giorni || 1);
        }
    }, [dateFrom, dateTo, user]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!dateFrom || !dateTo) return alert('Inserisci le date');
        onSave({
            tipo: 'ferie', dateFrom, dateTo, qty, note: note || 'Ferie',
            mese: new Date(dateFrom).getMonth() + 1, anno: new Date(dateFrom).getFullYear(),
            obbligata, sim: false
        });
        onClose();
    };

    if (!isOpen) return null;
    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content">
                <div className="modal-header"><h2>🌴 Inserisci Ferie</h2><button className="modal-close" onClick={onClose}>✕</button></div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Data inizio</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required /></div>
                    <div className="form-group"><label>Data fine</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required /></div>
                    <div className="form-group"><label>Quantità (gg) {user?.calcMode === '1.2' && <span style={{ color: 'var(--amber)' }}>×1.2</span>}</label><input type="number" step="0.5" value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} required /></div>
                    <div className="form-group"><label>Note</label><input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo..." /></div>
                    <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={obbligata} onChange={(e) => setObbligata(e.target.checked)} /> 🏢 Chiusura aziendale (obbligata)</label></div>
                    <button type="submit" className="btn-primary">✅ Inserisci</button>
                </form>
            </div>
        </div>
    );
}

function ModalPermesso({ isOpen, onClose, onSave }) {
    const [date, setDate] = useState('');
    const [ore, setOre] = useState(8);
    const [note, setNote] = useState('');
    const [obbligata, setObbligata] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setDate(new Date().toISOString().split('T')[0]);
            setOre(8); setNote(''); setObbligata(false);
        }
    }, [isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!date) return alert('Inserisci la data');
        onSave({
            tipo: 'permesso', dateFrom: date, dateTo: date, qty: ore, note: note || 'Permesso',
            mese: new Date(date).getMonth() + 1, anno: new Date(date).getFullYear(),
            obbligata, sim: false
        });
        onClose();
    };

    if (!isOpen) return null;
    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content">
                <div className="modal-header"><h2>🕐 Inserisci Permesso</h2><button className="modal-close" onClick={onClose}>✕</button></div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
                    <div className="form-group"><label>Ore</label><input type="number" step="0.5" value={ore} onChange={(e) => setOre(parseFloat(e.target.value) || 0)} required /></div>
                    <div className="form-group"><label>Note</label><input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo..." /></div>
                    <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={obbligata} onChange={(e) => setObbligata(e.target.checked)} /> 🏢 Chiusura aziendale (obbligata)</label></div>
                    <button type="submit" className="btn-primary">✅ Inserisci</button>
                </form>
            </div>
        </div>
    );
}

function ModalLiquida({ isOpen, onClose, onSave, user, year }) {
    const [mese, setMese] = useState(new Date().getMonth() + 1);
    const [ore, setOre] = useState(0);
    const [note, setNote] = useState('Liquidazione permessi residui');

    useEffect(() => {
        if (isOpen && user) {
            const saldo = calcolaSaldo(user, year, mese);
            setOre(Math.max(0, saldo.totali.permessi));
        }
    }, [isOpen, user, year, mese]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (ore <= 0) return alert('Inserisci un numero di ore valido');
        onSave({
            tipo: 'permesso_pagato',
            dateFrom: `${year}-${String(mese).padStart(2, '0')}-01`,
            dateTo: `${year}-${String(mese).padStart(2, '0')}-01`,
            qty: ore, note: note || 'Liquidazione permessi',
            mese, anno: year, obbligata: false, sim: false
        });
        onClose();
    };

    if (!isOpen) return null;
    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content">
                <div className="modal-header"><h2>💰 Liquida Permessi</h2><button className="modal-close" onClick={onClose}>✕</button></div>
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group"><label>Mese</label>
                            <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))}>
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('it', { month: 'long' })}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group"><label>Anno</label><input type="number" value={year} disabled style={{ opacity: 0.7 }} /></div>
                    </div>
                    <div className="form-group">
                        <label>Ore da liquidare</label>
                        <input type="number" step="0.5" value={ore} onChange={(e) => setOre(parseFloat(e.target.value) || 0)} required />
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            Saldo disponibile al mese {mese}: {user ? calcolaSaldo(user, year, mese).totali.permessi.toFixed(1) : 0}h
                        </div>
                    </div>
                    <div className="form-group"><label>Note</label><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                    <button type="submit" className="btn-primary" style={{ background: 'var(--amber)' }}>💰 Conferma</button>
                </form>
            </div>
        </div>
    );
}

// --- GESTIONE FESTIVITÀ ---
function FestivitaManager({ user, onUpdate }) {
    const [nome, setNome] = useState('');
    const [giorno, setGiorno] = useState(1);
    const [mese, setMese] = useState(1);
    const [ricorrente, setRicorrente] = useState(true);
    const [fromYear, setFromYear] = useState('');
    const [untilYear, setUntilYear] = useState('');
    const [annoSpecifico, setAnnoSpecifico] = useState(new Date().getFullYear());

    const handleAggiungi = (e) => {
        e.preventDefault();
        if (!nome || !giorno || !mese) { alert('Compila tutti i campi'); return; }
        const nuova = {
            name: nome, day: parseInt(giorno), month: parseInt(mese),
            ricorrente: ricorrente,
            fromYear: fromYear ? parseInt(fromYear) : null,
            untilYear: untilYear ? parseInt(untilYear) : null,
            year: ricorrente ? null : parseInt(annoSpecifico)
        };
        if (ricorrente && fromYear && untilYear && parseInt(fromYear) > parseInt(untilYear)) {
            alert('L\'anno di inizio deve essere minore o uguale all\'anno di fine');
            return;
        }
        const updatedUser = aggiungiFestivita(user, nuova);
        onUpdate(updatedUser);
        setNome(''); setGiorno(1); setMese(1); setFromYear(''); setUntilYear('');
    };

    const handleRimuovi = (id) => {
        if (confirm('Rimuovere questa festività?')) {
            const updatedUser = rimuoviFestivita(user, id);
            onUpdate(updatedUser);
        }
    };

    const festivita = user.festivita || getFestivitaItalia(new Date().getFullYear());

    return (
        <div className="card">
            <div className="card-title">📅 Festività</div>
            <div style={{ marginBottom: 16 }}>
                {festivita.map(f => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', marginBottom: 4 }}>
                        <span>
                            {f.name}
                            <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>
                                {f.day}/{f.month}
                                {f.ricorrente ? (
                                    <>
                                        {f.fromYear ? ` dal ${f.fromYear}` : ''}
                                        {f.untilYear ? ` fino al ${f.untilYear}` : ''}
                                        {!f.fromYear && !f.untilYear ? ' (ogni anno)' : ''}
                                    </>
                                ) : ` (solo ${f.year})`}
                            </span>
                        </span>
                        <button onClick={() => handleRimuovi(f.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>🗑</button>
                    </div>
                ))}
            </div>
            <form onSubmit={handleAggiungi} style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div className="form-row"><div className="form-group"><label>Nome</label><input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Festa patronale" required /></div></div>
                <div className="form-row">
                    <div className="form-group"><label>Giorno</label><input type="number" min="1" max="31" value={giorno} onChange={(e) => setGiorno(parseInt(e.target.value) || 1)} required /></div>
                    <div className="form-group"><label>Mese</label>
                        <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))}>
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('it', { month: 'long' })}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={ricorrente} onChange={(e) => setRicorrente(e.target.checked)} />
                    Ogni anno (se deselezionato, solo quest'anno)
                </label></div>
                {ricorrente && (
                    <div className="form-row">
                        <div className="form-group"><label>Valida da anno (opzionale)</label>
                            <input type="number" value={fromYear} onChange={(e) => setFromYear(e.target.value)} placeholder="es. 2026" min="1900" />
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lascia vuoto per sempre</div>
                        </div>
                        <div className="form-group"><label>Valida fino anno (opzionale)</label>
                            <input type="number" value={untilYear} onChange={(e) => setUntilYear(e.target.value)} placeholder="es. 2025" min="1900" />
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lascia vuoto per sempre</div>
                        </div>
                    </div>
                )}
                {!ricorrente && (
                    <div className="form-group"><label>Anno specifico</label>
                        <input type="number" value={annoSpecifico} onChange={(e) => setAnnoSpecifico(parseInt(e.target.value))} />
                    </div>
                )}
                <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>➕ Aggiungi festività</button>
            </form>
        </div>
    );
}

// ============================================================
// 7. TAB PIANO UFFICIALE
// ============================================================

function PianoTab({ user, year, month, entries, onAddEntry, onDeleteEntry, onToggleObbligata }) {
    const [modalFerie, setModalFerie] = useState(false);
    const [modalPermesso, setModalPermesso] = useState(false);
    const [modalLiquida, setModalLiquida] = useState(false);

    const saldo = calcolaSaldo(user, year, month);
    if (!saldo) return <div className="container"><div className="card">Errore: utente non valido</div></div>;

    const vociMese = entries.filter(e => e.anno === year && e.mese === month && !e.sim);

    const ferieData = { prevResiduo: saldo.prev.residuoFerie, currResiduo: saldo.current.residuoFerie, totale: saldo.totali.ferie };
    const permessiData = { prevResiduo: saldo.prev.residuoPermessi, currResiduo: saldo.current.residuoPermessi, totale: saldo.totali.permessi };

    return (
        <>
            <div className="container">
                <BalanceCard title="Ferie" emoji="🌴" data={ferieData} type="ferie" />
                <BalanceCard title="Permessi" emoji="🕐" data={permessiData} type="permesso" />

                <div className="card">
                    <div className="card-title">📊 Riepilogo {new Date(year, month - 1).toLocaleString('it', { month: 'long' })} {year}</div>
                    <div className="month-detail">
                        <div className="row"><span className="label">Saldo inizio mese (F)</span><span>{saldo.prev.residuoFerie.toFixed(1)} gg</span></div>
                        <div className="row"><span className="label">Saldo inizio mese (P)</span><span>{saldo.prev.residuoPermessi.toFixed(1)} h</span></div>
                        <div className="row"><span className="label">Ferie maturate</span><span>{saldo.current.matFerie.toFixed(2)} gg</span></div>
                        <div className="row"><span className="label">Permessi maturati</span><span>{saldo.current.matPermessi.toFixed(2)} h</span></div>
                        <div className="row"><span className="label">Ferie utilizzate</span><span>{saldo.current.usedFerie.toFixed(1)} gg</span></div>
                        <div className="row"><span className="label">Permessi goduti</span><span>{saldo.current.usedPermessi.toFixed(1)} h</span></div>
                        <div className="row"><span className="label" style={{ fontWeight: 700 }}>Saldo fine mese (F)</span><span style={{ fontWeight: 700, color: 'var(--green)' }}>{saldo.totali.ferie.toFixed(1)} gg</span></div>
                        <div className="row"><span className="label" style={{ fontWeight: 700 }}>Saldo fine mese (P)</span><span style={{ fontWeight: 700, color: 'var(--green)' }}>{saldo.totali.permessi.toFixed(1)} h</span></div>
                    </div>
                </div>

                <div className="card"><div className="card-title">🌴 Ferie</div>
                    <RequestList entries={vociMese} onDelete={onDeleteEntry} onToggleObbligata={onToggleObbligata} user={user} type="ferie" showConfirm={false} />
                </div>
                <div className="card"><div className="card-title">🕐 Permessi</div>
                    <RequestList entries={vociMese} onDelete={onDeleteEntry} onToggleObbligata={onToggleObbligata} user={user} type="permesso" showConfirm={false} />
                </div>
                <div className="card"><div className="card-title">💰 Permessi Liquidati</div>
                    <RequestList entries={vociMese} onDelete={onDeleteEntry} onToggleObbligata={onToggleObbligata} user={user} type="permesso_pagato" showConfirm={false} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                    <button className="btn-primary" onClick={() => setModalFerie(true)}>🌴 Inserisci Ferie</button>
                    <button className="btn-primary" onClick={() => setModalPermesso(true)}>🕐 Inserisci Permesso</button>
                    <button className="btn-primary" style={{ background: 'var(--amber)' }} onClick={() => setModalLiquida(true)}>💰 Liquida Permessi</button>
                </div>
            </div>

            <ModalFerie isOpen={modalFerie} onClose={() => setModalFerie(false)} onSave={onAddEntry} user={user} year={year} month={month} />
            <ModalPermesso isOpen={modalPermesso} onClose={() => setModalPermesso(false)} onSave={onAddEntry} />
            <ModalLiquida isOpen={modalLiquida} onClose={() => setModalLiquida(false)} onSave={onAddEntry} user={user} year={year} />
        </>
    );
}

// ============================================================
// 8. TAB SIMULAZIONE
// ============================================================

function SimulazioneTab({ entries, onAddEntry, onDeleteEntry, onConfirm, user, year, month }) {
    const [modalFerie, setModalFerie] = useState(false);
    const [modalPermesso, setModalPermesso] = useState(false);

    const vociSim = entries.filter(e => e.anno === year && e.mese === month && e.sim);

    return (
        <div className="container">
            <div className="card">
                <div className="card-title">🔮 Voci Simulate</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Le voci simulate non influenzano il piano ufficiale. Usa "Conferma" per spostarle.
                </div>
                <RequestList entries={vociSim} onDelete={onDeleteEntry} onToggleObbligata={() => {}} onConfirm={onConfirm} user={user} type="ferie" showConfirm={true} />
                <RequestList entries={vociSim} onDelete={onDeleteEntry} onToggleObbligata={() => {}} onConfirm={onConfirm} user={user} type="permesso" showConfirm={true} />
                {vociSim.length === 0 && <div className="empty-state"><div className="emoji">🔮</div><div>Nessuna simulazione</div></div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn-primary" onClick={() => setModalFerie(true)}>🔮 Simula Ferie</button>
                <button className="btn-primary" onClick={() => setModalPermesso(true)}>🔮 Simula Permesso</button>
            </div>
            <ModalFerie isOpen={modalFerie} onClose={() => setModalFerie(false)} onSave={(entry) => onAddEntry({ ...entry, sim: true })} user={user} year={year} month={month} />
            <ModalPermesso isOpen={modalPermesso} onClose={() => setModalPermesso(false)} onSave={(entry) => onAddEntry({ ...entry, sim: true })} />
        </div>
    );
}

// ============================================================
// 9. TAB CALENDARIO
// ============================================================

function CalendarioTab({ user, year, month, entries }) {
    const giorniMese = new Date(year, month, 0).getDate();
    const primoGiorno = new Date(year, month - 1, 1).getDay();
    const offset = primoGiorno === 0 ? 6 : primoGiorno - 1;

    const giorni = [];
    for (let i = 0; i < offset; i++) giorni.push(null);
    for (let d = 1; d <= giorniMese; d++) giorni.push(d);

    const vociMese = entries.filter(e => e.anno === year && e.mese === month);
    const getDayEntries = (day) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return vociMese.filter(e => e.dateFrom === dateStr || e.dateTo === dateStr);
    };

    const oggi = new Date();

    return (
        <div className="container">
            <div className="card">
                <div className="calendar-grid">
                    {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => (
                        <div key={d} className="calendar-header">{d}</div>
                    ))}
                    {giorni.map((day, i) => {
                        if (!day) return <div key={i} className="calendar-day" style={{ background: 'transparent' }} />;
                        const entries = getDayEntries(day);
                        const isWeekend = i % 7 >= 5;
                        const isToday = oggi.getDate() === day && oggi.getMonth() + 1 === month && oggi.getFullYear() === year;
                        const hasFerie = entries.some(e => e.tipo === 'ferie');
                        const hasPermesso = entries.some(e => e.tipo === 'permesso' || e.tipo === 'permesso_pagato');
                        const hasSim = entries.some(e => e.sim);

                        let className = 'calendar-day';
                        if (isWeekend) className += ' weekend';
                        if (isToday) className += ' today';
                        if (hasFerie && hasPermesso) className += ' has-both';
                        else if (hasFerie) className += ' has-ferie';
                        else if (hasPermesso) className += ' has-permesso';

                        return (
                            <div key={i} className={className}>
                                <div className="day-number">{day}</div>
                                <div className="dots">
                                    {hasFerie && <div className="dot green" />}
                                    {hasPermesso && <div className="dot blue" />}
                                    {hasSim && <div className="dot amber" />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="card">
                <div className="card-title">📌 Legenda</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--green)', borderRadius: 4, marginRight: 4 }}></span> Ferie</span>
                    <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--blue)', borderRadius: 4, marginRight: 4 }}></span> Permesso</span>
                    <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--amber)', borderRadius: 4, marginRight: 4 }}></span> Simulazione</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// 10. TAB STATISTICHE (con filtri e grafico)
// ============================================================

function StatisticheTab({ user, year, month, entries }) {
    const [periodo, setPeriodo] = useState('anno');
    const [filterTipo, setFilterTipo] = useState('tutti');
    const [filterCategoria, setFilterCategoria] = useState('tutte');

    const getEntriesPeriodo = () => {
        if (periodo === 'mese') return entries.filter(e => e.anno === year && e.mese === month + 1);
        if (periodo === 'anno') return entries.filter(e => e.anno === year);
        return entries;
    };

    const baseEntries = getEntriesPeriodo();
    const filterByTipo = (list) => {
        if (filterTipo === 'ferie') return list.filter(e => e.tipo === 'ferie');
        if (filterTipo === 'permessi') return list.filter(e => e.tipo === 'permesso' || e.tipo === 'permesso_pagato');
        return list;
    };
    const filterByCategoria = (list) => {
        if (filterCategoria === 'obbligate') return list.filter(e => e.obbligata);
        if (filterCategoria === 'richieste') return list.filter(e => !e.obbligata);
        return list;
    };

    const filtered = filterByCategoria(filterByTipo(baseEntries));
    const ferie = filtered.filter(e => e.tipo === 'ferie' && !e.sim);
    const permessi = filtered.filter(e => (e.tipo === 'permesso' || e.tipo === 'permesso_pagato') && !e.sim);
    const obbligate = filtered.filter(e => e.obbligata && !e.sim);
    const richieste = filtered.filter(e => !e.obbligata && !e.sim);

    const totalFerie = ferie.reduce((sum, e) => sum + e.qty, 0);
    const totalPermessi = permessi.reduce((sum, e) => sum + e.qty, 0);
    const totalObbligate = obbligate.reduce((sum, e) => sum + e.qty, 0);
    const totalRichieste = richieste.reduce((sum, e) => sum + e.qty, 0);
    const totaleGenerale = totalFerie + totalPermessi;

    const getDistribuzione = () => {
        const giorni = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 0: 0 };
        filtered.forEach(entry => {
            if (entry.tipo === 'ferie') {
                const start = new Date(entry.dateFrom);
                const end = new Date(entry.dateTo);
                const current = new Date(start);
                while (current <= end) {
                    const day = current.getDay();
                    if (day >= 1 && day <= 5) giorni[day] = (giorni[day] || 0) + 1;
                    current.setDate(current.getDate() + 1);
                }
            } else {
                const day = new Date(entry.dateFrom).getDay();
                giorni[day] = (giorni[day] || 0) + 1;
            }
        });
        return giorni;
    };

    const distribuzione = getDistribuzione();
    const maxDistrib = Math.max(1, ...Object.values(distribuzione));
    const giorniNomi = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

    return (
        <div className="container">
            <div className="card">
                <div className="card-title">📊 Statistiche</div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="form-group" style={{ width: 'auto', padding: '8px 12px', flex: 1, minWidth: 100 }}>
                        <option value="mese">📅 Mese</option>
                        <option value="anno">📆 Anno</option>
                        <option value="totale">📚 Totale</option>
                    </select>
                    <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="form-group" style={{ width: 'auto', padding: '8px 12px', flex: 1, minWidth: 100 }}>
                        <option value="tutti">🌴+🕐 Tutti</option>
                        <option value="ferie">🌴 Solo Ferie</option>
                        <option value="permessi">🕐 Solo Permessi</option>
                    </select>
                    <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="form-group" style={{ width: 'auto', padding: '8px 12px', flex: 1, minWidth: 100 }}>
                        <option value="tutte">📋 Tutte</option>
                        <option value="obbligate">🏢 Obbligate</option>
                        <option value="richieste">👤 Richieste</option>
                    </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>🌴 Ferie</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--amber)' }}>🏢 Obbligate:</span> {totalObbligate.toFixed(1)} gg ({totaleGenerale > 0 ? ((totalObbligate / totaleGenerale) * 100).toFixed(0) : 0}%) · {obbligate.length} episodi
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--green)' }}>👤 Richieste:</span> {totalRichieste.toFixed(1)} gg ({totaleGenerale > 0 ? ((totalRichieste / totaleGenerale) * 100).toFixed(0) : 0}%) · {richieste.length} episodi
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Totale: {totaleGenerale.toFixed(1)} gg · {filtered.length} episodi</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>🕐 Permessi</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--amber)' }}>🏢 Obbligate:</span> {totalObbligate.toFixed(1)} h ({totaleGenerale > 0 ? ((totalObbligate / totaleGenerale) * 100).toFixed(0) : 0}%) · {obbligate.length} episodi
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--blue)' }}>👤 Richieste:</span> {totalRichieste.toFixed(1)} h ({totaleGenerale > 0 ? ((totalRichieste / totaleGenerale) * 100).toFixed(0) : 0}%) · {richieste.length} episodi
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Totale: {totaleGenerale.toFixed(1)} h · {filtered.length} episodi</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>📊 Obbligate vs Richieste</div>
                    <div className="stats-bar">
                        <div className="segment obbligate" style={{ width: totaleGenerale > 0 ? `${(totalObbligate / totaleGenerale) * 100}%` : '0%', background: 'var(--amber)' }} />
                        <div className="segment richieste" style={{ width: totaleGenerale > 0 ? `${(totalRichieste / totaleGenerale) * 100}%` : '0%', background: filterTipo === 'ferie' ? 'var(--green)' : filterTipo === 'permessi' ? 'var(--blue)' : 'linear-gradient(90deg, var(--green), var(--blue))' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        <span>🏢 Obbligate: {totalObbligate.toFixed(1)}</span>
                        <span>👤 Richieste: {totalRichieste.toFixed(1)}</span>
                    </div>
                </div>

                <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>📅 Distribuzione giorni settimana</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        <button className={`btn-secondary ${filterTipo === 'tutti' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 12, background: filterTipo === 'tutti' ? 'var(--surface3)' : 'transparent', borderColor: filterTipo === 'tutti' ? 'var(--border)' : 'transparent' }} onClick={() => setFilterTipo('tutti')}>Ferie+Permessi</button>
                        <button className={`btn-secondary ${filterTipo === 'ferie' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 12, background: filterTipo === 'ferie' ? 'var(--surface3)' : 'transparent', borderColor: filterTipo === 'ferie' ? 'var(--border)' : 'transparent' }} onClick={() => setFilterTipo('ferie')}>🌴 Ferie</button>
                        <button className={`btn-secondary ${filterTipo === 'permessi' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 12, background: filterTipo === 'permessi' ? 'var(--surface3)' : 'transparent', borderColor: filterTipo === 'permessi' ? 'var(--border)' : 'transparent' }} onClick={() => setFilterTipo('permessi')}>🕐 Permessi</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        <button className={`btn-secondary ${filterCategoria === 'tutte' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 12, background: filterCategoria === 'tutte' ? 'var(--surface3)' : 'transparent', borderColor: filterCategoria === 'tutte' ? 'var(--border)' : 'transparent' }} onClick={() => setFilterCategoria('tutte')}>📋 Tutte</button>
                        <button className={`btn-secondary ${filterCategoria === 'obbligate' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 12, background: filterCategoria === 'obbligate' ? 'var(--surface3)' : 'transparent', borderColor: filterCategoria === 'obbligate' ? 'var(--border)' : 'transparent' }} onClick={() => setFilterCategoria('obbligate')}>🏢 Obbligate</button>
                        <button className={`btn-secondary ${filterCategoria === 'richieste' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 12, background: filterCategoria === 'richieste' ? 'var(--surface3)' : 'transparent', borderColor: filterCategoria === 'richieste' ? 'var(--border)' : 'transparent' }} onClick={() => setFilterCategoria('richieste')}>👤 Richieste</button>
                    </div>

                    {giorniNomi.map((nome, i) => {
                        const valore = distribuzione[i] || 0;
                        const percentuale = (valore / maxDistrib) * 100;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div style={{ width: 40, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{nome}</div>
                                <div style={{ flex: 1, height: 20, background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${percentuale}%`, background: i === 0 || i === 6 ? 'var(--red)' : 'linear-gradient(90deg, var(--green), var(--blue))', borderRadius: 'var(--radius-sm)', transition: 'width 0.5s ease' }} />
                                </div>
                                <div style={{ width: 30, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{valore}</div>
                            </div>
                        );
                    })}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                        Totale giorni conteggiati: {Object.values(distribuzione).reduce((a, b) => a + b, 0)}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// 11. APP PRINCIPALE
// ============================================================

function App() {
    const [db, setDb] = useState(() => {
        try {
            const saved = localStorage.getItem('feriePermessi_v3');
            return saved ? JSON.parse(saved) : { users: [], currentUserId: null };
        } catch { return { users: [], currentUserId: null }; }
    });

    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [activeTab, setActiveTab] = useState('piano');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const currentUser = useMemo(() => {
        if (!db.currentUserId) return null;
        return db.users.find(u => u.id === db.currentUserId) || null;
    }, [db]);

    const entries = useMemo(() => currentUser?.entries || [], [currentUser]);

    const saveDb = useCallback((newDb) => {
        setDb(newDb);
        localStorage.setItem('feriePermessi_v3', JSON.stringify(newDb));
        if (isLoggedIn && auth.currentUser) {
            const uid = auth.currentUser.uid;
            db.collection('feriePermessi_data').doc(uid).set({
                ...newDb,
                lastModified: new Date().toISOString()
            }, { merge: true }).catch(console.error);
        }
    }, [isLoggedIn]);

    const addEntry = useCallback((entry) => {
        if (!currentUser) return;
        const newEntry = { ...entry, id: generateId() };
        const updatedUser = { ...currentUser, entries: [...(currentUser.entries || []), newEntry] };
        const newDb = { ...db, users: db.users.map(u => u.id === currentUser.id ? updatedUser : u) };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    const deleteEntry = useCallback((id) => {
        if (!currentUser) return;
        const updatedUser = { ...currentUser, entries: (currentUser.entries || []).filter(e => e.id !== id) };
        const newDb = { ...db, users: db.users.map(u => u.id === currentUser.id ? updatedUser : u) };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    const toggleObbligata = useCallback((id) => {
        if (!currentUser) return;
        const updatedUser = { ...currentUser, entries: (currentUser.entries || []).map(e => e.id === id ? { ...e, obbligata: !e.obbligata } : e) };
        const newDb = { ...db, users: db.users.map(u => u.id === currentUser.id ? updatedUser : u) };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    const confirmSim = useCallback((id) => {
        if (!currentUser) return;
        const updatedUser = { ...currentUser, entries: (currentUser.entries || []).map(e => e.id === id ? { ...e, sim: false } : e) };
        const newDb = { ...db, users: db.users.map(u => u.id === currentUser.id ? updatedUser : u) };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    const updateUser = useCallback((updatedUser) => {
        const newDb = { ...db, users: db.users.map(u => u.id === updatedUser.id ? updatedUser : u) };
        saveDb(newDb);
    }, [db, saveDb]);

    const syncFirebase = useCallback(async () => {
        if (!isLoggedIn || !auth.currentUser) {
            alert('Effettua il login prima di sincronizzare');
            return;
        }
        setIsLoading(true);
        try {
            const uid = auth.currentUser.uid;
            const doc = await db.collection('feriePermessi_data').doc(uid).get();
            if (doc.exists) {
                const remoteData = doc.data();
                const localData = JSON.parse(localStorage.getItem('feriePermessi_v3') || '{}');
                if (remoteData.lastModified && (!localData.lastModified || remoteData.lastModified > localData.lastModified)) {
                    const newDb = { ...remoteData }; delete newDb.lastModified;
                    setDb(newDb);
                    localStorage.setItem('feriePermessi_v3', JSON.stringify(newDb));
                    alert('✅ Dati sincronizzati dal cloud');
                } else {
                    await db.collection('feriePermessi_data').doc(uid).set({ ...localData, lastModified: new Date().toISOString() }, { merge: true });
                    alert('✅ Dati caricati sul cloud');
                }
            } else {
                const localData = JSON.parse(localStorage.getItem('feriePermessi_v3') || '{}');
                await db.collection('feriePermessi_data').doc(uid).set({ ...localData, lastModified: new Date().toISOString() }, { merge: true });
                alert('✅ Dati caricati sul cloud');
            }
        } catch (error) {
            console.error('Sync error:', error);
            alert('❌ Errore durante la sincronizzazione');
        }
        setIsLoading(false);
    }, [isLoggedIn]);

    const login = useCallback(() => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(result => {
            setIsLoggedIn(true);
            syncFirebase();
        }).catch(error => {
            console.error('Login error:', error);
            alert('❌ Errore login: ' + error.message);
        });
    }, [syncFirebase]);

    const logout = useCallback(() => {
        auth.signOut().then(() => setIsLoggedIn(false)).catch(console.error);
    }, []);

    const registerUser = useCallback((name, dataInizioContratto, calcMode) => {
        const newUser = {
            id: generateId(),
            name,
            dataInizioContratto,
            calcMode: calcMode || '1',
            workdayConfig: { escludiSabato: true, escludiDomenica: true },
            festivita: getFestivitaItalia(new Date().getFullYear()),
            anni: { [new Date().getFullYear()]: { ferieAnnue: 26, permessiOreAnnui: 0 } },
            permessiCCNL: { anni02: 32, anni24: 68, anni5plus: 104 },
            entries: []
        };
        const newDb = { ...db, users: [...db.users, newUser], currentUserId: newUser.id };
        saveDb(newDb);
    }, [db, saveDb]);

    if (!currentUser) {
        return (
            <div className="container" style={{ marginTop: 40 }}>
                <div className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
                    <h2 style={{ marginBottom: 8 }}>Benvenuto!</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>Configura il tuo profilo per iniziare</p>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const name = e.target.name.value;
                        const data = e.target.dataAssunzione.value;
                        const calc = e.target.calcMode.value;
                        if (!name || !data) return alert('Compila tutti i campi');
                        registerUser(name, data, calc);
                    }}>
                        <div className="form-group"><label>👤 Nome e Cognome</label><input type="text" name="name" placeholder="Mario Rossi" required /></div>
                        <div className="form-group"><label>📅 Data di assunzione</label><input type="date" name="dataAssunzione" required /></div>
                        <div className="form-group"><label>📋 Tipo contratto</label>
                            <select name="calcMode" required>
                                <option value="1">Standard (×1)</option>
                                <option value="1.2">CCNL Commercio (×1.2)</option>
                            </select>
                        </div>
                        <button type="submit" className="btn-primary">🚀 Inizia</button>
                    </form>
                    <div style={{ marginTop: 16 }}>
                        <button onClick={login} className="btn-secondary" style={{ width: '100%' }}>🔑 Accedi con Google per sync</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <Header 
                user={currentUser}
                isLoggedIn={isLoggedIn}
                onLogin={login}
                onLogout={logout}
                onSync={syncFirebase}
                onUserChange={() => {
                    const altri = db.users.filter(u => u.id !== currentUser.id);
                    if (altri.length === 0) return alert('Nessun altro utente');
                    const names = altri.map(u => u.name).join(', ');
                    const scelta = prompt(`Seleziona utente (scrivi il nome):\n${names}`);
                    if (scelta) {
                        const found = altri.find(u => u.name.toLowerCase() === scelta.toLowerCase());
                        if (found) {
                            const newDb = { ...db, currentUserId: found.id };
                            saveDb(newDb);
                        }
                    }
                }}
                onOpenSettings={() => setActiveTab('impostazioni')}
            />
            
            <MonthNavigator 
                month={currentMonth}
                year={currentYear}
                onChange={setCurrentMonth}
                onYearChange={setCurrentYear}
            />

            <Tabs active={activeTab} onChange={setActiveTab} />

            {activeTab === 'piano' && (
                <PianoTab 
                    user={currentUser}
                    year={currentYear}
                    month={currentMonth + 1}
                    entries={entries}
                    onAddEntry={addEntry}
                    onDeleteEntry={deleteEntry}
                    onToggleObbligata={toggleObbligata}
                />
            )}

            {activeTab === 'simulazione' && (
                <SimulazioneTab 
                    user={currentUser}
                    year={currentYear}
                    month={currentMonth + 1}
                    entries={entries}
                    onAddEntry={addEntry}
                    onDeleteEntry={deleteEntry}
                    onConfirm={confirmSim}
                />
            )}

            {activeTab === 'calendario' && (
                <CalendarioTab 
                    user={currentUser}
                    year={currentYear}
                    month={currentMonth + 1}
                    entries={entries}
                />
            )}

            {activeTab === 'statistiche' && (
                <StatisticheTab 
                    user={currentUser}
                    year={currentYear}
                    month={currentMonth}
                    entries={entries}
                />
            )}

            {activeTab === 'impostazioni' && (
                <div className="container">
                    <FestivitaManager user={currentUser} onUpdate={updateUser} />
                    
                    <div className="card">
                        <div className="card-title">⚙️ Impostazioni generali</div>
                        <div className="form-group">
                            <label>Modalità calcolo ferie</label>
                            <select 
                                value={currentUser.calcMode || '1'} 
                                onChange={(e) => {
                                    const updated = { ...currentUser, calcMode: e.target.value };
                                    updateUser(updated);
                                }}
                            >
                                <option value="1">Standard (×1)</option>
                                <option value="1.2">CCNL Commercio (×1.2)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Data inizio contratto</label>
                            <input 
                                type="date" 
                                value={currentUser.dataInizioContratto || ''} 
                                onChange={(e) => {
                                    const updated = { ...currentUser, dataInizioContratto: e.target.value };
                                    updateUser(updated);
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input 
                                    type="checkbox" 
                                    checked={currentUser.workdayConfig?.escludiSabato !== false} 
                                    onChange={(e) => {
                                        const updated = { 
                                            ...currentUser, 
                                            workdayConfig: { 
                                                ...currentUser.workdayConfig, 
                                                escludiSabato: e.target.checked 
                                            } 
                                        };
                                        updateUser(updated);
                                    }}
                                />
                                Escludi Sabato
                            </label>
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input 
                                    type="checkbox" 
                                    checked={currentUser.workdayConfig?.escludiDomenica !== false} 
                                    onChange={(e) => {
                                        const updated = { 
                                            ...currentUser, 
                                            workdayConfig: { 
                                                ...currentUser.workdayConfig, 
                                                escludiDomenica: e.target.checked 
                                            } 
                                        };
                                        updateUser(updated);
                                    }}
                                />
                                Escludi Domenica
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ============================================================
// 12. RENDER
// ============================================================

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

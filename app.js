// ============================================================
// FERIE & PERMESSI — React App (versione completa v20)
// ============================================================

const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ============================================================
// CORE BUSINESS LOGIC
// ============================================================

// --- Calcolo Pasquetta ---
function calcolaPasquetta(anno) {
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
    return new Date(anno, mese - 1, giorno + 1); // +1 per Pasquetta
}

// --- Festività italiane ---
function getFestivitaItalia(anno) {
    const pasquetta = calcolaPasquetta(anno);
    return [
        { id: 'capodanno', name: 'Capodanno', month: 1, day: 1, ricorrente: true },
        { id: 'epifania', name: 'Epifania', month: 1, day: 6, ricorrente: true },
        { id: 'pasquetta', name: 'Pasquetta', month: pasquetta.getMonth() + 1, day: pasquetta.getDate(), ricorrente: false, year: anno },
        { id: 'liberazione', name: 'Liberazione', month: 4, day: 25, ricorrente: true },
        { id: 'lavoratori', name: 'Lavoratori', month: 5, day: 1, ricorrente: true },
        { id: 'repubblica', name: 'Repubblica', month: 6, day: 2, ricorrente: true },
        { id: 'ferragosto', name: 'Ferragosto', month: 8, day: 15, ricorrente: true },
        { id: 'ognissanti', name: 'Ognissanti', month: 11, day: 1, ricorrente: true },
        { id: 'immacolata', name: 'Immacolata', month: 12, day: 8, ricorrente: true },
        { id: 'natale', name: 'Natale', month: 12, day: 25, ricorrente: true },
        { id: 'santo_ Stefano', name: 'Santo Stefano', month: 12, day: 26, ricorrente: true }
    ];
}

// --- Calcolo giorni lavorativi ---
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
            for (const festa of festivita) {
                if (festa.ricorrente) {
                    if (festa.month === mese && festa.day === giorno) {
                        isLavorativo = false;
                        break;
                    }
                } else if (festa.year === anno) {
                    if (festa.month === mese && festa.day === giorno) {
                        isLavorativo = false;
                        break;
                    }
                }
            }
        }
        if (isLavorativo) giorni++;
        current.setDate(current.getDate() + 1);
    }
    return giorni;
}

// --- Scaglione permessi CCNL ---
function getScaglionePermessi(anniServizioMesi) {
    if (anniServizioMesi < 24) return { label: '0-2 anni', oreAnnue: 32 };
    if (anniServizioMesi < 48) return { label: '2-4 anni', oreAnnue: 68 };
    return { label: '5+ anni', oreAnnue: 104 };
}

// --- Calcolo residuo anni precedenti (FIFO) ---
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

// --- Calcolo saldo completo ---
function calcolaSaldo(user, anno, mese) {
    const { dataInizioContratto, calcMode, anni, entries } = user;
    const prevRes = getResiduoAnniPrecedenti(user, anno);
    
    // Maturazioni mese corrente
    const mesiLavorati = dataInizioContratto ? calcolaMesiLavorati(dataInizioContratto, anno, mese) : mese;
    const matFerieMensile = (anni[anno]?.ferieAnnue || 26) / 12;
    const matFerie = matFerieMensile * mesiLavorati;
    
    // Permessi CCNL
    let matPermessi = 0;
    if (calcMode === '1.2') {
        for (let m = 1; m <= mese; m++) {
            matPermessi += calcolaPermessiMensiliCCNL(dataInizioContratto, anno, m);
        }
    } else {
        matPermessi = (anni[anno]?.permessiOreAnnui || 0) / 12 * mese;
    }
    
    // Voci del mese
    const vociFerie = entries.filter(e => 
        e.anno === anno && e.mese === mese && e.tipo === 'ferie' && !e.sim
    );
    const vociPermessi = entries.filter(e => 
        e.anno === anno && e.mese === mese && (e.tipo === 'permesso' || e.tipo === 'permesso_pagato') && !e.sim
    );
    
    const coeff = calcMode === '1.2' ? 1.2 : 1;
    const usedFerie = vociFerie.reduce((sum, e) => sum + e.qty * coeff, 0);
    const usedPermessi = vociPermessi.reduce((sum, e) => sum + e.qty, 0);
    
    // FIFO
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

// --- Utilità ---
function calcolaMesiLavorati(dataInizioContratto, anno, mese) {
    if (!dataInizioContratto) return mese;
    const inizio = new Date(dataInizioContratto);
    const fine = new Date(anno, mese - 1, 1);
    if (inizio > fine) return 0;
    const diffMesi = (fine.getFullYear() - inizio.getFullYear()) * 12 +
                     (fine.getMonth() - inizio.getMonth()) + 1;
    return Math.min(diffMesi, mese);
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

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ============================================================
// COMPONENTI REACT
// ============================================================

// --- HEADER ---
function Header({ user, onUserChange, onSync, onLogout, onLogin, isLoggedIn }) {
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
                    <div className="user-chip" onClick={onUserChange}>
                        <div className="avatar">{user.name?.[0] || '?'}</div>
                        <span className="name">{user.name || 'Utente'}</span>
                    </div>
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
        if (month === 0) {
            onChange(11);
            onYearChange(year - 1);
        } else {
            onChange(month - 1);
        }
    };
    
    const nextMonth = () => {
        if (month === 11) {
            onChange(0);
            onYearChange(year + 1);
        } else {
            onChange(month + 1);
        }
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
        { id: 'statistiche', label: '📊 Statistiche' }
    ];
    
    return (
        <div className="tabs">
            {tabs.map(t => (
                <button
                    key={t.id}
                    className={`tab-btn ${active === t.id ? 'active' : ''}`}
                    onClick={() => onChange(t.id)}
                >
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
            <div className="card-title">
                <span className="emoji">{emoji}</span> {title}
            </div>
            <div className="balance-grid">
                <div className="balance-item">
                    <div className="label">Precedenti</div>
                    <div className={`value ${data.prevResiduo < 0 ? 'red' : 'green'}`}>
                        {data.prevResiduo.toFixed(1)} {unit}
                    </div>
                </div>
                <div className="balance-item">
                    <div className="label">Correnti</div>
                    <div className="value blue">
                        {data.currResiduo.toFixed(1)} {unit}
                    </div>
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
function RequestList({
// ============================================================
// CONTINUAZIONE app.js — REQUEST LIST, MODAL, FAB, MAIN APP
// ============================================================

// --- REQUEST LIST ---
function RequestList({ entries, onDelete, onToggleObbligata, onConfirm, user, type }) {
    const filtered = entries.filter(e => e.tipo === type && !e.sim);
    if (filtered.length === 0) {
        return (
            <div className="empty-state">
                <div className="emoji">📭</div>
                <div>Nessuna voce</div>
            </div>
        );
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
                        <button 
                            onClick={() => onToggleObbligata(entry.id)}
                            style={{ background: 'none', border: 'none', color: isObbligata ? 'var(--amber)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
                            title="Toggle obbligata"
                        >
                            🏢
                        </button>
                    )}
                    {entry.sim && (
                        <button 
                            onClick={() => onConfirm(entry.id)}
                            style={{ background: 'var(--green)', border: 'none', color: 'var(--bg)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                            ✅ Conferma
                        </button>
                    )}
                    <button 
                        onClick={() => onDelete(entry.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18 }}
                    >
                        🗑
                    </button>
                </div>
            </div>
        );
    });
}

// --- MODALE INSERIMENTO FERIE ---
function ModalFerie({ isOpen, onClose, onSave, user, year, month }) {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [qty, setQty] = useState(1);
    const [note, setNote] = useState('');
    const [obbligata, setObbligata] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const oggi = new Date();
            setDateFrom(oggi.toISOString().split('T')[0]);
            setDateTo(oggi.toISOString().split('T')[0]);
            setQty(1);
            setNote('');
            setObbligata(false);
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
            tipo: 'ferie',
            dateFrom,
            dateTo,
            qty: qty,
            note: note || 'Ferie',
            mese: new Date(dateFrom).getMonth() + 1,
            anno: new Date(dateFrom).getFullYear(),
            obbligata,
            sim: false
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>🌴 Inserisci Ferie</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Data inizio</label>
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Data fine</label>
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Quantità (gg) {user?.calcMode === '1.2' && <span style={{ color: 'var(--amber)' }}>×1.2</span>}</label>
                        <input type="number" step="0.5" value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} required />
                    </div>
                    <div className="form-group">
                        <label>Note</label>
                        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo..." />
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={obbligata} onChange={(e) => setObbligata(e.target.checked)} />
                            🏢 Chiusura aziendale (obbligata)
                        </label>
                    </div>
                    <button type="submit" className="btn-primary">✅ Inserisci</button>
                </form>
            </div>
        </div>
    );
}

// --- MODALE INSERIMENTO PERMESSO ---
function ModalPermesso({ isOpen, onClose, onSave }) {
    const [date, setDate] = useState('');
    const [ore, setOre] = useState(8);
    const [note, setNote] = useState('');
    const [obbligata, setObbligata] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setDate(new Date().toISOString().split('T')[0]);
            setOre(8);
            setNote('');
            setObbligata(false);
        }
    }, [isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!date) return alert('Inserisci la data');
        onSave({
            tipo: 'permesso',
            dateFrom: date,
            dateTo: date,
            qty: ore,
            note: note || 'Permesso',
            mese: new Date(date).getMonth() + 1,
            anno: new Date(date).getFullYear(),
            obbligata,
            sim: false
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>🕐 Inserisci Permesso</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Data</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Ore</label>
                        <input type="number" step="0.5" value={ore} onChange={(e) => setOre(parseFloat(e.target.value) || 0)} required />
                    </div>
                    <div className="form-group">
                        <label>Note</label>
                        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo..." />
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={obbligata} onChange={(e) => setObbligata(e.target.checked)} />
                            🏢 Chiusura aziendale (obbligata)
                        </label>
                    </div>
                    <button type="submit" className="btn-primary">✅ Inserisci</button>
                </form>
            </div>
        </div>
    );
}

// --- MODALE LIQUIDA PERMESSI ---
function ModalLiquida({ isOpen, onClose, onSave, user, year }) {
    const [mese, setMese] = useState(new Date().getMonth() + 1);
    const [ore, setOre] = useState(0);
    const [note, setNote] = useState('Liquidazione permessi residui');

    useEffect(() => {
        if (isOpen && user) {
            // Calcola saldo disponibile
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
            qty: ore,
            note: note || 'Liquidazione permessi',
            mese,
            anno: year,
            obbligata: false,
            sim: false
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>💰 Liquida Permessi</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Mese</label>
                            <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))}>
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>
                                        {new Date(0, i).toLocaleString('it', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Anno</label>
                            <input type="number" value={year} disabled style={{ opacity: 0.7 }} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Ore da liquidare</label>
                        <input type="number" step="0.5" value={ore} onChange={(e) => setOre(parseFloat(e.target.value) || 0)} required />
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            Saldo disponibile al mese {mese}: {calcolaSaldo(user, year, mese).totali.permessi.toFixed(1)}h
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Note</label>
                        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                    <button type="submit" className="btn-primary" style={{ background: 'var(--amber)' }}>💰 Conferma</button>
                </form>
            </div>
        </div>
    );
}

// --- TAB PIANO UFFICIALE ---
function PianoTab({ user, year, month, entries, onAddEntry, onDeleteEntry, onToggleObbligata }) {
    const [modalFerie, setModalFerie] = useState(false);
    const [modalPermesso, setModalPermesso] = useState(false);
    const [modalLiquida, setModalLiquida] = useState(false);

    const saldo = calcolaSaldo(user, year, month);
    const vociMese = entries.filter(e => e.anno === year && e.mese === month && !e.sim);

    const ferieData = {
        prevResiduo: saldo.prev.residuoFerie,
        currResiduo: saldo.current.residuoFerie,
        totale: saldo.totali.ferie
    };

    const permessiData = {
        prevResiduo: saldo.prev.residuoPermessi,
        currResiduo: saldo.current.residuoPermessi,
        totale: saldo.totali.permessi
    };

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

                <div className="card">
                    <div className="card-title">🌴 Ferie</div>
                    <RequestList entries={vociMese} onDelete={onDeleteEntry} onToggleObbligata={onToggleObbligata} user={user} type="ferie" />
                </div>

                <div className="card">
                    <div className="card-title">🕐 Permessi</div>
                    <RequestList entries={vociMese} onDelete={onDeleteEntry} onToggleObbligata={onToggleObbligata} user={user} type="permesso" />
                </div>

                <div className="card">
                    <div className="card-title">💰 Permessi Liquidati</div>
                    <RequestList entries={vociMese} onDelete={onDeleteEntry} onToggleObbligata={onToggleObbligata} user={user} type="permesso_pagato" />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                    <button className="btn-primary" onClick={() => setModalFerie(true)}>🌴 Inserisci Ferie</button>
                    <button className="btn-primary" onClick={() => setModalPermesso(true)}>🕐 Inserisci Permesso</button>
                    <button className="btn-primary" style={{ background: 'var(--amber)' }} onClick={() => setModalLiquida(true)}>💰 Liquida Permessi</button>
                </div>
            </div>

            <ModalFerie 
                isOpen={modalFerie} 
                onClose={() => setModalFerie(false)} 
                onSave={onAddEntry} 
                user={user} 
                year={year} 
                month={month} 
            />
            <ModalPermesso 
                isOpen={modalPermesso} 
                onClose={() => setModalPermesso(false)} 
                onSave={onAddEntry} 
            />
            <ModalLiquida 
                isOpen={modalLiquida} 
                onClose={() => setModalLiquida(false)} 
                onSave={onAddEntry} 
                user={user} 
                year={year} 
            />
        </>
    );
}

// --- TAB SIMULAZIONE ---
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
                <RequestList 
                    entries={vociSim} 
                    onDelete={onDeleteEntry} 
                    onToggleObbligata={() => {}} 
                    onConfirm={onConfirm}
                    user={user} 
                    type="ferie" 
                />
                <RequestList 
                    entries={vociSim} 
                    onDelete={onDeleteEntry} 
                    onToggleObbligata={() => {}} 
                    onConfirm={onConfirm}
                    user={user} 
                    type="permesso" 
                />
                {vociSim.length === 0 && (
                    <div className="empty-state">
                        <div className="emoji">🔮</div>
                        <div>Nessuna simulazione</div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn-primary" onClick={() => setModalFerie(true)}>🔮 Simula Ferie</button>
                <button className="btn-primary" onClick={() => setModalPermesso(true)}>🔮 Simula Permesso</button>
            </div>

            <ModalFerie 
                isOpen={modalFerie} 
                onClose={() => setModalFerie(false)} 
                onSave={(entry) => onAddEntry({ ...entry, sim: true })} 
                user={user} 
                year={year} 
                month={month} 
            />
            <ModalPermesso 
                isOpen={modalPermesso} 
                onClose={() => setModalPermesso(false)} 
                onSave={(entry) => onAddEntry({ ...entry, sim: true })} 
            />
        </div>
    );
}

// --- TAB CALENDARIO ---
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

// --- TAB STATISTICHE ---
function StatisticheTab({ user, year, month, entries }) {
    const [periodo, setPeriodo] = useState('mese');
    const [filterTipo, setFilterTipo] = useState('tutti');
    const [filterCategoria, setFilterCategoria] = useState('tutte');

    // Filtra entries per periodo
    const getEntriesPeriodo = () => {
        if (periodo === 'mese') {
            return entries.filter(e => e.anno === year && e.mese === month);
        } else if (periodo === 'anno') {
            return entries.filter(e => e.anno === year);
        } else {
            return entries;
        }
    };

    const filtered = getEntriesPeriodo();
    const ferie = filtered.filter(e => e.tipo === 'ferie' && !e.sim);
    const permessi = filtered.filter(e => (e.tipo === 'permesso' || e.tipo === 'permesso_pagato') && !e.sim);
    const obbligate = filtered.filter(e => e.obbligata && !e.sim);

    const totalFerie = ferie.reduce((sum, e) => sum + e.qty, 0);
    const totalPermessi = permessi.reduce((sum, e) => sum + e.qty, 0);
    const totalObbligate = obbligate.reduce((sum, e) => sum + e.qty, 0);
    const totalRichieste = totalFerie + totalPermessi;

    return (
        <div className="container">
            <div className="card">
                <div className="card-title">📊 Statistiche</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="form-group" style={{ width: 'auto', padding: '8px 12px' }}>
                        <option value="mese">Mese</option>
                        <option value="anno">Anno</option>
                        <option value="totale">Totale storico</option>
                    </select>
                    <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="form-group" style={{ width: 'auto', padding: '8px 12px' }}>
                        <option value="tutti">Tutti</option>
                        <option value="ferie">🌴 Ferie</option>
                        <option value="permessi">🕐 Permessi</option>
                    </select>
                    <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="form-group" style={{ width: 'auto', padding: '8px 12px' }}>
                        <option value="tutte">Tutte</option>
                        <option value="obbligate">🏢 Obbligate</option>
                        <option value="richieste">👤 Richieste</option>
                    </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Obbligate vs Richieste</div>
                    <div className="stats-bar">
                        <div className="segment obbligate" style={{ width: totalRichieste > 0 ? `${(totalObbligate / totalRichieste) * 100}%` : '0%' }} />
                        <div className="segment richieste-ferie" style={{ width: totalRichieste > 0 ? `${(totalFerie / totalRichieste) * 100}%` : '0%' }} />
                        <div className="segment richieste-permessi" style={{ width: totalRichieste > 0 ? `${(totalPermessi / totalRichieste) * 100}%` : '0%' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        <span>🏢 Obbligate: {totalObbligate.toFixed(1)}</span>
                        <span>🌴 Ferie: {totalFerie.toFixed(1)}</span>
                        <span>🕐 Permessi: {totalPermessi.toFixed(1)}</span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Totale episodi</div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{filtered.length}</div>
                    </div>
                    <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Totale giorni/ore</div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{(totalFerie + totalPermessi).toFixed(1)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// APP PRINCIPALE
// ============================================================

function App() {
    // --- STATE ---
    const [db, setDb] = useState(() => {
        try {
            const saved = localStorage.getItem('feriePermessi_v3');
            return saved ? JSON.parse(saved) : { users: [], currentUserId: null };
        } catch {
            return { users: [], currentUserId: null };
        }
    });

    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [activeTab, setActiveTab] = useState('piano');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // --- UTILITY ---
    const currentUser = useMemo(() => {
        if (!db.currentUserId) return null;
        return db.users.find(u => u.id === db.currentUserId) || null;
    }, [db]);

    const entries = useMemo(() => {
        return currentUser?.entries || [];
    }, [currentUser]);

    // --- SALVATAGGIO ---
    const saveDb = useCallback((newDb) => {
        setDb(newDb);
        localStorage.setItem('feriePermessi_v3', JSON.stringify(newDb));
        
        // Sync su Firebase se loggato
        if (isLoggedIn && auth.currentUser) {
            const uid = auth.currentUser.uid;
            db.collection('feriePermessi_data').doc(uid).set({
                ...newDb,
                lastModified: new Date().toISOString()
            }, { merge: true }).catch(console.error);
        }
    }, [isLoggedIn]);

    // --- CRUD ENTRY ---
    const addEntry = useCallback((entry) => {
        if (!currentUser) return;
        const newEntry = { ...entry, id: generateId() };
        const updatedUser = {
            ...currentUser,
            entries: [...(currentUser.entries || []), newEntry]
        };
        const newDb = {
            ...db,
            users: db.users.map(u => u.id === currentUser.id ? updatedUser : u)
        };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    const deleteEntry = useCallback((id) => {
        if (!currentUser) return;
        const updatedUser = {
            ...currentUser,
            entries: (currentUser.entries || []).filter(e => e.id !== id)
        };
        const newDb = {
            ...db,
            users: db.users.map(u => u.id === currentUser.id ? updatedUser : u)
        };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    const toggleObbligata = useCallback((id) => {
        if (!currentUser) return;
        const updatedUser = {
            ...currentUser,
            entries: (currentUser.entries || []).map(e => 
                e.id === id ? { ...e, obbligata: !e.obbligata } : e
            )
        };
        const newDb = {
            ...db,
            users: db.users.map(u => u.id === currentUser.id ? updatedUser : u)
        };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    const confirmSim = useCallback((id) => {
        if (!currentUser) return;
        const updatedUser = {
            ...currentUser,
            entries: (currentUser.entries || []).map(e => 
                e.id === id ? { ...e, sim: false } : e
            )
        };
        const newDb = {
            ...db,
            users: db.users.map(u => u.id === currentUser.id ? updatedUser : u)
        };
        saveDb(newDb);
    }, [currentUser, db, saveDb]);

    // --- FIREBASE SYNC ---
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
                
                // Confronta timestamp
                if (remoteData.lastModified && (!localData.lastModified || remoteData.lastModified > localData.lastModified)) {
                    // Remote è più recente
                    const newDb = { ...remoteData };
                    delete newDb.lastModified;
                    setDb(newDb);
                    localStorage.setItem('feriePermessi_v3', JSON.stringify(newDb));
                    alert('✅ Dati sincronizzati dal cloud');

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
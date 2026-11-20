/* NexMet Magazzino - prototipo statico.
   Dati nel browser (localStorage). Ruoli simulati, senza sicurezza reale. */
(function () {
  'use strict';

  /* ---------- Utilità ---------- */
  var KEY = 'nexmet.magazzino.v1';
  var eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  var nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
  var STATI = ['Da verificare', 'Funzionante', 'Difettoso', 'Per macero (a peso)'];
  var RUOLI = { admin: 'Admin', modifica: 'Modifica', consulta: 'Consultazione' };

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function n(v) { return (v === '' || v == null || isNaN(Number(v))) ? 0 : Number(v); }
  function money(v) { return (v === '' || v == null) ? '—' : eur.format(Number(v)); }
  function fdate(d) { return d ? String(d).split('-').reverse().join('/') : '—'; }
  function pct(v) { return v == null ? '—' : nf.format(v) + '%'; }
  function sign(v) { return v > 0 ? 'pos' : (v < 0 ? 'neg' : ''); }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* ---------- Dati ---------- */
  function emptyDb() {
    return {
      version: 1,
      seq: 0,
      utenti: [
        { id: 'u1', nome: 'Redi', ruolo: 'admin' },
        { id: 'u2', nome: 'Elvinas', ruolo: 'consulta' }
      ],
      utenteId: 'u1',
      lotti: [],
      pezzi: [],
      anagrafiche: [],
      vendite: []
    };
  }
  function ensureUsers() {
    if (!Array.isArray(db.utenti) || !db.utenti.length) db.utenti = emptyDb().utenti;
    if (!db.utenti.some(function (u) { return u.id === db.utenteId; })) db.utenteId = db.utenti[0].id;
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(emptyDb(), JSON.parse(raw));
    } catch (e) { /* storage non disponibile */ }
    return emptyDb();
  }
  var db = load();
  ensureUsers();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('Impossibile salvare nel browser: esporta subito un backup.'); }
  }
  function byId(arr, id) { return arr.find(function (x) { return x.id === id; }); }
  function nextCode() { db.seq += 1; return 'NM-' + String(db.seq).padStart(5, '0'); }

  /* ---------- Ruoli ---------- */
  function me() { return byId(db.utenti, db.utenteId) || db.utenti[0]; }
  function canEdit() { var r = me().ruolo; return r === 'admin' || r === 'modifica'; }
  function isAdmin() { return me().ruolo === 'admin'; }
  function guardEdit() { if (!canEdit()) { toast('Il tuo ruolo permette solo la consultazione.'); return false; } return true; }
  function guardAdmin() { if (!isAdmin()) { toast('Solo l’Admin può farlo.'); return false; } return true; }

  /* ---------- Calcoli ---------- */
  function sold(p) {
    return db.vendite.filter(function (v) { return v.pezzoId === p.id; })
      .reduce(function (s, v) { return s + n(v.quantita); }, 0);
  }
  function giacenza(p) { return n(p.quantita) - sold(p); }
  // Costo del lotto ripartito per quantità sui pezzi del lotto.
  function unitCost(lottoId) {
    var l = byId(db.lotti, lottoId);
    if (!l) return 0;
    var q = db.pezzi.filter(function (p) { return p.lottoId === lottoId; })
      .reduce(function (s, p) { return s + n(p.quantita); }, 0);
    return q > 0 ? n(l.costo) / q : 0;
  }
  function pezzoMargin(p) {
    var vs = db.vendite.filter(function (v) { return v.pezzoId === p.id; });
    var venduti = vs.reduce(function (s, v) { return s + n(v.quantita); }, 0);
    var ricavi = vs.reduce(function (s, v) { return s + n(v.ricavo); }, 0);
    var uc = unitCost(p.lottoId);
    return { venduti: venduti, ricavi: ricavi, uc: uc, costoVenduti: uc * venduti, margine: ricavi - uc * venduti, giac: n(p.quantita) - venduti };
  }
  function lottoStats(l) {
    var ps = db.pezzi.filter(function (p) { return p.lottoId === l.id; });
    var st = { ps: ps, qtot: 0, giac: 0, ricavi: 0, costoVend: 0, potenziale: 0, costo: n(l.costo), uc: unitCost(l.id) };
    ps.forEach(function (p) {
      var m = pezzoMargin(p);
      st.qtot += n(p.quantita);
      st.giac += m.giac;
      st.ricavi += m.ricavi;
      st.costoVend += m.costoVenduti;
      st.potenziale += m.giac * n(p.prezzoFinale);
    });
    st.margine = st.ricavi - st.costoVend;
    st.marginePct = st.ricavi > 0 ? st.margine / st.ricavi * 100 : null;
    st.recupero = st.costo > 0 ? st.ricavi / st.costo * 100 : null;
    return st;
  }

  /* ---------- Componenti UI ---------- */
  function table(cols, rows, emptyMsg) {
    if (!rows.length) return '<div class="table-wrap"><div class="empty">' + esc(emptyMsg || 'Nessun elemento.') + '</div></div>';
    var head = cols.map(function (c) { return '<th class="' + (c.cls || '') + '">' + esc(c.h) + '</th>'; }).join('');
    var body = rows.map(function (r) {
      return '<tr>' + cols.map(function (c) { return '<td class="' + (c.cls || '') + '">' + c.f(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function btn(label, action, id, extra) {
    return '<button type="button" class="small ' + (extra || '') + '" data-action="' + action + '" data-id="' + esc(id || '') + '">' + esc(label) + '</button>';
  }
  function statoTag(s) {
    var cls = s === 'Difettoso' ? 'bad' : (s === 'Da verificare' ? 'warn' : '');
    return '<span class="tag ' + cls + '">' + esc(s || '—') + '</span>';
  }
  function fieldHtml(f, v) {
    var val = (v == null || v === '') ? (f.def == null ? '' : f.def) : v;
    var req = f.required ? ' required' : '';
    var input;
    if (f.type === 'select') {
      input = '<select name="' + f.key + '"' + req + '>' + f.options.map(function (o) {
        var ov = Array.isArray(o) ? o[0] : o;
        var ol = Array.isArray(o) ? o[1] : o;
        return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ol) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea name="' + f.key + '" rows="3">' + esc(val) + '</textarea>';
    } else {
      var extra = f.type === 'number' ? ' step="' + (f.step || 'any') + '" min="' + (f.min == null ? 0 : f.min) + '"' : '';
      if (f.list) extra += ' list="' + f.list + '"';
      input = '<input name="' + f.key + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' + req + extra + '>';
    }
    return '<label class="field' + (f.full ? ' full' : '') + '"><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span>' + input +
      (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
  }
  function openForm(title, fields, values, onSave) {
    var dlg = $('#dlg'), form = $('#dlgForm');
    form.innerHTML = '<h2>' + esc(title) + '</h2><div class="grid">' +
      fields.map(function (f) { return fieldHtml(f, values[f.key]); }).join('') +
      '</div><div class="actions"><button type="button" class="ghost" data-dlg="close">Annulla</button>' +
      '<button type="submit" class="primary">Salva</button></div>';
    form.onsubmit = function (e) {
      e.preventDefault();
      var out = {};
      fields.forEach(function (f) {
        var v = form.elements[f.key].value;
        if (f.type === 'number') v = v === '' ? '' : Number(v);
        else v = v.trim();
        out[f.key] = v;
      });
      if (onSave(out) === false) return;
      dlg.close();
    };
    dlg.showModal();
  }
  function openInfo(html) {
    var dlg = $('#dlg'), form = $('#dlgForm');
    form.innerHTML = html;
    form.onsubmit = function (e) { e.preventDefault(); dlg.close(); };
    dlg.showModal();
  }
  function closeDlg() { var d = $('#dlg'); if (d.open) d.close(); }

  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- Navigazione ---------- */
  var ROUTES = [
    ['', 'Panoramica'], ['pezzi', 'Pezzi'], ['lotti', 'Lotti'], ['anagrafiche', 'Anagrafiche'],
    ['vendite', 'Vendite'], ['margine', 'Margine'], ['etichette', 'Etichette'], ['dati', 'Dati e backup'], ['admin', 'Admin']
  ];
  function route() {
    var h = (location.hash || '#/').slice(2).split('?');
    return { path: h[0], params: new URLSearchParams(h[1] || '') };
  }
  function renderNav(path) {
    $('#nav').innerHTML = ROUTES.filter(function (r) { return r[0] !== 'admin' || isAdmin(); }).map(function (r) {
      return '<a href="#/' + r[0] + '" class="' + (r[0] === path ? 'active' : '') + '">' + r[1] + '</a>';
    }).join('');
    $('#userSelect').innerHTML = db.utenti.map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (u.id === db.utenteId ? ' selected' : '') + '>' + esc(u.nome) + ' (' + RUOLI[u.ruolo] + ')</option>';
    }).join('');
  }
  function renderPosList() {
    var set = {};
    db.pezzi.forEach(function (p) { if (p.posizione) set[p.posizione] = 1; });
    $('#posList').innerHTML = Object.keys(set).sort().map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
  }
  function render() {
    var r = route();
    var views = {
      '': viewHome, pezzi: viewPezzi, lotti: viewLotti, anagrafiche: viewAnag, vendite: viewVendite,
      margine: viewMargine, etichette: viewEtichette, dati: viewDati, admin: viewAdmin
    };
    if (r.path === 'admin' && !isAdmin()) { location.hash = '#/'; return; }
    var v = views[r.path] || viewHome;
    renderNav(views[r.path] ? r.path : '');
    renderPosList();
    v(r.params);
    if (r.path !== lastPath) { window.scrollTo(0, 0); lastPath = r.path; }
  }
  var lastPath = null;

  /* ---------- Panoramica ---------- */
  function viewHome() {
    var unita = 0, valore = 0, senzaPrezzo = 0, daVerificare = 0;
    db.pezzi.forEach(function (p) {
      var g = giacenza(p);
      unita += g;
      if (p.prezzoFinale === '' || p.prezzoFinale == null) { if (g > 0) senzaPrezzo += 1; }
      else valore += g * n(p.prezzoFinale);
      if (p.stato === 'Da verificare' && g > 0) daVerificare += 1;
    });
    var vuoto = !db.pezzi.length && !db.lotti.length;
    var ultimi = db.pezzi.slice(-5).reverse();
    $('#view').innerHTML =
      '<div class="page-head"><h1>Panoramica</h1></div>' +
      (vuoto ? '<div class="panel"><h2>Si parte da qui</h2><p>Il magazzino è vuoto. Registra il primo lotto acquistato, poi aggiungi i pezzi che ne ricavi. Per provare il sito puoi caricare dei dati di esempio.</p>' +
        '<div class="toolbar"><button class="primary" data-action="lotto-new">Aggiungi un lotto</button><button data-action="demo">Carica dati di esempio</button></div></div>' : '') +
      '<div class="cards">' +
      card('Lotti', db.lotti.length) +
      card('Tipi di pezzo', db.pezzi.length) +
      card('Unità in giacenza', nf.format(unita)) +
      card('Valore giacenza', money(valore), senzaPrezzo ? senzaPrezzo + ' pezzi senza prezzo finale' : 'al prezzo finale') +
      card('Da verificare', daVerificare, 'tipi di pezzo non ancora verificati') +
      '</div>' +
      '<div class="panel"><h2>Cerca un pezzo</h2><div class="toolbar"><input id="homeQ" type="search" placeholder="Nome, codice, posizione…" style="min-width:240px"><button class="primary" data-action="home-search">Cerca</button></div></div>' +
      '<h2>Ultimi pezzi inseriti</h2>' +
      table([
        { h: 'Codice', f: function (p) { return '<code>' + esc(p.codice) + '</code>'; } },
        { h: 'Pezzo', f: function (p) { return esc(p.nome) + '<div class="sub">' + esc([p.marca, p.modello].filter(Boolean).join(' ')) + '</div>'; } },
        { h: 'Posizione', f: function (p) { return esc(p.posizione || '—'); } },
        { h: 'Giacenza', cls: 'num', f: function (p) { return giacenza(p) + ' / ' + n(p.quantita); } }
      ], ultimi, 'Ancora nessun pezzo.');
    var q = $('#homeQ');
    if (q) q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { ui.q = q.value; location.hash = '#/pezzi'; } });
  }
  function card(label, value, sub) {
    return '<div class="card"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  /* ---------- Pezzi ---------- */
  var ui = { q: '', stato: '', tipo: '' };
  function pezzoFields() {
    return [
      { key: 'nome', label: 'Nome', required: true, full: true, hint: 'Es. RAM DDR3 8GB' },
      { key: 'marca', label: 'Marca' },
      { key: 'modello', label: 'Modello' },
      { key: 'codiceProdotto', label: 'Codice del produttore' },
      { key: 'capacita', label: 'Capacità', hint: 'Es. 8 GB, 500 GB' },
      { key: 'quantita', label: 'Quantità', type: 'number', required: true, def: 1, step: 1, min: 0 },
      { key: 'stato', label: 'Stato', type: 'select', options: STATI },
      { key: 'peso', label: 'Peso totale (g)', type: 'number', hint: 'Utile per la vendita a peso' },
      { key: 'test', label: 'Test', full: true, hint: 'Esito del test o note. Il metodo di test è ancora da definire.' },
      { key: 'posizione', label: 'Posizione di magazzino', list: 'posList', full: true, hint: 'Es. Scaffale A - Scatola 3' },
      { key: 'lottoId', label: 'Lotto di origine', type: 'select', options: [['', '— nessuno —']].concat(db.lotti.map(function (l) { return [l.id, l.nome]; })) },
      { key: 'fotoPercorso', label: 'Percorso delle foto sul PC', hint: 'Il sito salva solo il percorso, non l’immagine.' },
      { key: 'prezzoRif', label: 'Prezzo di riferimento online (€)', type: 'number', step: '0.01' },
      { key: 'prezzoIA', label: 'Opinione IA (€)', type: 'number', step: '0.01' },
      { key: 'prezzoFinale', label: 'Prezzo finale (€)', type: 'number', step: '0.01' },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  function viewPezzi() {
    var edit = canEdit();
    $('#view').innerHTML =
      '<div class="page-head"><h1>Pezzi</h1><div class="toolbar">' +
      '<input id="q" type="search" placeholder="Cerca…" value="' + esc(ui.q) + '">' +
      '<select id="fs"><option value="">Tutti gli stati</option>' + STATI.map(function (s) { return '<option' + (ui.stato === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      (edit ? '<button class="primary" data-action="pezzo-new">Nuovo pezzo</button>' : '') +
      '</div></div><div id="tbl"></div>';
    $('#q').addEventListener('input', function (e) { ui.q = e.target.value; drawPezzi(); });
    $('#fs').addEventListener('change', function (e) { ui.stato = e.target.value; drawPezzi(); });
    drawPezzi();
  }
  function drawPezzi() {
    var edit = canEdit();
    var q = ui.q.trim().toLowerCase();
    var rows = db.pezzi.filter(function (p) {
      if (ui.stato && p.stato !== ui.stato) return false;
      if (!q) return true;
      var l = byId(db.lotti, p.lottoId);
      var hay = [p.codice, p.nome, p.marca, p.modello, p.codiceProdotto, p.capacita, p.posizione, l && l.nome].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    $('#tbl').innerHTML = table([
      { h: 'Codice', f: function (p) { return '<code>' + esc(p.codice) + '</code>'; } },
      { h: 'Pezzo', f: function (p) { return '<a href="#/pezzi" data-action="pezzo-scheda" data-id="' + esc(p.id) + '">' + esc(p.nome) + '</a><div class="sub">' + esc([p.marca, p.modello, p.capacita].filter(Boolean).join(' · ')) + '</div>'; } },
      { h: 'Stato', f: function (p) { return statoTag(p.stato); } },
      { h: 'Posizione', f: function (p) { return esc(p.posizione || '—'); } },
      { h: 'Lotto', f: function (p) { var l = byId(db.lotti, p.lottoId); return l ? esc(l.nome) : '<span class="sub">—</span>'; } },
      { h: 'Giacenza', cls: 'num', f: function (p) { return giacenza(p) + ' / ' + n(p.quantita); } },
      { h: 'Prezzo finale', cls: 'num', f: function (p) { return money(p.prezzoFinale); } },
      {
        h: '', cls: 'actions', f: function (p) {
          return btn('Scheda', 'pezzo-scheda', p.id) + btn('Etichetta', 'pezzo-label', p.id) +
            (edit ? btn('Vendi', 'pezzo-sell', p.id) + btn('Modifica', 'pezzo-edit', p.id) + btn('Elimina', 'pezzo-del', p.id, 'danger') : '');
        }
      }
    ], rows, db.pezzi.length ? 'Nessun pezzo corrisponde alla ricerca.' : 'Nessun pezzo registrato.');
  }
  function newPezzo() {
    if (!guardEdit()) return;
    openForm('Nuovo pezzo', pezzoFields(), { stato: STATI[0] }, function (d) {
      d.id = uid(); d.codice = nextCode();
      db.pezzi.push(d); save(); render(); toast('Pezzo aggiunto: ' + d.codice);
    });
  }
  function editPezzo(id) {
    if (!guardEdit()) return;
    var p = byId(db.pezzi, id); if (!p) return;
    openForm('Modifica ' + p.codice, pezzoFields(), p, function (d) {
      if (n(d.quantita) < sold(p)) { toast('La quantità non può essere inferiore a quella già venduta (' + sold(p) + ').'); return false; }
      Object.assign(p, d); save(); render(); toast('Pezzo aggiornato');
    });
  }
  function delPezzo(id) {
    if (!guardEdit()) return;
    var p = byId(db.pezzi, id); if (!p) return;
    var nv = db.vendite.filter(function (v) { return v.pezzoId === id; }).length;
    if (!confirm('Eliminare ' + p.nome + (nv ? ' e le sue ' + nv + ' vendite' : '') + '?')) return;
    db.pezzi = db.pezzi.filter(function (x) { return x.id !== id; });
    db.vendite = db.vendite.filter(function (v) { return v.pezzoId !== id; });
    save(); render(); toast('Pezzo eliminato');
  }
  function schedaPezzo(id) {
    var p = byId(db.pezzi, id); if (!p) return;
    var l = byId(db.lotti, p.lottoId), m = pezzoMargin(p);
    var vs = db.vendite.filter(function (v) { return v.pezzoId === id; });
    var rows = [
      ['Codice interno', '<code>' + esc(p.codice) + '</code>'], ['Marca', esc(p.marca || '—')], ['Modello', esc(p.modello || '—')],
      ['Codice produttore', esc(p.codiceProdotto || '—')], ['Capacità', esc(p.capacita || '—')], ['Stato', statoTag(p.stato)],
      ['Test', esc(p.test || '—')], ['Peso totale', p.peso === '' || p.peso == null ? '—' : nf.format(p.peso) + ' g'],
      ['Posizione', esc(p.posizione || '—')], ['Lotto', l ? esc(l.nome) : '—'],
      ['Giacenza', giacenza(p) + ' su ' + n(p.quantita)], ['Foto sul PC', esc(p.fotoPercorso || '—')],
      ['Prezzo di riferimento', money(p.prezzoRif)], ['Opinione IA', money(p.prezzoIA)], ['Prezzo finale', money(p.prezzoFinale)],
      ['Costo attribuito (per unità)', l ? money(m.uc) : '—'], ['Ricavi', money(m.ricavi)],
      ['Margine realizzato', l || vs.length ? '<span class="' + sign(m.margine) + '">' + money(m.margine) + '</span>' : '—'],
      ['Note', esc(p.note || '—')]
    ];
    openInfo('<h2>' + esc(p.nome) + '</h2><dl class="detail">' +
      rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' +
      '<div class="actions"><button type="button" class="ghost" data-dlg="close">Chiudi</button></div>');
  }

  /* ---------- Lotti ---------- */
  function lottoFields() {
    var fornitori = db.anagrafiche.filter(function (a) { return a.tipo === 'fornitore'; });
    return [
      { key: 'nome', label: 'Nome del lotto', required: true, full: true },
      { key: 'fonte', label: 'Fonte', hint: 'Sito, asta o azienda' },
      { key: 'data', label: 'Data di acquisto', type: 'date', def: today() },
      { key: 'costo', label: 'Costo di acquisto (€)', type: 'number', required: true, step: '0.01' },
      { key: 'fornitoreId', label: 'Fornitore', type: 'select', options: [['', '— nessuno —']].concat(fornitori.map(function (f) { return [f.id, f.nome]; })) },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  function viewLotti() {
    var edit = canEdit();
    $('#view').innerHTML = '<div class="page-head"><h1>Lotti</h1>' +
      (edit ? '<button class="primary" data-action="lotto-new">Nuovo lotto</button>' : '') + '</div>' +
      table([
        { h: 'Lotto', f: function (l) { return esc(l.nome) + '<div class="sub">' + esc(l.fonte || '') + '</div>'; } },
        { h: 'Data', f: function (l) { return fdate(l.data); } },
        { h: 'Costo', cls: 'num', f: function (l) { return money(l.costo); } },
        { h: 'Unità', cls: 'num', f: function (l) { return nf.format(lottoStats(l).qtot); } },
        { h: 'Costo per unità', cls: 'num', f: function (l) { return lottoStats(l).qtot ? money(unitCost(l.id)) : '—'; } },
        {
          h: '', cls: 'actions', f: function (l) {
            return btn('Margine', 'lotto-margin', l.id) +
              (edit ? btn('Modifica', 'lotto-edit', l.id) + btn('Elimina', 'lotto-del', l.id, 'danger') : '');
          }
        }
      ], db.lotti, 'Nessun lotto registrato.');
  }
  function newLotto() {
    if (!guardEdit()) return;
    openForm('Nuovo lotto', lottoFields(), {}, function (d) {
      d.id = uid(); db.lotti.push(d); save(); render(); toast('Lotto aggiunto');
    });
  }
  function editLotto(id) {
    if (!guardEdit()) return;
    var l = byId(db.lotti, id); if (!l) return;
    openForm('Modifica lotto', lottoFields(), l, function (d) { Object.assign(l, d); save(); render(); toast('Lotto aggiornato'); });
  }
  function delLotto(id) {
    if (!guardEdit()) return;
    var l = byId(db.lotti, id); if (!l) return;
    var k = db.pezzi.filter(function (p) { return p.lottoId === id; }).length;
    if (!confirm('Eliminare il lotto "' + l.nome + '"?' + (k ? ' I ' + k + ' pezzi collegati restano in magazzino senza lotto.' : ''))) return;
    db.pezzi.forEach(function (p) { if (p.lottoId === id) p.lottoId = ''; });
    db.lotti = db.lotti.filter(function (x) { return x.id !== id; });
    save(); render(); toast('Lotto eliminato');
  }

  /* ---------- Anagrafiche ---------- */
  function anagFields() {
    return [
      { key: 'tipo', label: 'Tipo', type: 'select', options: [['cliente', 'Cliente'], ['fornitore', 'Fornitore']], required: true },
      { key: 'nome', label: 'Nome o ragione sociale', required: true },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'telefono', label: 'Telefono' },
      { key: 'indirizzo', label: 'Indirizzo', full: true },
      { key: 'paese', label: 'Paese' },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  function viewAnag() {
    var edit = canEdit();
    var rows = db.anagrafiche.filter(function (a) { return !ui.tipo || a.tipo === ui.tipo; });
    $('#view').innerHTML = '<div class="page-head"><h1>Anagrafiche</h1><div class="toolbar">' +
      '<select id="ft"><option value="">Clienti e fornitori</option><option value="cliente"' + (ui.tipo === 'cliente' ? ' selected' : '') + '>Solo clienti</option><option value="fornitore"' + (ui.tipo === 'fornitore' ? ' selected' : '') + '>Solo fornitori</option></select>' +
      (edit ? '<button class="primary" data-action="anag-new">Nuova anagrafica</button>' : '') + '</div></div>' +
      '<p class="sub">I campi sono quelli usuali; se ne servono altri si aggiungono.</p>' +
      table([
        { h: 'Nome', f: function (a) { return esc(a.nome) + '<div class="sub">' + esc(a.paese || '') + '</div>'; } },
        { h: 'Tipo', f: function (a) { return '<span class="tag">' + (a.tipo === 'fornitore' ? 'Fornitore' : 'Cliente') + '</span>'; } },
        { h: 'Contatti', f: function (a) { return esc([a.email, a.telefono].filter(Boolean).join(' · ') || '—') + '<div class="sub">' + esc(a.indirizzo || '') + '</div>'; } },
        { h: 'Note', f: function (a) { return esc(a.note || ''); } },
        { h: '', cls: 'actions', f: function (a) { return edit ? btn('Modifica', 'anag-edit', a.id) + btn('Elimina', 'anag-del', a.id, 'danger') : ''; } }
      ], rows, 'Nessuna anagrafica.');
    $('#ft').addEventListener('change', function (e) { ui.tipo = e.target.value; viewAnag(); });
  }
  function newAnag() {
    if (!guardEdit()) return;
    openForm('Nuova anagrafica', anagFields(), { tipo: ui.tipo || 'cliente' }, function (d) { d.id = uid(); db.anagrafiche.push(d); save(); render(); toast('Anagrafica aggiunta'); });
  }
  function editAnag(id) {
    if (!guardEdit()) return;
    var a = byId(db.anagrafiche, id); if (!a) return;
    openForm('Modifica anagrafica', anagFields(), a, function (d) { Object.assign(a, d); save(); render(); toast('Anagrafica aggiornata'); });
  }
  function delAnag(id) {
    if (!guardEdit()) return;
    var a = byId(db.anagrafiche, id); if (!a) return;
    if (!confirm('Eliminare "' + a.nome + '"?')) return;
    db.anagrafiche = db.anagrafiche.filter(function (x) { return x.id !== id; });
    db.lotti.forEach(function (l) { if (l.fornitoreId === id) l.fornitoreId = ''; });
    db.vendite.forEach(function (v) { if (v.clienteId === id) v.clienteId = ''; });
    save(); render(); toast('Anagrafica eliminata');
  }

  /* ---------- Vendite ---------- */
  function venditaFields(existing, pezzoId) {
    var clienti = db.anagrafiche.filter(function (a) { return a.tipo === 'cliente'; });
    var pezzi = db.pezzi.filter(function (p) { return giacenza(p) > 0 || (existing && existing.pezzoId === p.id) || p.id === pezzoId; });
    return [
      { key: 'pezzoId', label: 'Pezzo', type: 'select', required: true, full: true, options: pezzi.map(function (p) { return [p.id, p.codice + ' · ' + p.nome + ' (giacenza ' + giacenza(p) + ')']; }) },
      { key: 'quantita', label: 'Quantità venduta', type: 'number', required: true, step: 1, min: 1, def: 1 },
      { key: 'ricavo', label: 'Ricavo totale (€)', type: 'number', required: true, step: '0.01', hint: 'L’incasso totale di questa vendita' },
      { key: 'data', label: 'Data', type: 'date', def: today() },
      { key: 'clienteId', label: 'Cliente', type: 'select', options: [['', '— nessuno —']].concat(clienti.map(function (c) { return [c.id, c.nome]; })) },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  function saveVendita(d, existing) {
    var p = byId(db.pezzi, d.pezzoId);
    if (!p) { toast('Scegli un pezzo.'); return false; }
    var disponibili = giacenza(p) + (existing && existing.pezzoId === p.id ? n(existing.quantita) : 0);
    if (n(d.quantita) <= 0 || n(d.quantita) > disponibili) { toast('Quantità non valida: disponibili ' + disponibili + '.'); return false; }
    if (existing) Object.assign(existing, d); else { d.id = uid(); db.vendite.push(d); }
    save(); render(); toast('Vendita registrata');
  }
  function newVendita(pezzoId) {
    if (!guardEdit()) return;
    if (!db.pezzi.some(function (p) { return giacenza(p) > 0; })) { toast('Nessun pezzo in giacenza da vendere.'); return; }
    var first = pezzoId || (db.pezzi.find(function (p) { return giacenza(p) > 0; }) || {}).id;
    openForm('Nuova vendita', venditaFields(null, pezzoId), { pezzoId: first }, function (d) { return saveVendita(d, null); });
  }
  function editVendita(id) {
    if (!guardEdit()) return;
    var v = byId(db.vendite, id); if (!v) return;
    openForm('Modifica vendita', venditaFields(v), v, function (d) { return saveVendita(d, v); });
  }
  function delVendita(id) {
    if (!guardEdit()) return;
    if (!confirm('Eliminare questa vendita? La giacenza torna disponibile.')) return;
    db.vendite = db.vendite.filter(function (v) { return v.id !== id; });
    save(); render(); toast('Vendita eliminata');
  }
  function viewVendite() {
    var edit = canEdit();
    var rows = db.vendite.slice().sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
    $('#view').innerHTML = '<div class="page-head"><h1>Vendite</h1>' +
      (edit ? '<button class="primary" data-action="vendita-new">Nuova vendita</button>' : '') + '</div>' +
      '<p class="sub">Qui si registra quanto si è venduto e a che prezzo, per calcolare il margine. La vendita a peso e le spedizioni sono ancora da definire.</p>' +
      table([
        { h: 'Data', f: function (v) { return fdate(v.data); } },
        { h: 'Pezzo', f: function (v) { var p = byId(db.pezzi, v.pezzoId); return p ? esc(p.nome) + '<div class="sub">' + esc(p.codice) + '</div>' : '—'; } },
        { h: 'Quantità', cls: 'num', f: function (v) { return nf.format(n(v.quantita)); } },
        { h: 'Ricavo', cls: 'num', f: function (v) { return money(v.ricavo); } },
        { h: 'Cliente', f: function (v) { var c = byId(db.anagrafiche, v.clienteId); return c ? esc(c.nome) : '<span class="sub">—</span>'; } },
        { h: '', cls: 'actions', f: function (v) { return edit ? btn('Modifica', 'vendita-edit', v.id) + btn('Elimina', 'vendita-del', v.id, 'danger') : ''; } }
      ], rows, 'Nessuna vendita registrata.');
  }

  /* ---------- Margine ---------- */
  function viewMargine(params) {
    var stats = db.lotti.map(function (l) { return { l: l, s: lottoStats(l) }; });
    var tot = stats.reduce(function (a, x) {
      a.costo += x.s.costo; a.ricavi += x.s.ricavi; a.margine += x.s.margine; a.pot += x.s.potenziale; return a;
    }, { costo: 0, ricavi: 0, margine: 0, pot: 0 });
    var senzaLotto = db.pezzi.filter(function (p) { return !byId(db.lotti, p.lottoId); });
    var lottoSel = params && params.get('lotto');
    var html = '<div class="page-head"><h1>Margine</h1></div>' +
      '<div class="notice">Il costo di ogni lotto è ripartito sui pezzi <strong>per quantità</strong>. Il metodo è una proposta ancora da confermare: pezzi di valore molto diverso pesano allo stesso modo.</div>' +
      '<div class="cards">' + card('Costo dei lotti', money(tot.costo)) + card('Ricavi', money(tot.ricavi)) +
      '<div class="card"><div class="label">Margine realizzato</div><div class="value ' + sign(tot.margine) + '">' + money(tot.margine) + '</div><small>ricavi meno costo delle unità vendute</small></div>' +
      card('Ricavo potenziale giacenza', money(tot.pot), 'al prezzo finale') + '</div>' +
      '<h2>Per lotto</h2>' +
      table([
        { h: 'Lotto', f: function (x) { return esc(x.l.nome); } },
        { h: 'Costo', cls: 'num', f: function (x) { return money(x.s.costo); } },
        { h: 'Ricavi', cls: 'num', f: function (x) { return money(x.s.ricavi); } },
        { h: 'Recuperato', cls: 'num', f: function (x) { return pct(x.s.recupero); } },
        { h: 'Margine realizzato', cls: 'num', f: function (x) { return '<span class="' + sign(x.s.margine) + '">' + money(x.s.margine) + '</span>'; } },
        { h: 'Margine %', cls: 'num', f: function (x) { return pct(x.s.marginePct); } },
        { h: 'Giacenza', cls: 'num', f: function (x) { return nf.format(x.s.giac) + ' / ' + nf.format(x.s.qtot); } },
        { h: 'Potenziale', cls: 'num', f: function (x) { return money(x.s.potenziale); } },
        { h: '', cls: 'actions', f: function (x) { return btn('Dettaglio', 'lotto-margin', x.l.id); } }
      ], stats, 'Nessun lotto: registra un lotto e i suoi pezzi per vedere il margine.');
    if (lottoSel && byId(db.lotti, lottoSel)) {
      var l = byId(db.lotti, lottoSel), s = lottoStats(l);
      html += '<h2 style="margin-top:20px">Dettaglio: ' + esc(l.nome) + '</h2>' +
        '<p class="sub">Costo del lotto ' + money(s.costo) + ' diviso su ' + nf.format(s.qtot) + ' unità = ' + (s.qtot ? money(s.uc) : '—') + ' per unità.</p>' +
        table([
          { h: 'Pezzo', f: function (p) { return esc(p.nome) + '<div class="sub">' + esc(p.codice) + '</div>'; } },
          { h: 'Unità', cls: 'num', f: function (p) { return nf.format(n(p.quantita)); } },
          { h: 'Costo attribuito', cls: 'num', f: function (p) { return money(unitCost(p.lottoId) * n(p.quantita)); } },
          { h: 'Venduti', cls: 'num', f: function (p) { return nf.format(pezzoMargin(p).venduti); } },
          { h: 'Ricavi', cls: 'num', f: function (p) { return money(pezzoMargin(p).ricavi); } },
          { h: 'Margine realizzato', cls: 'num', f: function (p) { var m = pezzoMargin(p).margine; return '<span class="' + sign(m) + '">' + money(m) + '</span>'; } },
          { h: 'Giacenza', cls: 'num', f: function (p) { return nf.format(pezzoMargin(p).giac); } }
        ], s.ps, 'Nessun pezzo collegato a questo lotto.');
    }
    if (senzaLotto.length) html += '<p class="sub" style="margin-top:16px">' + senzaLotto.length + ' tipi di pezzo non sono collegati a un lotto: il loro costo non è calcolato.</p>';
    $('#view').innerHTML = html;
  }

  /* ---------- Etichette ---------- */
  var labelSel = {};
  function viewEtichette(params) {
    var ids = params && params.get('ids');
    if (ids) { labelSel = {}; ids.split(',').forEach(function (i) { labelSel[i] = true; }); }
    $('#view').innerHTML = '<div class="noprint"><div class="page-head"><h1>Etichette</h1><div class="toolbar">' +
      '<button data-action="label-all">Seleziona tutti</button><button data-action="label-none">Nessuno</button>' +
      '<button class="primary" data-action="label-print">Stampa</button></div></div>' +
      '<p class="sub">Etichette con codice a barre e posizione. Formato e stampante sono ancora da definire: questa è un’anteprima in formato 64 × 34 mm.</p>' +
      (db.pezzi.length ? '<div class="panel"><div class="pick">' + db.pezzi.map(function (p) {
        return '<label><input type="checkbox" data-pick="' + esc(p.id) + '"' + (labelSel[p.id] ? ' checked' : '') + '><span>' + esc(p.codice) + ' · ' + esc(p.nome) + '<br><small>' + esc(p.posizione || 'senza posizione') + '</small></span></label>';
      }).join('') + '</div></div>' : '<div class="empty">Nessun pezzo: aggiungine uno per stampare un’etichetta.</div>') +
      '</div><div id="labelSheet"></div>';
    drawLabels();
  }
  function drawLabels() {
    var sel = db.pezzi.filter(function (p) { return labelSel[p.id]; });
    var sheet = $('#labelSheet');
    sheet.innerHTML = sel.map(function (p) {
      return '<div class="sticker"><div class="l-name">' + esc(p.nome) + '</div><div class="l-pos">' + esc(p.posizione || '—') +
        '</div><svg class="barcode" data-code="' + esc(p.codice) + '"></svg></div>';
    }).join('');
    sheet.querySelectorAll('svg.barcode').forEach(function (svg) {
      try {
        if (!window.JsBarcode) throw new Error('libreria non caricata');
        window.JsBarcode(svg, svg.dataset.code, { format: 'CODE128', height: 40, width: 1.6, margin: 0, fontSize: 12 });
      } catch (e) {
        var d = document.createElement('div');
        d.textContent = svg.dataset.code;
        svg.replaceWith(d);
      }
    });
  }

  /* ---------- Dati e backup ---------- */
  function inventarioRows() {
    return db.pezzi.map(function (p) {
      var l = byId(db.lotti, p.lottoId), uc = unitCost(p.lottoId);
      return {
        'Codice interno': p.codice, 'Nome': p.nome, 'Marca': p.marca, 'Modello': p.modello, 'Codice produttore': p.codiceProdotto,
        'Capacità': p.capacita, 'Stato': p.stato, 'Test': p.test, 'Peso totale (g)': p.peso, 'Posizione': p.posizione,
        'Lotto': l ? l.nome : '', 'Quantità iniziale': n(p.quantita), 'Giacenza': giacenza(p),
        'Costo unitario attribuito (€)': l ? Math.round(uc * 100) / 100 : '',
        'Valore giacenza al costo (€)': l ? Math.round(uc * giacenza(p) * 100) / 100 : '',
        'Prezzo finale (€)': p.prezzoFinale
      };
    });
  }
  function lottiRows() {
    return db.lotti.map(function (l) {
      var s = lottoStats(l);
      return { 'Lotto': l.nome, 'Fonte': l.fonte, 'Data': l.data, 'Costo (€)': n(l.costo), 'Unità': s.qtot, 'Ricavi (€)': s.ricavi, 'Margine realizzato (€)': Math.round(s.margine * 100) / 100 };
    });
  }
  function toCsv(rows) {
    if (!rows.length) return '';
    var keys = Object.keys(rows[0]);
    var cell = function (v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [keys.map(cell).join(';')].concat(rows.map(function (r) { return keys.map(function (k) { return cell(r[k]); }).join(';'); })).join('\r\n');
  }
  function exportExcel() {
    if (!db.pezzi.length) { toast('Nessun pezzo da esportare.'); return; }
    var stamp = today();
    if (window.XLSX) {
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inventarioRows()), 'Inventario');
      if (db.lotti.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lottiRows()), 'Lotti');
      XLSX.writeFile(wb, 'inventario-nexmet-' + stamp + '.xlsx');
    } else {
      download('inventario-nexmet-' + stamp + '.csv', new Blob(['﻿' + toCsv(inventarioRows())], { type: 'text/csv;charset=utf-8' }));
      toast('Libreria Excel non disponibile: scaricato un CSV apribile con Excel.');
    }
  }
  function exportBackup() {
    download('backup-nexmet-' + today() + '.json', new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  }
  function importBackup(file) {
    if (!guardAdmin()) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.pezzi) || !Array.isArray(d.lotti)) throw new Error('formato');
        if (!confirm('Sostituire tutti i dati attuali con quelli del backup?')) return;
        db = Object.assign(emptyDb(), d); ensureUsers(); save(); render(); toast('Backup importato');
      } catch (e) { toast('File di backup non valido.'); }
    };
    r.readAsText(file);
  }
  function loadDemo() {
    if (!guardAdmin()) return;
    if ((db.pezzi.length || db.lotti.length) && !confirm('I dati attuali verranno sostituiti da quelli di esempio. Continuare?')) return;
    var users = db.utenti, uid0 = db.utenteId;
    db = emptyDb(); db.utenti = users; db.utenteId = uid0; ensureUsers();
    var f1 = { id: uid(), tipo: 'fornitore', nome: 'Fornitore di prova', paese: 'Italia', note: 'Dato di esempio' };
    var c1 = { id: uid(), tipo: 'cliente', nome: 'Buyer di prova', paese: 'Germania', note: 'Dato di esempio' };
    db.anagrafiche.push(f1, c1);
    var l1 = { id: uid(), nome: 'Lotto server dismessi (esempio)', fonte: 'Asta di prova', data: today(), costo: 450, fornitoreId: f1.id, note: '' };
    var l2 = { id: uid(), nome: 'Lotto schede miste (esempio)', fonte: 'Sito di prova', data: today(), costo: 120, fornitoreId: '', note: '' };
    db.lotti.push(l1, l2);
    var mk = function (o) { o.id = uid(); o.codice = nextCode(); o.test = o.test || ''; o.note = o.note || ''; o.fotoPercorso = o.fotoPercorso || ''; o.prezzoRif = o.prezzoRif == null ? '' : o.prezzoRif; o.prezzoIA = o.prezzoIA == null ? '' : o.prezzoIA; o.prezzoFinale = o.prezzoFinale == null ? '' : o.prezzoFinale; db.pezzi.push(o); return o; };
    var ram = mk({ nome: 'RAM DDR3 8GB (esempio)', marca: 'Esempio', modello: 'DDR3-1600', capacita: '8 GB', quantita: 20, stato: 'Funzionante', posizione: 'Scaffale A - Scatola 1', lottoId: l1.id, peso: 400, prezzoRif: 9, prezzoIA: 8, prezzoFinale: 8.5 });
    mk({ nome: 'RAM DDR2 per macero (esempio)', marca: 'Varie', modello: 'DDR2', capacita: '1-2 GB', quantita: 60, stato: 'Per macero (a peso)', posizione: 'Scaffale B - Scatola 2', lottoId: l1.id, peso: 1800 });
    mk({ nome: 'Disco 2,5" 500GB (esempio)', marca: 'Esempio', modello: 'SATA', capacita: '500 GB', quantita: 12, stato: 'Da verificare', posizione: 'Scaffale A - Scatola 2', lottoId: l1.id, peso: 1300 });
    mk({ nome: 'CPU Xeon E5 (esempio)', marca: 'Esempio', modello: 'E5-2600', capacita: '', quantita: 6, stato: 'Funzionante', posizione: 'Scaffale A - Scatola 3', lottoId: l1.id, peso: 120, prezzoRif: 22, prezzoFinale: 20 });
    mk({ nome: 'Schede madri miste (esempio)', marca: 'Varie', modello: '', capacita: '', quantita: 15, stato: 'Da verificare', posizione: 'Scaffale B - Scatola 1', lottoId: l2.id, peso: 6000 });
    db.vendite.push({ id: uid(), pezzoId: ram.id, quantita: 5, ricavo: 42, data: today(), clienteId: c1.id, note: 'Vendita di esempio' });
    save(); render(); toast('Dati di esempio caricati');
  }
  function wipe() {
    if (!guardAdmin()) return;
    if (!confirm('Cancellare TUTTI i dati di questo browser? L’operazione non si può annullare: esporta prima un backup.')) return;
    var users = db.utenti, uid0 = db.utenteId;
    db = emptyDb(); db.utenti = users; db.utenteId = uid0; ensureUsers(); save(); render(); toast('Dati cancellati');
  }
  function viewDati() {
    var admin = isAdmin();
    $('#view').innerHTML = '<div class="page-head"><h1>Dati e backup</h1></div>' +
      '<div class="notice">I dati restano <strong>solo in questo browser</strong>: non sono condivisi con altri dispositivi e si perdono se si cancellano i dati del browser. Esporta spesso un backup. Non inserire dati reali finché il sito è pubblico.</div>' +
      '<div class="panel"><h2>Esporta</h2><p class="sub">L’inventario in Excel, per il commercialista. Le colonne necessarie sono ancora da chiarire con lui.</p><div class="toolbar">' +
      '<button class="primary" data-action="export-xlsx">Esporta inventario in Excel</button><button data-action="export-json">Scarica backup completo (JSON)</button></div></div>' +
      '<div class="panel"><h2>Ripristina e gestisci</h2>' +
      (admin ? '<div class="toolbar"><label class="toolbar">Importa un backup <input id="importFile" type="file" accept="application/json,.json"></label></div>' +
        '<div class="toolbar" style="margin-top:10px"><button data-action="demo">Carica dati di esempio</button><button class="danger" data-action="wipe">Cancella tutti i dati</button></div>'
        : '<p class="sub">Solo l’Admin può importare backup, caricare dati di esempio o cancellare i dati.</p>') + '</div>';
    var inp = $('#importFile');
    if (inp) inp.addEventListener('change', function (e) { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
  }

  /* ---------- Admin ---------- */
  function viewAdmin() {
    $('#view').innerHTML = '<div class="page-head"><h1>Admin</h1><button class="primary" data-action="user-new">Nuovo utente</button></div>' +
      '<div class="notice">Simulazione: in questo prototipo chiunque può scegliere il proprio utente in alto a destra, quindi i ruoli <strong>non proteggono nulla</strong>. Servono per vedere come funzionerà. Il login vero arriverà con il passaggio all’hosting con database.</div>' +
      '<div class="panel"><p><strong>Admin</strong>: fa tutto e gestisce gli utenti. <strong>Modifica</strong>: inserisce e modifica i dati. <strong>Consultazione</strong>: può solo vedere.</p></div>' +
      table([
        { h: 'Utente', f: function (u) { return esc(u.nome) + (u.id === db.utenteId ? ' <span class="tag">tu</span>' : ''); } },
        {
          h: 'Ruolo', f: function (u) {
            return '<select data-role="' + esc(u.id) + '">' + Object.keys(RUOLI).map(function (k) { return '<option value="' + k + '"' + (u.ruolo === k ? ' selected' : '') + '>' + RUOLI[k] + '</option>'; }).join('') + '</select>';
          }
        },
        { h: '', cls: 'actions', f: function (u) { return u.id === db.utenteId ? '' : btn('Elimina', 'user-del', u.id, 'danger'); } }
      ], db.utenti, 'Nessun utente.');
  }
  function setRole(id, ruolo) {
    var u = byId(db.utenti, id); if (!u) return;
    if (u.ruolo === 'admin' && ruolo !== 'admin' && db.utenti.filter(function (x) { return x.ruolo === 'admin'; }).length < 2) {
      toast('Deve restare almeno un Admin.'); render(); return;
    }
    u.ruolo = ruolo; save(); render(); toast('Ruolo aggiornato');
  }
  function newUser() {
    if (!guardAdmin()) return;
    openForm('Nuovo utente', [
      { key: 'nome', label: 'Nome', required: true },
      { key: 'ruolo', label: 'Ruolo', type: 'select', options: Object.keys(RUOLI).map(function (k) { return [k, RUOLI[k]]; }), def: 'consulta' }
    ], {}, function (d) { d.id = uid(); db.utenti.push(d); save(); render(); toast('Utente aggiunto'); });
  }
  function delUser(id) {
    if (!guardAdmin()) return;
    var u = byId(db.utenti, id); if (!u || id === db.utenteId) return;
    if (u.ruolo === 'admin' && db.utenti.filter(function (x) { return x.ruolo === 'admin'; }).length < 2) { toast('Deve restare almeno un Admin.'); return; }
    if (!confirm('Eliminare l’utente ' + u.nome + '?')) return;
    db.utenti = db.utenti.filter(function (x) { return x.id !== id; });
    save(); render(); toast('Utente eliminato');
  }

  /* ---------- Eventi ---------- */
  var actions = {
    'pezzo-new': newPezzo,
    'pezzo-edit': editPezzo,
    'pezzo-del': delPezzo,
    'pezzo-scheda': schedaPezzo,
    'pezzo-sell': newVendita,
    'pezzo-label': function (id) { location.hash = '#/etichette?ids=' + encodeURIComponent(id); },
    'lotto-new': newLotto, 'lotto-edit': editLotto, 'lotto-del': delLotto,
    'lotto-margin': function (id) { location.hash = '#/margine?lotto=' + encodeURIComponent(id); },
    'anag-new': newAnag, 'anag-edit': editAnag, 'anag-del': delAnag,
    'vendita-new': function () { newVendita(); }, 'vendita-edit': editVendita, 'vendita-del': delVendita,
    'export-xlsx': exportExcel, 'export-json': exportBackup, 'demo': loadDemo, 'wipe': wipe,
    'user-new': newUser, 'user-del': delUser,
    'home-search': function () { var q = $('#homeQ'); ui.q = q ? q.value : ''; location.hash = '#/pezzi'; },
    'label-all': function () { db.pezzi.forEach(function (p) { labelSel[p.id] = true; }); viewEtichette(); },
    'label-none': function () { labelSel = {}; viewEtichette(); },
    'label-print': function () {
      if (!Object.keys(labelSel).some(function (k) { return labelSel[k]; })) { toast('Seleziona almeno un pezzo.'); return; }
      window.print();
    }
  };
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-dlg="close"]')) { closeDlg(); return; }
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var fn = actions[el.dataset.action];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    if (el.closest('#dlg') && el.dataset.action !== 'pezzo-scheda') closeDlg();
    fn(el.dataset.id);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.pick) { labelSel[t.dataset.pick] = t.checked; drawLabels(); }
    if (t.dataset && t.dataset.role) setRole(t.dataset.role, t.value);
  });
  $('#userSelect').addEventListener('change', function (e) {
    db.utenteId = e.target.value; save(); render();
    toast('Ora sei ' + me().nome + ' (' + RUOLI[me().ruolo] + ')');
  });
  $('#dlg').addEventListener('click', function (e) { if (e.target === this) closeDlg(); });
  window.addEventListener('hashchange', render);
  render();
})();

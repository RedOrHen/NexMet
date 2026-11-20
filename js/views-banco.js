/* Schermate principali: Banco di lavoro, Pezzi (elenco, scheda, modulo), Carico rapido. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util, UI = NM.ui, C = NM.calc, D = NM.data, esc = U.esc, $ = U.$;
  var V = (NM.views = NM.views || {});
  var A = (NM.act = NM.act || {});

  /* ---------- Stato dei filtri ---------- */
  var F = (NM.filters = { q: '', stati: [], tipo: '', lotto: '', senzaPos: false, senzaPrezzo: false, dati: false, sort: 'recenti', max: 150 });
  var SEL = (NM.selection = {});
  function selCount() { return Object.keys(SEL).length; }

  V.refreshPosList = function () {
    var set = {};
    D.state.pezzi.forEach(function (p) { if (p.posizione) set[p.posizione] = 1; });
    var dl = $('#posList');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'posList'; document.body.appendChild(dl); }
    dl.innerHTML = Object.keys(set).sort().map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
  };

  /* ---------- Banco di lavoro ---------- */
  function finderRows(q) {
    var s = D.state.pezzi, nq = U.norm(q).trim(), list;
    if (!nq) list = s.slice().sort(function (a, b) { return (b.creato || 0) - (a.creato || 0); });
    else list = s.filter(function (p) { return C.haystack(p).indexOf(nq) !== -1; });
    list.sort(function (a, b) { return (C.giacenza(b) > 0) - (C.giacenza(a) > 0); });
    return list.slice(0, nq ? 6 : 4);
  }
  function drawFinder(q) {
    var rows = finderRows(q), ul = $('#finderRes');
    if (!ul) return;
    if (!rows.length) { ul.innerHTML = D.state.pezzi.length ? '<li class="res-row" style="cursor:default">Nessun pezzo corrisponde a “' + esc(q) + '”.</li>' : ''; return; }
    ul.innerHTML = rows.map(function (p) {
      var g = C.giacenza(p);
      return '<li><button type="button" class="res-row" data-act="pezzo-open" data-id="' + esc(p.id) + '">' +
        '<span class="res-pos' + (p.posizione ? '' : ' none') + '">' + esc(p.posizione || 'Posizione da assegnare') + '</span>' +
        '<span class="res-name">' + esc(p.nome) + '<small>' + esc([p.marca, p.modello, p.capacita].filter(Boolean).join(' ') + (p.marca || p.modello || p.capacita ? ' — ' : '') + p.codice) + '</small></span>' +
        '<span class="res-qty">' + U.num(g) + '<small>di ' + U.num(p.quantita) + '</small></span></button></li>';
    }).join('');
  }
  function backupNote() {
    var s = D.state;
    if (!s.pezzi.length) return '';
    var last = s.ultimoBackup ? new Date(s.ultimoBackup).getTime() : 0;
    var days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    if (days !== null && days < 7) return '';
    return '<div class="note warn">' + (days === null ? 'Non hai ancora scaricato nessun backup.' : 'L’ultimo backup risale a ' + days + ' giorni fa.') +
      ' I dati stanno solo in questo browser. <button type="button" class="btn sm" data-act="backup-json">Scarica il backup</button></div>';
  }
  V.home = function (root) {
    var s = D.state, t = C.totals(), todo = C.todo();
    var bars = s.lotti.map(function (l) { return { l: l, st: C.lottoStats(l) }; })
      .sort(function (a, b) { return String(b.l.data).localeCompare(String(a.l.data)); }).slice(0, 6);
    var logs = s.log.slice(-8).reverse();
    var empty = !s.pezzi.length && !s.lotti.length;
    root.innerHTML =
      backupNote() +
      '<section class="finder"><h1>Dove si trova?</h1>' +
      '<div class="finder-bar"><input id="finderQ" type="search" placeholder="Nome, codice o posizione" autocomplete="off" aria-label="Cerca un pezzo">' +
      '<button type="button" class="btn primary" data-act="scan-open">' + UI.icon('scan') + 'Scansiona</button></div>' +
      '<p class="hint">Scrivi per vedere dove sta un pezzo e quanti ne restano. Ctrl+K cerca in tutto il magazzino.</p>' +
      '<ul class="results" id="finderRes"></ul></section>' +
      (empty ? '<div class="panel" style="margin-top:20px"><h2>Il magazzino è vuoto</h2><p class="sub">Parti da un lotto appena acquistato: lo registri insieme ai pezzi che ne ricavi. Per esplorare il sito puoi anche caricare dati di esempio.</p>' +
        '<div class="toolbar"><button type="button" class="btn primary" data-act="carico-open">' + UI.icon('plus') + 'Carica un lotto</button>' +
        '<button type="button" class="btn" data-act="goto" data-id="dati">Importa da file</button>' +
        '<button type="button" class="btn" data-act="demo-load">Carica dati di esempio</button></div></div>' : '') +
      '<dl class="strip"><div><dt>Unità in magazzino</dt><dd>' + U.num(t.unita) + '</dd></div>' +
      '<div><dt>Valore al prezzo finale</dt><dd>' + U.money(t.valore) + '</dd></div>' +
      '<div><dt>Margine realizzato</dt><dd class="' + U.sign(t.margine) + '">' + U.money(t.margine) + '</dd></div>' +
      '<div><dt>Lotti registrati</dt><dd>' + s.lotti.length + '</dd></div></dl>' +
      '<div class="cols"><section class="section"><h2>Da sistemare</h2>' +
      (todo.length ? '<ul class="queue">' + todo.map(function (x) {
        return '<li><a href="#" data-act="todo-go" data-id="' + esc(x.key) + '"><b>' + x.n + '</b><span>' + esc(x.label) + '</span></a></li>';
      }).join('') + '</ul>' : '<ul class="queue"><li class="ok">Tutto in ordine: non c’è niente da sistemare.</li></ul>') + '</section>' +
      '<section class="section"><h2>Margine per lotto</h2>' +
      (bars.length ? '<div class="bars">' + bars.map(function (x) {
        var scale = Math.max(x.st.costo, x.st.ricavi, 1);
        return '<button type="button" class="bar-row" data-act="lotto-margin" data-id="' + esc(x.l.id) + '"><span>' + esc(x.l.nome) + '</span>' +
          '<span class="bar-track" title="Incassato rispetto al costo"><span class="bar-fill' + (x.st.margine < 0 ? ' loss' : '') + '" style="width:' + Math.min(x.st.ricavi / scale * 100, 100) + '%"></span><span class="bar-cost" style="left:' + Math.min(x.st.costo / scale * 100, 100) + '%"></span></span>' +
          '<span class="' + U.sign(x.st.margine) + '">' + U.money(x.st.margine) + '</span></button>';
      }).join('') + '</div><p class="sub" style="margin-top:12px">La barra è l’incasso; la linea scura è il costo del lotto.</p>' : '<p class="muted">Nessun lotto: registrane uno per vedere quanto rende.</p>') + '</section></div>' +
      (logs.length ? '<section class="section"><h2>Ultime attività</h2><ul class="log">' + logs.map(function (e) {
        return '<li><time>' + U.ftime(e.ts) + '</time><span><b>' + esc(e.user) + '</b> ' + esc(e.action) + ' ' + esc(e.label) + '</span></li>';
      }).join('') + '</ul></section>' : '');
    drawFinder('');
    var q = $('#finderQ');
    q.addEventListener('input', U.debounce(function () { drawFinder(q.value); }, 80));
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = $('#finderRes .res-row[data-id]'); if (first) first.click(); }
    });
    if (!('ontouchstart' in window)) q.focus();
  };

  A['todo-go'] = function (el) {
    var item = C.todo().filter(function (x) { return x.key === el.dataset.id; })[0];
    if (!item) return;
    var p = item.params, route = p._route || 'pezzi';
    if (route === 'pezzi') {
      F.q = ''; F.stati = p.stato ? [p.stato] : []; F.tipo = ''; F.lotto = '';
      F.senzaPos = !!p.senzaPos; F.senzaPrezzo = !!p.senzaPrezzo; F.dati = !!p.dati;
    }
    if (route === 'vendite') NM.shipFilter = p.sped || '';
    NM.go(route);
  };

  /* ---------- Elenco pezzi ---------- */
  function filtered() {
    var nq = U.norm(F.q).trim();
    var list = D.state.pezzi.filter(function (p) {
      if (F.stati.length && F.stati.indexOf(p.stato) === -1) return false;
      if (F.tipo && p.tipo !== F.tipo) return false;
      if (F.lotto && p.lottoId !== F.lotto) return false;
      if (F.senzaPos && (p.posizione || C.giacenza(p) <= 0)) return false;
      if (F.senzaPrezzo && (U.has(p.prezzoFinale) || C.giacenza(p) <= 0 || p.stato === 'Per macero (a peso)')) return false;
      if (F.dati && !(p.datiSensibili && p.fase !== 'Vendibile' && C.giacenza(p) > 0)) return false;
      return !nq || C.haystack(p).indexOf(nq) !== -1;
    });
    var by = {
      recenti: function (a, b) { return (b.creato || 0) - (a.creato || 0); },
      nome: function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'it'); },
      posizione: function (a, b) { return String(a.posizione || '￿').localeCompare(String(b.posizione || '￿'), 'it', { numeric: true }); },
      giacenza: function (a, b) { return C.giacenza(b) - C.giacenza(a); }
    };
    return list.sort(by[F.sort] || by.recenti);
  }
  function chipsHtml() {
    var cnt = {};
    D.state.pezzi.forEach(function (p) { cnt[p.stato] = (cnt[p.stato] || 0) + 1; });
    return C.STATI.map(function (st) {
      return '<button type="button" class="filter" data-act="f-stato" data-id="' + esc(st) + '" data-tone="' + UI.tone('stato', st) + '" style="--c:var(--st-' + UI.tone('stato', st) + ')" aria-pressed="' + (F.stati.indexOf(st) !== -1) + '">' + esc(st) + ' <span class="n">' + (cnt[st] || 0) + '</span></button>';
    }).join('') +
      '<button type="button" class="filter" data-act="f-flag" data-id="senzaPos" aria-pressed="' + F.senzaPos + '">Senza posizione</button>' +
      '<button type="button" class="filter" data-act="f-flag" data-id="senzaPrezzo" aria-pressed="' + F.senzaPrezzo + '">Senza prezzo</button>' +
      '<button type="button" class="filter" data-act="f-flag" data-id="dati" aria-pressed="' + F.dati + '">Dati da trattare</button>';
  }
  function bulkHtml() {
    var n = selCount();
    if (!n || !UI.canEdit()) return n ? '<div class="bulk"><b>' + n + ' selezionati</b><button type="button" class="btn sm" data-act="bulk-labels">Etichette</button><button type="button" class="btn sm" data-act="sel-clear">Deseleziona</button></div>' : '';
    return '<div class="bulk"><b>' + n + ' selezionati</b>' +
      '<button type="button" class="btn sm" data-act="bulk-labels">Etichette</button>' +
      '<button type="button" class="btn sm" data-act="bulk-stato">Cambia stato</button>' +
      '<button type="button" class="btn sm" data-act="bulk-pos">Sposta</button>' +
      '<button type="button" class="btn sm" data-act="bulk-del">Elimina</button>' +
      '<button type="button" class="btn sm" data-act="sel-clear">Deseleziona</button></div>';
  }
  function drawPezzi() {
    var rows = filtered(), shown = rows.slice(0, F.max);
    var box = $('#pezzTable'); if (!box) return;
    var allSel = shown.length && shown.every(function (p) { return SEL[p.id]; });
    $('#bulkBox').innerHTML = bulkHtml();
    $('#pezzFilters').innerHTML = chipsHtml();
    $('#pezzCount').textContent = rows.length + (rows.length === 1 ? ' pezzo' : ' pezzi');
    box.innerHTML = UI.table([
      { h: '', cls: 'ck', f: function (p) { return '<input type="checkbox" data-act="sel-toggle" data-id="' + esc(p.id) + '"' + (SEL[p.id] ? ' checked' : '') + ' aria-label="Seleziona ' + esc(p.nome) + '">'; } },
      { h: 'Pezzo', cls: 'name', f: function (p) { return '<b>' + esc(p.nome) + '</b><small>' + esc([p.marca, p.modello, p.capacita].filter(Boolean).join(' ')) + (p.marca || p.modello || p.capacita ? ' — ' : '') + esc(p.codice) + '</small>'; } },
      { h: 'Stato', f: function (p) { return UI.chip('stato', p.stato); } },
      { h: 'Posizione', f: function (p) { return p.posizione ? '<span class="posbadge">' + esc(p.posizione) + '</span>' : '<span class="posbadge none">da assegnare</span>'; } },
      { h: 'Lotto', f: function (p) { var l = C.lotto(p.lottoId); return l ? esc(l.nome) : '<span class="muted">—</span>'; } },
      { h: 'Giacenza', cls: 'num', f: function (p) { var g = C.giacenza(p); return '<b' + (g <= 0 ? ' class="muted"' : '') + '>' + U.num(g) + '</b> <span class="muted">/ ' + U.num(p.quantita) + '</span>'; } },
      { h: 'Prezzo', cls: 'num', f: function (p) { return U.money(p.prezzoFinale); } },
      { h: '', cls: 'acts', f: function (p) { return (UI.canEdit() && C.giacenza(p) > 0 ? UI.btn('Vendi', 'pezzo-sell', p.id) + ' ' : '') + UI.btn('Etichetta', 'pezzo-label', p.id); } }
    ], shown, {
      click: true,
      rowAttr: function (p) { return ' data-act="pezzo-open" data-id="' + esc(p.id) + '"'; },
      empty: D.state.pezzi.length ? '<b>Nessun pezzo con questi filtri</b>Togli un filtro o cambia la ricerca.' :
        '<b>Ancora nessun pezzo</b>Carica un lotto per registrare i pezzi.'
    });
    if (rows.length > shown.length) box.insertAdjacentHTML('beforeend', '<p class="sub" style="margin-top:10px">Mostrati i primi ' + shown.length + ' di ' + rows.length + '. Affina la ricerca per vedere gli altri. <button type="button" class="btn sm" data-act="f-more">Mostra altri</button></p>');
    var master = $('#selAll'); if (master) master.checked = !!allSel;
  }
  V.pezzi = function (root, params) {
    if (params && params.get('lotto')) { F.lotto = params.get('lotto'); }
    root.innerHTML =
      '<div class="page-head"><div><h1>Pezzi</h1><p class="sub" id="pezzCount"></p></div><div class="toolbar">' +
      (UI.canEdit() ? '<button type="button" class="btn primary" data-act="pezzo-new">' + UI.icon('plus') + 'Nuovo pezzo</button><button type="button" class="btn" data-act="carico-open">Carica un lotto</button>' : '') +
      '</div></div>' +
      '<div class="toolbar" style="margin-bottom:10px"><input id="pezzQ" type="search" placeholder="Cerca per nome, codice, posizione" value="' + esc(F.q) + '" aria-label="Cerca">' +
      '<select id="pezzTipo" aria-label="Tipo"><option value="">Tutti i tipi</option>' + C.TIPI.map(function (t) { return '<option' + (F.tipo === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<select id="pezzLotto" aria-label="Lotto"><option value="">Tutti i lotti</option>' + D.state.lotti.map(function (l) { return '<option value="' + esc(l.id) + '"' + (F.lotto === l.id ? ' selected' : '') + '>' + esc(l.nome) + '</option>'; }).join('') + '</select>' +
      '<select id="pezzSort" aria-label="Ordine">' + [['recenti', 'Più recenti'], ['nome', 'Nome'], ['posizione', 'Posizione'], ['giacenza', 'Giacenza']].map(function (o) { return '<option value="' + o[0] + '"' + (F.sort === o[0] ? ' selected' : '') + '>Ordina: ' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="filters" id="pezzFilters" style="margin-bottom:12px"></div><div id="bulkBox"></div><div id="pezzTable"></div>';
    $('#pezzQ').addEventListener('input', U.debounce(function (e) { F.q = e.target.value; F.max = 150; drawPezzi(); }, 100));
    $('#pezzTipo').addEventListener('change', function (e) { F.tipo = e.target.value; drawPezzi(); });
    $('#pezzLotto').addEventListener('change', function (e) { F.lotto = e.target.value; drawPezzi(); });
    $('#pezzSort').addEventListener('change', function (e) { F.sort = e.target.value; drawPezzi(); });
    drawPezzi();
  };
  V.redrawPezzi = drawPezzi;

  A['f-stato'] = function (el) {
    var i = F.stati.indexOf(el.dataset.id);
    if (i === -1) F.stati.push(el.dataset.id); else F.stati.splice(i, 1);
    drawPezzi();
  };
  A['f-flag'] = function (el) { F[el.dataset.id] = !F[el.dataset.id]; drawPezzi(); };
  A['f-more'] = function () { F.max += 150; drawPezzi(); };
  A['sel-toggle'] = function (el) { if (el.checked) SEL[el.dataset.id] = true; else delete SEL[el.dataset.id]; $('#bulkBox').innerHTML = bulkHtml(); };
  A['sel-clear'] = function () { Object.keys(SEL).forEach(function (k) { delete SEL[k]; }); drawPezzi(); };
  A['bulk-labels'] = function () { NM.go('etichette', { ids: Object.keys(SEL).join(',') }); };
  A['bulk-stato'] = function () {
    if (!UI.guardEdit()) return;
    UI.form('Cambia stato a ' + selCount() + ' pezzi', [{ key: 'stato', label: 'Nuovo stato', type: 'select', options: C.STATI }], {}, function (v) {
      var ids = Object.keys(SEL);
      ids.forEach(function (id) { var p = C.pezzo(id); if (p) D.put('pezzi', Object.assign({}, p, { stato: v.stato })); });
      D.log('ha cambiato lo stato in "' + v.stato + '" a', 'pezzi', '', ids.length + ' pezzi');
      A['sel-clear'](); UI.toast('Stato aggiornato su ' + ids.length + ' pezzi.');
    });
  };
  A['bulk-pos'] = function () {
    if (!UI.guardEdit()) return;
    UI.form('Sposta ' + selCount() + ' pezzi', [{ key: 'posizione', label: 'Nuova posizione', required: true, list: 'posList', hint: 'Es. Scaffale A - Scatola 3' }], {}, function (v) {
      var ids = Object.keys(SEL);
      ids.forEach(function (id) { var p = C.pezzo(id); if (p) D.put('pezzi', Object.assign({}, p, { posizione: v.posizione })); });
      D.log('ha spostato in "' + v.posizione + '"', 'pezzi', '', ids.length + ' pezzi');
      V.refreshPosList(); A['sel-clear'](); UI.toast('Spostati ' + ids.length + ' pezzi.');
    });
  };
  A['bulk-del'] = function () {
    if (!UI.guardEdit()) return;
    var ids = Object.keys(SEL);
    if (!confirm('Eliminare ' + ids.length + ' pezzi e le loro vendite?')) return;
    var removed = ids.map(function (id) { return deletePezzoQuiet(id); }).filter(Boolean);
    D.log('ha eliminato', 'pezzi', '', removed.length + ' pezzi');
    A['sel-clear'](); NM.render();
    UI.toast('Eliminati ' + removed.length + ' pezzi.', { label: 'Annulla', onAction: function () { restoreRemoved(removed); } });
  };

  /* ---------- Modulo pezzo ---------- */
  function pezzoFields() {
    return [
      { key: 'nome', label: 'Nome', required: true, full: true, hint: 'Es. RAM DDR3 8GB' },
      { key: 'tipo', label: 'Tipo', type: 'select', options: C.TIPI },
      { key: 'quantita', label: 'Quantità', type: 'number', required: true, def: 1, step: 1 },
      { key: 'marca', label: 'Marca' },
      { key: 'modello', label: 'Modello' },
      { key: 'codiceProdotto', label: 'Codice del produttore' },
      { key: 'capacita', label: 'Capacità', hint: 'Es. 8 GB, 500 GB' },
      { key: 'stato', label: 'Stato', type: 'select', options: C.STATI },
      { key: 'peso', label: 'Peso totale (g)', type: 'number', hint: 'Serve per le vendite a peso' },
      { key: 'posizione', label: 'Posizione di magazzino', list: 'posList', full: true, hint: 'Es. Scaffale A - Scatola 3' },
      { key: 'lottoId', label: 'Lotto di origine', type: 'select', full: true, options: [['', '— nessuno —']].concat(D.state.lotti.map(function (l) { return [l.id, l.nome]; })) },
      { key: 'test', label: 'Test', full: true, hint: 'Esito o note. Il metodo di test è ancora da definire.' },
      { key: 'fotoPercorso', label: 'Percorso delle foto sul PC', full: true, hint: 'Il sito salva solo il percorso, non l’immagine.' },
      { key: 'prezzoRif', label: 'Prezzo di riferimento online (€)', type: 'number', step: '0.01' },
      { key: 'prezzoIA', label: 'Opinione IA (€)', type: 'number', step: '0.01' },
      { key: 'prezzoFinale', label: 'Prezzo finale (€)', type: 'number', step: '0.01' },
      { key: 'datiSensibili', label: 'Supporto che può contenere dati (disco, SSD)', type: 'checkbox', full: true },
      { key: 'fase', label: 'Fase del trattamento dati', type: 'select', options: C.FASI, dep: 'datiSensibili' },
      { key: 'certificato', label: 'Riferimento del certificato di cancellazione', dep: 'datiSensibili' },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  V.pezzoNew = function (preset) {
    if (!UI.guardEdit()) return;
    UI.form('Nuovo pezzo', pezzoFields(), Object.assign({ stato: C.STATI[0], tipo: 'Altro', fase: C.FASI[0] }, preset || {}), function (v) {
      var code;
      try { code = D.nextCode(); } catch (e) { UI.toast(e.message); return false; }
      var p = Object.assign({ id: U.uid(), codice: code, creato: Date.now() }, v);
      D.put('pezzi', p);
      D.log('ha aggiunto', 'pezzi', p.id, p.nome + ' (' + p.codice + ')');
      V.refreshPosList(); NM.render(); UI.toast('Pezzo aggiunto: ' + p.codice);
    });
  };
  V.pezzoEdit = function (id) {
    if (!UI.guardEdit()) return;
    var p = C.pezzo(id); if (!p) return;
    UI.form('Modifica ' + p.codice, pezzoFields(), p, function (v) {
      if (U.n(v.quantita) < C.sold(p)) { UI.toast('La quantità non può essere inferiore a quella già venduta (' + C.sold(p) + ').'); return false; }
      D.put('pezzi', Object.assign({}, p, v));
      D.log('ha modificato', 'pezzi', p.id, p.nome + ' (' + p.codice + ')');
      V.refreshPosList(); NM.render(); if (UI.drawerOpen()) V.openPezzo(id, UI.drawerState && UI.drawerState.tab);
      UI.toast('Pezzo aggiornato');
    });
  };
  function deletePezzoQuiet(id) {
    var p = C.pezzo(id); if (!p) return null;
    var vs = D.state.vendite.filter(function (v) { return v.pezzoId === id; });
    D.remove('pezzi', id);
    vs.forEach(function (v) { D.remove('vendite', v.id); });
    return { p: p, vs: vs };
  }
  function restoreRemoved(list) {
    list.forEach(function (r) { D.put('pezzi', r.p); r.vs.forEach(function (v) { D.put('vendite', v); }); });
    D.log('ha ripristinato', 'pezzi', '', list.length + ' pezzi');
    NM.render(); UI.toast('Ripristinato.');
  }
  V.pezzoDelete = function (id) {
    if (!UI.guardEdit()) return;
    var p = C.pezzo(id); if (!p) return;
    var nv = D.state.vendite.filter(function (v) { return v.pezzoId === id; }).length;
    if (!confirm('Eliminare "' + p.nome + '"' + (nv ? ' e le sue ' + nv + ' vendite' : '') + '?')) return;
    var r = deletePezzoQuiet(id);
    D.log('ha eliminato', 'pezzi', id, p.nome + ' (' + p.codice + ')');
    UI.closeDrawer(); NM.render();
    UI.toast('Pezzo eliminato.', { label: 'Annulla', onAction: function () { restoreRemoved([r]); } });
  };
  V.pezzoDuplicate = function (id) {
    var p = C.pezzo(id); if (!p) return;
    var copy = Object.assign({}, p); delete copy.id; delete copy.codice; delete copy.creato;
    UI.closeDrawer(); V.pezzoNew(copy);
  };

  A['pezzo-new'] = function () { V.pezzoNew(); };
  A['pezzo-edit'] = function (el) { V.pezzoEdit(el.dataset.id); };
  A['pezzo-del'] = function (el) { V.pezzoDelete(el.dataset.id); };
  A['pezzo-dup'] = function (el) { V.pezzoDuplicate(el.dataset.id); };
  A['pezzo-label'] = function (el) { UI.closeDrawer(); NM.go('etichette', { ids: el.dataset.id }); };
  A['pezzo-open'] = function (el) { V.openPezzo(el.dataset.id); };

  /* ---------- Scheda pezzo (pannello laterale) ---------- */
  V.openPezzo = function (id, tab) {
    var p = C.pezzo(id); if (!p) return;
    tab = tab || 'scheda';
    UI.drawerState = { id: id, tab: tab };
    var m = C.pezzoStats(p), l = C.lotto(p.lottoId), edit = UI.canEdit();
    var nextFase = p.datiSensibili ? C.FASI[C.FASI.indexOf(p.fase) + 1] : null;
    var body;
    if (tab === 'vendite') {
      var vs = D.state.vendite.filter(function (v) { return v.pezzoId === id; }).sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
      body = vs.length ? '<ul class="log">' + vs.map(function (v) {
        var c = C.anag(v.clienteId);
        return '<li><time>' + U.fdate(v.data) + '</time><span><b>' + U.num(v.quantita) + ' pz</b> per ' + U.money(v.ricavo) + (c ? ' a ' + esc(c.nome) : '') + ' ' + (v.spedStato ? UI.chip('sped', v.spedStato) : '') + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted">Nessuna vendita registrata per questo pezzo.</p>';
    } else if (tab === 'storico') {
      var es = D.state.log.filter(function (e) { return e.refId === id; }).reverse();
      body = es.length ? '<ul class="log">' + es.map(function (e) { return '<li><time>' + U.ftime(e.ts) + '</time><span><b>' + esc(e.user) + '</b> ' + esc(e.action) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Nessuna modifica registrata.</p>';
    } else {
      var rows = [
        ['Marca e modello', esc([p.marca, p.modello].filter(Boolean).join(' ') || '—')], ['Codice produttore', esc(p.codiceProdotto || '—')], ['Capacità', esc(p.capacita || '—')],
        ['Peso totale', U.has(p.peso) ? U.num(p.peso) + ' g' : '—'], ['Test', esc(p.test || '—')], ['Lotto', l ? esc(l.nome) : '—'],
        ['Foto sul PC', esc(p.fotoPercorso || '—')], ['Prezzo di riferimento', U.money(p.prezzoRif)], ['Opinione IA', U.money(p.prezzoIA)], ['Prezzo finale', U.money(p.prezzoFinale)],
        ['Costo per unità', l ? U.money(m.uc) : '—'], ['Incassato', U.money(m.ricavi)],
        ['Margine realizzato', l || m.venduti ? '<span class="' + U.sign(m.margine) + '">' + U.money(m.margine) + '</span>' : '—']
      ];
      if (p.datiSensibili) rows.splice(5, 0, ['Trattamento dati', UI.chip('fase', p.fase || C.FASI[0])], ['Certificato', esc(p.certificato || '—')]);
      if (p.note) rows.push(['Note', esc(p.note)]);
      body = '<dl class="detail">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
    }
    UI.drawer(
      '<div class="drawer-head"><div><h2>' + esc(p.nome) + '</h2><p class="sub">' + esc([p.tipo, p.marca, p.modello].filter(Boolean).join(' ')) + '</p><span class="code">' + esc(p.codice) + '</span> ' + UI.chip('stato', p.stato) + '</div>' +
      '<button type="button" class="btn ghost" data-act="drawer-close" aria-label="Chiudi">' + UI.icon('close') + '</button></div>' +
      '<div class="where"><div><small>Posizione</small><b>' + esc(p.posizione || 'Da assegnare') + '</b></div>' +
      '<div class="stock">' + (edit ? '<button type="button" class="btn" data-act="qty-adj" data-id="' + esc(id) + '" data-d="-1" aria-label="Togli un pezzo">−</button>' : '') +
      '<div class="qty">' + U.num(m.giac) + '<br><small class="qsub">di ' + U.num(p.quantita) + '</small></div>' +
      (edit ? '<button type="button" class="btn" data-act="qty-adj" data-id="' + esc(id) + '" data-d="1" aria-label="Aggiungi un pezzo">+</button>' : '') + '</div></div>' +
      '<div class="tabs" role="tablist">' + [['scheda', 'Scheda'], ['vendite', 'Vendite'], ['storico', 'Storico']].map(function (t) {
        return '<button type="button" role="tab" data-act="drawer-tab" data-id="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div>' + body +
      '<div class="actions-row">' + (edit && m.giac > 0 ? '<button type="button" class="btn primary" data-act="pezzo-sell" data-id="' + esc(id) + '">Vendi</button>' : '') +
      '<button type="button" class="btn" data-act="pezzo-label" data-id="' + esc(id) + '">' + UI.icon('print') + 'Etichetta</button>' +
      (edit ? '<button type="button" class="btn" data-act="pezzo-edit" data-id="' + esc(id) + '">Modifica</button><button type="button" class="btn" data-act="pezzo-dup" data-id="' + esc(id) + '">Duplica</button>' : '') +
      (edit && nextFase ? '<button type="button" class="btn" data-act="fase-next" data-id="' + esc(id) + '">Avanza a “' + esc(nextFase) + '”</button>' : '') +
      (edit ? '<button type="button" class="btn danger" data-act="pezzo-del" data-id="' + esc(id) + '">Elimina</button>' : '') + '</div>');
  };
  A['drawer-tab'] = function (el) { V.openPezzo(UI.drawerState.id, el.dataset.id); };
  A['qty-adj'] = function (el) {
    if (!UI.guardEdit()) return;
    var p = C.pezzo(el.dataset.id), d = Number(el.dataset.d); if (!p) return;
    var q = U.n(p.quantita) + d;
    if (q < C.sold(p)) { UI.toast('Non puoi scendere sotto le unità già vendute.'); return; }
    D.put('pezzi', Object.assign({}, p, { quantita: q }));
    D.log('ha corretto la quantità a ' + q + ' per', 'pezzi', p.id, p.nome);
    V.openPezzo(p.id, UI.drawerState && UI.drawerState.tab); NM.render();
  };
  A['fase-next'] = function (el) {
    if (!UI.guardEdit()) return;
    var p = C.pezzo(el.dataset.id); if (!p) return;
    var next = C.FASI[C.FASI.indexOf(p.fase) + 1]; if (!next) return;
    D.put('pezzi', Object.assign({}, p, { fase: next }));
    D.log('ha portato a "' + next + '"', 'pezzi', p.id, p.nome);
    V.openPezzo(p.id, UI.drawerState && UI.drawerState.tab); NM.render();
  };

  /* ---------- Carico rapido di un lotto ---------- */
  var caricoLast = null;
  function caricoRow(v) {
    v = v || {};
    return '<tr><td><select data-f="tipo" aria-label="Tipo">' + C.TIPI.map(function (t) { return '<option' + (v.tipo === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></td>' +
      '<td><input data-f="nome" value="' + esc(v.nome || '') + '" placeholder="Es. RAM DDR3 8GB" aria-label="Nome"></td>' +
      '<td><input class="q" data-f="quantita" type="number" min="1" step="1" value="' + esc(v.quantita || 1) + '" aria-label="Quantità"></td>' +
      '<td><input class="w" data-f="peso" type="number" min="0" step="any" value="' + esc(v.peso == null ? '' : v.peso) + '" aria-label="Peso in grammi"></td>' +
      '<td><select data-f="stato" aria-label="Stato">' + C.STATI.map(function (t) { return '<option' + (v.stato === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></td>' +
      '<td><input data-f="posizione" list="posList" value="' + esc(v.posizione || '') + '" placeholder="Scaffale - Scatola" aria-label="Posizione"></td>' +
      '<td><input data-f="datiSensibili" type="checkbox"' + (v.datiSensibili ? ' checked' : '') + ' aria-label="Può contenere dati"></td>' +
      '<td><button type="button" class="btn ghost sm" data-act="carico-del" aria-label="Togli la riga">' + UI.icon('close') + '</button></td></tr>';
  }
  function readRow(tr) {
    var o = {};
    U.$$('[data-f]', tr).forEach(function (el) { o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    return o;
  }
  V.caricoOpen = function () {
    if (!UI.guardEdit()) return;
    var fornitori = D.state.anagrafiche.filter(function (a) { return a.tipo === 'fornitore'; });
    var fields = [
      { key: 'nome', label: 'Nome del lotto', required: true, full: true, hint: 'Es. Server dismessi azienda X' },
      { key: 'fonte', label: 'Fonte', hint: 'Sito, asta o azienda' },
      { key: 'data', label: 'Data di acquisto', type: 'date', def: U.today() },
      { key: 'costo', label: 'Costo di acquisto (€)', type: 'number', required: true, step: '0.01' },
      { key: 'fornitoreId', label: 'Fornitore', type: 'select', options: [['', '— nessuno —']].concat(fornitori.map(function (f) { return [f.id, f.nome]; })) },
      { key: 'ripartizione', label: 'Come ripartire il costo sui pezzi', type: 'select', full: true, options: [['quantita', 'Per quantità (predefinito)'], ['valore', 'Per valore stimato (serve un prezzo su ogni pezzo)']] }
    ];
    var d = UI.openDialog('<form id="caricoForm"><h2>Carica un lotto</h2><p class="sub">Registra il lotto e i pezzi che ne hai ricavato. Invio nell’ultima riga ne aggiunge un’altra.</p>' +
      '<div class="grid">' + UI.fieldsHtml(fields, {}) + '</div><h3>Pezzi del lotto</h3>' +
      '<div class="carico-wrap"><table class="carico"><thead><tr><th>Tipo</th><th>Nome</th><th>Qtà</th><th>Peso (g)</th><th>Stato</th><th>Posizione</th><th>Dati</th><th></th></tr></thead><tbody id="caricoRows">' + caricoRow() + '</tbody></table></div>' +
      '<div class="toolbar" style="margin-top:8px"><button type="button" class="btn" data-act="carico-add">' + UI.icon('plus') + 'Aggiungi riga</button>' +
      '<button type="button" class="btn ghost" data-act="carico-pos">Stessa posizione su tutte le righe</button></div>' +
      '<p class="sub" style="margin-top:8px">Dati: spunta i dischi e gli altri supporti che possono contenere dati.</p>' +
      '<div class="dlg-actions"><button type="button" class="btn ghost" data-act="dlg-close">Annulla</button><button type="submit" class="btn primary">Salva lotto e pezzi</button></div></form>', { wide: true });
    var form = $('#caricoForm', d); caricoLast = form;
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
      var tr = e.target.closest('#caricoRows tr');
      if (!tr) return;
      e.preventDefault();
      var f = e.target.dataset.f, next = tr.nextElementSibling;
      if (!next) { A['carico-add'](); next = tr.nextElementSibling; }
      var t = next && next.querySelector('[data-f="' + f + '"]'); if (t) t.focus();
    });
    form.onsubmit = function (e) {
      e.preventDefault();
      var lot = UI.readFields(form, fields);
      var rows = U.$$('#caricoRows tr', form).map(readRow).filter(function (r) { return r.nome; });
      if (!rows.length) { UI.toast('Aggiungi almeno un pezzo con un nome.'); return; }
      var btnSave = form.querySelector('button[type=submit]'); btnSave.disabled = true;
      D.reserveCodes(rows.length).then(function () {
      var l = Object.assign({ id: U.uid() }, lot);
      D.put('lotti', l);
      rows.forEach(function (r) {
        D.put('pezzi', {
          id: U.uid(), codice: D.nextCode(), creato: Date.now(), lottoId: l.id, nome: r.nome, tipo: r.tipo, quantita: Math.max(1, U.n(r.quantita)),
          peso: r.peso === '' ? '' : Number(r.peso), stato: r.stato, posizione: r.posizione, datiSensibili: !!r.datiSensibili, fase: C.FASI[0],
          marca: '', modello: '', codiceProdotto: '', capacita: '', test: '', fotoPercorso: '', prezzoRif: '', prezzoIA: '', prezzoFinale: '', certificato: '', note: ''
        });
      });
      D.log('ha caricato il lotto', 'lotti', l.id, l.nome + ' con ' + rows.length + ' tipi di pezzo');
      UI.closeDialog(); V.refreshPosList();
      F.q = ''; F.stati = []; F.tipo = ''; F.lotto = l.id; F.senzaPos = F.senzaPrezzo = F.dati = false;
      NM.go('pezzi'); UI.toast('Lotto salvato con ' + rows.length + ' tipi di pezzo.');
      }).catch(function (e) { btnSave.disabled = false; UI.toast('Non riesco a riservare i codici: ' + (e && e.message)); });
    };
    var firstIn = form.querySelector('input'); if (firstIn && !('ontouchstart' in window)) firstIn.focus();
  };
  A['carico-open'] = function () { V.caricoOpen(); };
  A['carico-add'] = function () {
    var body = $('#caricoRows'); if (!body) return;
    var last = body.lastElementChild, prev = last ? readRow(last) : {};
    body.insertAdjacentHTML('beforeend', caricoRow({ tipo: prev.tipo, stato: prev.stato, posizione: prev.posizione, quantita: 1 }));
    var nm = body.lastElementChild.querySelector('[data-f="nome"]'); if (nm) nm.focus();
  };
  A['carico-del'] = function (el) {
    var tr = el.closest('tr'), body = $('#caricoRows');
    if (body.children.length > 1) tr.remove(); else U.$$('input[data-f=nome]', tr).forEach(function (i) { i.value = ''; });
  };
  A['carico-pos'] = function () {
    var rows = U.$$('#caricoRows tr'), first = rows[0] && rows[0].querySelector('[data-f="posizione"]');
    if (!first || !first.value.trim()) { UI.toast('Scrivi prima la posizione nella prima riga.'); return; }
    rows.forEach(function (r) { r.querySelector('[data-f="posizione"]').value = first.value; });
  };
})();

/* Schermate operative: Lotti, Vendite, Margine, Rubrica, Etichette, Scansione. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util, UI = NM.ui, C = NM.calc, D = NM.data, esc = U.esc, $ = U.$;
  var V = (NM.views = NM.views || {});
  var A = (NM.act = NM.act || {});

  /* ---------- Lotti ---------- */
  function lottoFields() {
    var fornitori = D.state.anagrafiche.filter(function (a) { return a.tipo === 'fornitore'; });
    return [
      { key: 'nome', label: 'Nome del lotto', required: true, full: true },
      { key: 'fonte', label: 'Fonte', hint: 'Sito, asta o azienda' },
      { key: 'data', label: 'Data di acquisto', type: 'date', def: U.today() },
      { key: 'costo', label: 'Costo di acquisto (€)', type: 'number', required: true, step: '0.01' },
      { key: 'fornitoreId', label: 'Fornitore', type: 'select', options: [['', '— nessuno —']].concat(fornitori.map(function (f) { return [f.id, f.nome]; })) },
      { key: 'ripartizione', label: 'Come ripartire il costo sui pezzi', type: 'select', full: true, options: [['quantita', 'Per quantità (predefinito)'], ['valore', 'Per valore stimato (serve un prezzo su ogni pezzo)']] },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  V.lotti = function (root) {
    var edit = UI.canEdit();
    var rows = D.state.lotti.slice().sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
    root.innerHTML = '<div class="page-head"><div><h1>Lotti</h1><p class="sub">Ogni acquisto, con il costo ripartito sui pezzi che ne ricavi.</p></div><div class="toolbar">' +
      (edit ? '<button type="button" class="btn primary" data-act="carico-open">' + UI.icon('plus') + 'Carica un lotto</button>' : '') + '</div></div>' +
      UI.table([
        { h: 'Lotto', cls: 'name', f: function (l) { return '<b>' + esc(l.nome) + '</b><small>' + esc(l.fonte || '') + '</small>'; } },
        { h: 'Data', f: function (l) { return U.fdate(l.data); } },
        { h: 'Costo', cls: 'num', f: function (l) { return U.money(l.costo); } },
        { h: 'Pezzi', cls: 'num', f: function (l) { var s = C.lottoStats(l); return s.ps.length + ' tipi, ' + U.num(s.qtot) + ' unità'; } },
        { h: 'Costo per unità', cls: 'num', f: function (l) { var s = C.lottoStats(l); return s.qtot ? U.money(l.costo / s.qtot) : '—'; } },
        { h: 'Ripartizione', f: function (l) { return l.ripartizione === 'valore' ? 'Per valore' : 'Per quantità'; } },
        { h: '', cls: 'acts', f: function (l) { return UI.btn('Margine', 'lotto-margin', l.id) + ' ' + UI.btn('Pezzi', 'lotto-pezzi', l.id) + (edit ? ' ' + UI.btn('Modifica', 'lotto-edit', l.id) + ' ' + UI.btn('Elimina', 'lotto-del', l.id, 'danger') : ''); } }
      ], rows, { empty: '<b>Nessun lotto registrato</b>Usa “Carica un lotto” per registrare un acquisto e i suoi pezzi.' });
  };
  A['lotto-margin'] = function (el) { NM.go('margine', { lotto: el.dataset.id }); };
  A['lotto-pezzi'] = function (el) { NM.filters.lotto = el.dataset.id; NM.go('pezzi'); };
  A['lotto-edit'] = function (el) {
    if (!UI.guardEdit()) return;
    var l = C.lotto(el.dataset.id); if (!l) return;
    UI.form('Modifica lotto', lottoFields(), l, function (v) {
      D.put('lotti', Object.assign({}, l, v)); D.log('ha modificato il lotto', 'lotti', l.id, l.nome); NM.render(); UI.toast('Lotto aggiornato');
    });
  };
  A['lotto-del'] = function (el) {
    if (!UI.guardEdit()) return;
    var l = C.lotto(el.dataset.id); if (!l) return;
    var k = D.state.pezzi.filter(function (p) { return p.lottoId === l.id; });
    if (!confirm('Eliminare il lotto "' + l.nome + '"?' + (k.length ? ' I ' + k.length + ' tipi di pezzo collegati restano in magazzino senza lotto.' : ''))) return;
    k.forEach(function (p) { D.put('pezzi', Object.assign({}, p, { lottoId: '' })); });
    D.remove('lotti', l.id); D.log('ha eliminato il lotto', 'lotti', l.id, l.nome); NM.render();
    UI.toast('Lotto eliminato.', { label: 'Annulla', onAction: function () {
      D.put('lotti', l); k.forEach(function (p) { D.put('pezzi', p); }); D.log('ha ripristinato il lotto', 'lotti', l.id, l.nome); NM.render();
    } });
  };

  /* ---------- Vendite ---------- */
  function venditaFields(existing) {
    var clienti = D.state.anagrafiche.filter(function (a) { return a.tipo === 'cliente'; });
    var pezzi = D.state.pezzi.filter(function (p) { return C.giacenza(p) > 0 || (existing && existing.pezzoId === p.id); });
    return [
      { key: 'pezzoId', label: 'Pezzo', type: 'select', required: true, full: true, options: pezzi.map(function (p) { return [p.id, p.codice + ' — ' + p.nome + ' (restano ' + U.num(C.giacenza(p)) + ')']; }) },
      { key: 'modo', label: 'Come si vende', type: 'select', options: [['pezzo', 'Per pezzo'], ['peso', 'A peso']] },
      { key: 'quantita', label: 'Unità vendute', type: 'number', required: true, step: 1, min: 1, def: 1 },
      { key: 'ricavo', label: 'Incasso totale (€)', type: 'number', step: '0.01', attrs: 'data-modo="pezzo"' },
      { key: 'pesoKg', label: 'Peso venduto (kg)', type: 'number', step: '0.001', attrs: 'data-modo="peso"' },
      { key: 'prezzoKg', label: 'Prezzo al kg (€)', type: 'number', step: '0.01', attrs: 'data-modo="peso"' },
      { key: 'data', label: 'Data', type: 'date', def: U.today() },
      { key: 'clienteId', label: 'Cliente', type: 'select', options: [['', '— nessuno —']].concat(clienti.map(function (c) { return [c.id, c.nome]; })) },
      { key: 'spedStato', label: 'Spedizione', type: 'select', options: C.SPEDIZIONI, def: 'Da spedire' },
      { key: 'spedCorriere', label: 'Corriere' },
      { key: 'spedTracking', label: 'Numero di tracking' },
      { key: 'spedPaese', label: 'Paese di destinazione' },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  function syncModo(form) {
    var sel = form.elements.modo; if (!sel) return;
    var sync = function () { U.$$('[data-modo]', form).forEach(function (r) { r.hidden = r.dataset.modo !== sel.value; }); };
    sel.addEventListener('change', sync); sync();
  }
  function saveVendita(v, existing) {
    var p = C.pezzo(v.pezzoId);
    if (!p) { UI.toast('Scegli un pezzo.'); return false; }
    var disp = C.giacenza(p) + (existing && existing.pezzoId === p.id ? U.n(existing.quantita) : 0);
    if (U.n(v.quantita) <= 0 || U.n(v.quantita) > disp) { UI.toast('Quantità non valida: ne restano ' + U.num(disp) + '.'); return false; }
    if (v.modo === 'peso') {
      if (!(U.n(v.pesoKg) > 0) || !(U.n(v.prezzoKg) > 0)) { UI.toast('Per la vendita a peso servono i chili e il prezzo al kg.'); return false; }
      v.ricavo = Math.round(U.n(v.pesoKg) * U.n(v.prezzoKg) * 100) / 100;
    } else if (!U.has(v.ricavo)) { UI.toast('Scrivi l’incasso totale.'); return false; }
    var rec = existing ? Object.assign({}, existing, v) : Object.assign({ id: U.uid() }, v);
    D.put('vendite', rec);
    D.log(existing ? 'ha modificato una vendita di' : 'ha venduto ' + U.num(v.quantita) + ' di', 'vendite', p.id, p.nome + ' per ' + U.money(v.ricavo));
    NM.render(); if (UI.drawerOpen() && UI.drawerState) V.openPezzo(UI.drawerState.id, UI.drawerState.tab);
    UI.toast('Vendita registrata: ' + U.money(v.ricavo));
  }
  V.venditaNew = function (pezzoId) {
    if (!UI.guardEdit()) return;
    var avail = D.state.pezzi.filter(function (p) { return C.giacenza(p) > 0; });
    if (!avail.length) { UI.toast('Non c’è niente in magazzino da vendere.'); return; }
    var form = UI.form('Nuova vendita', venditaFields(null), { pezzoId: pezzoId || avail[0].id, modo: 'pezzo', spedStato: 'Da spedire' }, function (v) { return saveVendita(v, null); }, { submit: 'Registra la vendita' });
    syncModo(form);
  };
  A['pezzo-sell'] = function (el) { UI.closeDrawer(); V.venditaNew(el.dataset.id); };
  A['vendita-new'] = function () { V.venditaNew(); };
  A['vendita-edit'] = function (el) {
    if (!UI.guardEdit()) return;
    var v = D.get('vendite', el.dataset.id); if (!v) return;
    var form = UI.form('Modifica vendita', venditaFields(v), Object.assign({ modo: 'pezzo' }, v), function (x) { return saveVendita(x, v); });
    syncModo(form);
  };
  A['vendita-del'] = function (el) {
    if (!UI.guardEdit()) return;
    var v = D.get('vendite', el.dataset.id); if (!v) return;
    if (!confirm('Eliminare questa vendita? Le unità tornano in magazzino.')) return;
    D.remove('vendite', v.id); D.log('ha eliminato una vendita', 'vendite', v.pezzoId, U.money(v.ricavo)); NM.render();
    UI.toast('Vendita eliminata.', { label: 'Annulla', onAction: function () { D.put('vendite', v); NM.render(); } });
  };
  A['sped-next'] = function (el) {
    if (!UI.guardEdit()) return;
    var v = D.get('vendite', el.dataset.id); if (!v) return;
    var next = C.SPEDIZIONI[C.SPEDIZIONI.indexOf(v.spedStato) + 1]; if (!next || next === 'Ritiro in sede') return;
    D.put('vendite', Object.assign({}, v, { spedStato: next })); D.log('ha segnato come "' + next + '" una spedizione', 'vendite', v.pezzoId, ''); NM.render();
  };
  A['ship-filter'] = function (el) { NM.shipFilter = NM.shipFilter === el.dataset.id ? '' : el.dataset.id; NM.render(); };
  A['lotto-sell'] = function () {
    if (!UI.guardEdit()) return;
    var withStock = D.state.lotti.filter(function (l) { return C.lottoStats(l).giac > 0; });
    if (!withStock.length) { UI.toast('Nessun lotto ha ancora unità in magazzino.'); return; }
    var clienti = D.state.anagrafiche.filter(function (a) { return a.tipo === 'cliente'; });
    var fields = [
      { key: 'lottoId', label: 'Lotto da vendere per intero', type: 'select', required: true, full: true, options: withStock.map(function (l) { return [l.id, l.nome + ' (restano ' + U.num(C.lottoStats(l).giac) + ' unità)']; }) },
      { key: 'ricavo', label: 'Incasso totale (€)', type: 'number', required: true, step: '0.01' },
      { key: 'data', label: 'Data', type: 'date', def: U.today() },
      { key: 'clienteId', label: 'Cliente', type: 'select', options: [['', '— nessuno —']].concat(clienti.map(function (c) { return [c.id, c.nome]; })) },
      { key: 'spedStato', label: 'Spedizione', type: 'select', options: C.SPEDIZIONI, def: 'Da spedire' },
      { key: 'spedCorriere', label: 'Corriere' }, { key: 'spedTracking', label: 'Numero di tracking' }, { key: 'spedPaese', label: 'Paese di destinazione' }
    ];
    UI.form('Vendi un lotto intero', fields, { spedStato: 'Da spedire' }, function (v) {
      var l = C.lotto(v.lottoId), ps = (C.ctx().lotPezzi[v.lottoId] || []).filter(function (p) { return C.giacenza(p) > 0; });
      var tot = ps.reduce(function (s, p) { return s + C.giacenza(p); }, 0);
      if (!l || !tot) { UI.toast('Questo lotto non ha unità da vendere.'); return false; }
      var gruppo = U.uid(), left = U.n(v.ricavo);
      ps.forEach(function (p, i) {
        var q = C.giacenza(p), share = i === ps.length - 1 ? left : Math.round(U.n(v.ricavo) * q / tot * 100) / 100;
        left = Math.round((left - share) * 100) / 100;
        D.put('vendite', { id: U.uid(), pezzoId: p.id, modo: 'lotto', gruppo: gruppo, quantita: q, ricavo: share, data: v.data, clienteId: v.clienteId, spedStato: v.spedStato, spedCorriere: v.spedCorriere, spedTracking: v.spedTracking, spedPaese: v.spedPaese, note: 'Lotto venduto per intero: ' + l.nome });
      });
      D.log('ha venduto per intero il lotto', 'lotti', l.id, l.nome + ' per ' + U.money(v.ricavo));
      NM.render(); UI.toast('Lotto venduto: ' + U.money(v.ricavo) + ' ripartiti su ' + ps.length + ' tipi di pezzo.');
    }, { sub: 'L’incasso viene diviso sui pezzi rimasti in proporzione alle unità.', submit: 'Registra la vendita' });
  };
  V.vendite = function (root) {
    var edit = UI.canEdit();
    var cnt = {}; D.state.vendite.forEach(function (v) { cnt[v.spedStato || ''] = (cnt[v.spedStato || ''] || 0) + 1; });
    var rows = D.state.vendite.filter(function (v) { return !NM.shipFilter || v.spedStato === NM.shipFilter; })
      .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
    root.innerHTML = '<div class="page-head"><div><h1>Vendite</h1><p class="sub">Quanto hai incassato e dove sta andando ogni spedizione.</p></div><div class="toolbar">' +
      (edit ? '<button type="button" class="btn primary" data-act="vendita-new">' + UI.icon('plus') + 'Nuova vendita</button><button type="button" class="btn" data-act="lotto-sell">Vendi un lotto intero</button>' : '') + '</div></div>' +
      '<div class="filters" style="margin-bottom:12px">' + C.SPEDIZIONI.map(function (s) {
        return '<button type="button" class="filter" data-act="ship-filter" data-id="' + esc(s) + '" style="--c:var(--st-' + UI.tone('sped', s) + ')" aria-pressed="' + (NM.shipFilter === s) + '">' + esc(s) + ' <span class="n">' + (cnt[s] || 0) + '</span></button>';
      }).join('') + '</div>' +
      UI.table([
        { h: 'Data', f: function (v) { return U.fdate(v.data); } },
        { h: 'Pezzo', cls: 'name', f: function (v) { var p = C.pezzo(v.pezzoId); return p ? '<b>' + esc(p.nome) + '</b><small>' + esc(p.codice) + (v.modo === 'peso' ? ' — a peso, ' + U.num(v.pesoKg) + ' kg' : '') + (v.modo === 'lotto' ? ' — lotto intero' : '') + '</small>' : '—'; } },
        { h: 'Unità', cls: 'num', f: function (v) { return U.num(v.quantita); } },
        { h: 'Incasso', cls: 'num', f: function (v) { return U.money(v.ricavo); } },
        { h: 'Cliente', f: function (v) { var c = C.anag(v.clienteId); return c ? esc(c.nome) : '<span class="muted">—</span>'; } },
        { h: 'Spedizione', f: function (v) { return UI.chip('sped', v.spedStato) + (v.spedTracking ? '<small class="sub" style="display:block">' + esc((v.spedCorriere || '') + ' ' + v.spedTracking) + '</small>' : ''); } },
        { h: '', cls: 'acts', f: function (v) { var nx = C.SPEDIZIONI[C.SPEDIZIONI.indexOf(v.spedStato) + 1]; return edit ? ((nx && nx !== 'Ritiro in sede' ? UI.btn('Segna ' + nx.toLowerCase(), 'sped-next', v.id) + ' ' : '') + UI.btn('Modifica', 'vendita-edit', v.id) + ' ' + UI.btn('Elimina', 'vendita-del', v.id, 'danger')) : ''; } }
      ], rows, { empty: '<b>Nessuna vendita</b>Registra la prima vendita dal pulsante in alto.' });
  };

  /* ---------- Margine ---------- */
  V.margine = function (root, params) {
    var stats = D.state.lotti.map(function (l) { return { l: l, s: C.lottoStats(l) }; });
    var tot = stats.reduce(function (a, x) { a.costo += x.s.costo; a.ricavi += x.s.ricavi; a.margine += x.s.margine; a.prev += x.s.previsto; return a; }, { costo: 0, ricavi: 0, margine: 0, prev: 0 });
    var sel = params && params.get('lotto') && C.lotto(params.get('lotto'));
    var html = '<div class="page-head"><div><h1>Margine</h1><p class="sub">Per ogni lotto: quanto è costato, quanto hai incassato e quanto resta da vendere.</p></div></div>' +
      '<dl class="strip"><div><dt>Costo dei lotti</dt><dd>' + U.money(tot.costo) + '</dd></div><div><dt>Incassato</dt><dd>' + U.money(tot.ricavi) + '</dd></div>' +
      '<div><dt>Margine realizzato</dt><dd class="' + U.sign(tot.margine) + '">' + U.money(tot.margine) + '</dd></div>' +
      '<div><dt>Se vendi tutto al prezzo finale</dt><dd class="' + U.sign(tot.prev) + '">' + U.money(tot.prev) + '</dd></div></dl>' +
      '<section class="section"><h2>Lotti</h2>' + UI.table([
        { h: 'Lotto', cls: 'name', f: function (x) { return '<b>' + esc(x.l.nome) + '</b><small>' + U.fdate(x.l.data) + '</small>'; } },
        { h: 'Costo', cls: 'num', f: function (x) { return U.money(x.s.costo); } },
        { h: 'Incassato', cls: 'num', f: function (x) { return U.money(x.s.ricavi); } },
        { h: 'Recuperato', cls: 'num', f: function (x) { return U.pct(x.s.recupero); } },
        { h: 'Margine', cls: 'num', f: function (x) { return '<b class="' + U.sign(x.s.margine) + '">' + U.money(x.s.margine) + '</b>'; } },
        { h: 'Margine %', cls: 'num', f: function (x) { return U.pct(x.s.marginePct); } },
        { h: 'In magazzino', cls: 'num', f: function (x) { return U.num(x.s.giac) + ' / ' + U.num(x.s.qtot); } },
        { h: 'Previsto', cls: 'num', f: function (x) { return '<span class="' + U.sign(x.s.previsto) + '">' + U.money(x.s.previsto) + '</span>'; } },
        { h: '', cls: 'acts', f: function (x) { return UI.btn('Dettaglio', 'lotto-margin', x.l.id); } }
      ], stats, { empty: '<b>Nessun lotto</b>Registra un lotto con i suoi pezzi per vedere il margine.', rowAttr: function (x) { return ' data-act="lotto-margin" data-id="' + esc(x.l.id) + '"'; }, click: true }) + '</section>';
    if (sel) {
      var s = C.lottoStats(sel);
      html += '<section class="section"><div class="page-head" style="margin-bottom:12px"><div><h2>' + esc(sel.nome) + '</h2><p class="sub">Costo ' + U.money(s.costo) + ' ripartito su ' + U.num(s.qtot) + ' unità ' + (sel.ripartizione === 'valore' ? 'in base al valore stimato' : 'in parti uguali') + '.</p></div>' +
        (UI.canEdit() ? '<label class="toolbar">Ripartizione <select data-act="ripart" data-id="' + esc(sel.id) + '"><option value="quantita"' + (sel.ripartizione !== 'valore' ? ' selected' : '') + '>Per quantità</option><option value="valore"' + (sel.ripartizione === 'valore' ? ' selected' : '') + '>Per valore stimato</option></select></label>' : '') + '</div>' +
        '<div class="note">Dividere per quantità tratta allo stesso modo un pezzo da pochi centesimi e uno da decine di euro. Prova “Per valore stimato”: serve un prezzo finale o di riferimento su ogni pezzo del lotto.</div>' +
        UI.table([
          { h: 'Pezzo', cls: 'name', f: function (p) { return '<b>' + esc(p.nome) + '</b><small>' + esc(p.codice) + '</small>'; } },
          { h: 'Unità', cls: 'num', f: function (p) { return U.num(p.quantita); } },
          { h: 'Costo per unità', cls: 'num', f: function (p) { return U.money(C.unitCost(p)); } },
          { h: 'Venduti', cls: 'num', f: function (p) { return U.num(C.pezzoStats(p).venduti); } },
          { h: 'Incassato', cls: 'num', f: function (p) { return U.money(C.pezzoStats(p).ricavi); } },
          { h: 'Margine', cls: 'num', f: function (p) { var m = C.pezzoStats(p).margine; return '<b class="' + U.sign(m) + '">' + U.money(m) + '</b>'; } },
          { h: 'Restano', cls: 'num', f: function (p) { return U.num(C.giacenza(p)); } },
          { h: 'Prezzo finale', cls: 'num', f: function (p) { return U.money(p.prezzoFinale); } }
        ], s.ps, { empty: '<b>Nessun pezzo in questo lotto</b>Aggiungi pezzi collegandoli al lotto.', rowAttr: function (p) { return ' data-act="pezzo-open" data-id="' + esc(p.id) + '"'; }, click: true }) + '</section>';
    }
    var senza = D.state.pezzi.filter(function (p) { return !C.lotto(p.lottoId); }).length;
    if (senza) html += '<p class="sub" style="margin-top:16px">' + senza + ' tipi di pezzo non sono collegati a un lotto: il loro costo non è calcolato.</p>';
    root.innerHTML = html;
  };
  NM.change = NM.change || {};
  NM.change.ripart = function (el) {
    if (!UI.guardEdit()) return;
    var l = C.lotto(el.dataset.id); if (!l) return;
    D.put('lotti', Object.assign({}, l, { ripartizione: el.value }));
    D.log('ha cambiato la ripartizione del costo in "' + el.value + '" per', 'lotti', l.id, l.nome);
    NM.render();
  };

  /* ---------- Rubrica (clienti e fornitori) ---------- */
  var rubTipo = '';
  function anagFields() {
    return [
      { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: [['cliente', 'Cliente'], ['fornitore', 'Fornitore']] },
      { key: 'nome', label: 'Nome o ragione sociale', required: true },
      { key: 'email', label: 'Email', type: 'email' }, { key: 'telefono', label: 'Telefono' },
      { key: 'indirizzo', label: 'Indirizzo', full: true }, { key: 'paese', label: 'Paese' },
      { key: 'note', label: 'Note', type: 'textarea', full: true }
    ];
  }
  V.rubrica = function (root) {
    var edit = UI.canEdit();
    var rows = D.state.anagrafiche.filter(function (a) { return !rubTipo || a.tipo === rubTipo; }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'it'); });
    root.innerHTML = '<div class="page-head"><div><h1>Rubrica</h1><p class="sub">Clienti e fornitori. I campi sono quelli usuali, se ne servono altri si aggiungono.</p></div><div class="toolbar">' +
      (edit ? '<button type="button" class="btn primary" data-act="anag-new">' + UI.icon('plus') + 'Nuova scheda</button>' : '') + '</div></div>' +
      '<div class="filters" style="margin-bottom:12px">' + [['', 'Tutti'], ['cliente', 'Clienti'], ['fornitore', 'Fornitori']].map(function (t) {
        return '<button type="button" class="filter" data-act="rub-tipo" data-id="' + t[0] + '" aria-pressed="' + (rubTipo === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      UI.table([
        { h: 'Nome', cls: 'name', f: function (a) { return '<b>' + esc(a.nome) + '</b><small>' + esc(a.paese || '') + '</small>'; } },
        { h: 'Tipo', f: function (a) { return a.tipo === 'fornitore' ? 'Fornitore' : 'Cliente'; } },
        { h: 'Contatti', f: function (a) { return esc([a.email, a.telefono].filter(Boolean).join(' · ') || '—') + (a.indirizzo ? '<small class="sub" style="display:block">' + esc(a.indirizzo) + '</small>' : ''); } },
        {
          h: 'Giro', cls: 'num', f: function (a) {
            if (a.tipo === 'fornitore') { var ls = D.state.lotti.filter(function (l) { return l.fornitoreId === a.id; }); return ls.length ? ls.length + ' lotti, ' + U.money(ls.reduce(function (s, l) { return s + U.n(l.costo); }, 0)) : '—'; }
            var vs = D.state.vendite.filter(function (v) { return v.clienteId === a.id; }); return vs.length ? vs.length + ' vendite, ' + U.money(vs.reduce(function (s, v) { return s + U.n(v.ricavo); }, 0)) : '—';
          }
        },
        { h: 'Note', f: function (a) { return esc(a.note || ''); } },
        { h: '', cls: 'acts', f: function (a) { return edit ? UI.btn('Modifica', 'anag-edit', a.id) + ' ' + UI.btn('Elimina', 'anag-del', a.id, 'danger') : ''; } }
      ], rows, { empty: '<b>Nessuna scheda</b>Aggiungi i clienti e i fornitori con cui lavori.' });
  };
  A['rub-tipo'] = function (el) { rubTipo = el.dataset.id; NM.render(); };
  A['anag-new'] = function () {
    if (!UI.guardEdit()) return;
    UI.form('Nuova scheda', anagFields(), { tipo: rubTipo || 'cliente' }, function (v) {
      var a = Object.assign({ id: U.uid() }, v); D.put('anagrafiche', a); D.log('ha aggiunto in rubrica', 'anagrafiche', a.id, a.nome); NM.render(); UI.toast('Scheda aggiunta');
    });
  };
  A['anag-edit'] = function (el) {
    if (!UI.guardEdit()) return;
    var a = C.anag(el.dataset.id); if (!a) return;
    UI.form('Modifica scheda', anagFields(), a, function (v) { D.put('anagrafiche', Object.assign({}, a, v)); D.log('ha modificato in rubrica', 'anagrafiche', a.id, a.nome); NM.render(); UI.toast('Scheda aggiornata'); });
  };
  A['anag-del'] = function (el) {
    if (!UI.guardEdit()) return;
    var a = C.anag(el.dataset.id); if (!a) return;
    if (!confirm('Eliminare "' + a.nome + '"?')) return;
    D.remove('anagrafiche', a.id);
    D.state.lotti.forEach(function (l) { if (l.fornitoreId === a.id) D.put('lotti', Object.assign({}, l, { fornitoreId: '' })); });
    D.state.vendite.forEach(function (v) { if (v.clienteId === a.id) D.put('vendite', Object.assign({}, v, { clienteId: '' })); });
    D.log('ha eliminato dalla rubrica', 'anagrafiche', a.id, a.nome); NM.render(); UI.toast('Scheda eliminata');
  };

  /* ---------- Etichette ---------- */
  var SIZES = { '62x29': [62, 29], '64x34': [64, 34], '100x50': [100, 50] };
  var LAB = (NM.labels = { sel: {}, size: '64x34', mode: 'a4', copies: 1, q: '' });
  NM.drawBarcodes = function (scope) {
    U.$$('svg.barcode', scope).forEach(function (svg) {
      try {
        if (!window.JsBarcode) throw new Error('libreria non caricata');
        window.JsBarcode(svg, svg.dataset.code, { format: 'CODE128', height: 40, width: 1.7, margin: 0, fontSize: 12, displayValue: true });
      } catch (e) { var d = document.createElement('div'); d.textContent = svg.dataset.code; svg.replaceWith(d); }
    });
  };
  function drawSheet() {
    var sz = SIZES[LAB.size] || SIZES['64x34'], sheet = $('#labelSheet'); if (!sheet) return;
    var ps = D.state.pezzi.filter(function (p) { return LAB.sel[p.id]; }), html = '';
    ps.forEach(function (p) {
      for (var i = 0; i < Math.max(1, LAB.copies); i++) {
        html += '<div class="sticker" style="--lw:' + sz[0] + 'mm;--lh:' + sz[1] + 'mm"><div class="l-name">' + esc(p.nome) + '</div><div class="l-pos">' + esc(p.posizione || '—') + '</div><svg class="barcode" data-code="' + esc(p.codice) + '"></svg></div>';
      }
    });
    sheet.innerHTML = html;
    NM.drawBarcodes(sheet);
    var st = $('#pageSize') || (function () { var s = document.createElement('style'); s.id = 'pageSize'; document.head.appendChild(s); return s; })();
    st.textContent = LAB.mode === 'rotolo' ? '@page{size:' + sz[0] + 'mm ' + sz[1] + 'mm;margin:0}' : '@page{size:A4;margin:8mm}';
    var n = ps.length * Math.max(1, LAB.copies);
    var c = $('#labCount'); if (c) c.textContent = n ? n + (n === 1 ? ' etichetta pronta' : ' etichette pronte') : 'Nessuna etichetta selezionata';
  }
  function drawPick() {
    var nq = U.norm(LAB.q).trim(), list = D.state.pezzi.filter(function (p) { return !nq || C.haystack(p).indexOf(nq) !== -1; }).slice(0, 200);
    var box = $('#labPick'); if (!box) return;
    box.innerHTML = list.length ? list.map(function (p) {
      return '<label><input type="checkbox" data-act="lab-toggle" data-id="' + esc(p.id) + '"' + (LAB.sel[p.id] ? ' checked' : '') + '><span>' + esc(p.codice) + ' — ' + esc(p.nome) + '<br><small class="sub">' + esc(p.posizione || 'senza posizione') + '</small></span></label>';
    }).join('') : '<p class="muted">Nessun pezzo trovato.</p>';
  }
  V.etichette = function (root, params) {
    var ids = params && params.get('ids');
    if (ids) { LAB.sel = {}; ids.split(',').forEach(function (i) { if (i) LAB.sel[i] = true; }); }
    root.innerHTML = '<div class="noprint"><div class="page-head"><div><h1>Etichette</h1><p class="sub" id="labCount"></p></div><div class="toolbar"><button type="button" class="btn primary" data-act="lab-print">' + UI.icon('print') + 'Stampa</button></div></div>' +
      '<div class="panel"><div class="toolbar" style="margin-bottom:12px"><input id="labQ" type="search" placeholder="Cerca un pezzo" value="' + esc(LAB.q) + '" aria-label="Cerca">' +
      '<select id="labSize" aria-label="Formato">' + Object.keys(SIZES).map(function (k) { return '<option value="' + k + '"' + (LAB.size === k ? ' selected' : '') + '>' + k.replace('x', ' × ') + ' mm</option>'; }).join('') + '</select>' +
      '<select id="labMode" aria-label="Stampa su"><option value="a4"' + (LAB.mode === 'a4' ? ' selected' : '') + '>Foglio A4</option><option value="rotolo"' + (LAB.mode === 'rotolo' ? ' selected' : '') + '>Stampante di etichette</option></select>' +
      '<label class="toolbar">Copie <input id="labCopies" type="number" min="1" max="50" value="' + LAB.copies + '" style="width:72px"></label>' +
      '<button type="button" class="btn sm" data-act="lab-all">Seleziona i trovati</button><button type="button" class="btn sm" data-act="lab-none">Nessuno</button></div>' +
      '<div class="pick" id="labPick"></div></div></div><div id="labelSheet"></div>';
    $('#labQ').addEventListener('input', U.debounce(function (e) { LAB.q = e.target.value; drawPick(); }, 100));
    $('#labSize').addEventListener('change', function (e) { LAB.size = e.target.value; drawSheet(); });
    $('#labMode').addEventListener('change', function (e) { LAB.mode = e.target.value; drawSheet(); });
    $('#labCopies').addEventListener('input', function (e) { LAB.copies = Math.min(50, Math.max(1, Number(e.target.value) || 1)); drawSheet(); });
    drawPick(); drawSheet();
  };
  A['lab-toggle'] = function (el) { if (el.checked) LAB.sel[el.dataset.id] = true; else delete LAB.sel[el.dataset.id]; drawSheet(); };
  A['lab-all'] = function () {
    var nq = U.norm(LAB.q).trim();
    D.state.pezzi.filter(function (p) { return !nq || C.haystack(p).indexOf(nq) !== -1; }).slice(0, 200).forEach(function (p) { LAB.sel[p.id] = true; });
    drawPick(); drawSheet();
  };
  A['lab-none'] = function () { LAB.sel = {}; drawPick(); drawSheet(); };
  A['lab-print'] = function () {
    if (!Object.keys(LAB.sel).length) { UI.toast('Seleziona almeno un pezzo.'); return; }
    window.print();
  };

  /* ---------- Scansione con la fotocamera ---------- */
  var scanState = { stream: null, timer: null, reader: null, last: '' };
  function scanStatus(msg) { var s = $('#scanStatus'); if (s) s.textContent = msg; }
  function findByCode(code) {
    var c = String(code || '').trim().toUpperCase(); if (!c) return null;
    var found = D.state.pezzi.filter(function (p) { return String(p.codice).toUpperCase() === c || String(p.codiceProdotto || '').toUpperCase() === c; });
    return found[0] || null;
  }
  function showHit(code) {
    var box = $('#scanHit'); if (!box) return;
    var p = findByCode(code);
    if (!p) { box.innerHTML = '<div class="note warn">Nessun pezzo con il codice <b>' + esc(code) + '</b>. Controlla l’etichetta o cercalo per nome.</div>'; return; }
    var g = C.giacenza(p);
    box.innerHTML = '<div class="where"><div><small>' + esc(p.codice) + '</small><b>' + esc(p.nome) + '</b><small>' + esc(p.posizione ? 'Posizione: ' + p.posizione : 'Posizione da assegnare') + '</small></div>' +
      '<div class="stock"><div class="qty">' + U.num(g) + '<br><small class="qsub">' + (g > 0 ? 'in magazzino' : 'esaurito') + '</small></div></div></div>' +
      '<div class="actions-row"><button type="button" class="btn primary" data-act="pezzo-open" data-id="' + esc(p.id) + '">Apri la scheda</button>' +
      (UI.canEdit() && g > 0 ? '<button type="button" class="btn" data-act="pezzo-sell" data-id="' + esc(p.id) + '">Vendi</button>' : '') + '</div>';
    if (navigator.vibrate) navigator.vibrate(60);
  }
  V.scanStop = function () {
    if (scanState.timer) { clearInterval(scanState.timer); scanState.timer = null; }
    if (scanState.reader && scanState.reader.reset) { try { scanState.reader.reset(); } catch (e) { /* già fermo */ } }
    scanState.reader = null;
    if (scanState.stream) { scanState.stream.getTracks().forEach(function (t) { t.stop(); }); scanState.stream = null; }
  };
  function loadZxing() {
    return new Promise(function (res, rej) {
      if (window.ZXing) return res();
      var s = document.createElement('script'); s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
      s.onload = res; s.onerror = function () { rej(new Error('Lettore di riserva non raggiungibile')); }; document.head.appendChild(s);
    });
  }
  function onCode(code) { if (!code || code === scanState.last) return; scanState.last = code; showHit(code); setTimeout(function () { if (scanState.last === code) scanState.last = ''; }, 3000); }
  A['scan-start'] = function () {
    var video = $('#scanVideo');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { scanStatus('La fotocamera non è disponibile qui: serve una connessione sicura (https). Puoi scrivere il codice a mano.'); return; }
    scanStatus('Chiedo l’accesso alla fotocamera…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (stream) {
      scanState.stream = stream; video.srcObject = stream; return video.play();
    }).then(function () {
      scanStatus('Inquadra il codice a barre dell’etichetta.');
      if ('BarcodeDetector' in window) {
        var det = new window.BarcodeDetector({ formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8'] });
        scanState.timer = setInterval(function () {
          det.detect(video).then(function (r) { if (r && r[0]) onCode(r[0].rawValue); }).catch(function () { /* fotogramma non leggibile */ });
        }, 350);
      } else {
        return loadZxing().then(function () {
          scanState.reader = new window.ZXing.BrowserMultiFormatReader();
          scanState.reader.decodeFromVideoElement(video, function (result) { if (result) onCode(result.getText()); });
        });
      }
    }).catch(function (e) {
      scanStatus('Non riesco ad avviare la scansione (' + (e && e.name ? e.name : 'errore') + '). Puoi scrivere il codice a mano.');
      V.scanStop();
    });
  };
  A['scan-open'] = function () { NM.go('scan'); };
  V.scan = function (root) {
    root.innerHTML = '<div class="page-head"><div><h1>Scansiona</h1><p class="sub">Inquadra l’etichetta di un pezzo per vedere subito dov’è e quanti ne restano.</p></div></div>' +
      '<div class="scan-box"><video id="scanVideo" playsinline muted></video></div>' +
      '<div class="toolbar" style="margin-top:12px"><button type="button" class="btn primary" data-act="scan-start">' + UI.icon('scan') + 'Avvia la fotocamera</button><span class="sub" id="scanStatus"></span></div>' +
      '<form id="scanManual" class="toolbar" style="margin-top:16px"><input id="scanCode" placeholder="Oppure scrivi il codice, per esempio NM-00012" autocomplete="off" aria-label="Codice del pezzo" style="min-width:min(320px,100%)"><button type="submit" class="btn">Cerca</button></form>' +
      '<div class="scan-hit" id="scanHit"></div>';
    $('#scanManual').addEventListener('submit', function (e) { e.preventDefault(); showHit($('#scanCode').value); });
  };
})();

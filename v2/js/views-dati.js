/* Dati e backup, importazioni, dati di esempio, area Admin. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util, UI = NM.ui, C = NM.calc, D = NM.data, esc = U.esc, $ = U.$;
  var V = (NM.views = NM.views || {});
  var A = (NM.act = NM.act || {});
  NM.change = NM.change || {};

  /* ---------- Esportazione ---------- */
  function rowsInventario() {
    return D.state.pezzi.map(function (p) {
      var l = C.lotto(p.lottoId), m = C.pezzoStats(p);
      return {
        'Codice interno': p.codice, 'Nome': p.nome, 'Tipo': p.tipo, 'Marca': p.marca, 'Modello': p.modello, 'Codice produttore': p.codiceProdotto,
        'Capacità': p.capacita, 'Stato': p.stato, 'Test': p.test, 'Peso totale (g)': p.peso, 'Posizione': p.posizione,
        'Lotto': l ? l.nome : '', 'Quantità iniziale': U.n(p.quantita), 'Giacenza': m.giac,
        'Costo unitario attribuito (€)': l ? Math.round(m.uc * 100) / 100 : '', 'Valore giacenza al costo (€)': l ? Math.round(m.costoGiac * 100) / 100 : '',
        'Prezzo finale (€)': p.prezzoFinale, 'Fase dati': p.datiSensibili ? p.fase : '', 'Certificato': p.certificato || ''
      };
    });
  }
  function rowsLotti() {
    return D.state.lotti.map(function (l) {
      var s = C.lottoStats(l), f = C.anag(l.fornitoreId);
      return { 'Lotto': l.nome, 'Fonte': l.fonte, 'Fornitore': f ? f.nome : '', 'Data': l.data, 'Costo (€)': U.n(l.costo), 'Unità': s.qtot, 'Incassato (€)': Math.round(s.ricavi * 100) / 100, 'Margine realizzato (€)': Math.round(s.margine * 100) / 100, 'Previsto se vendi tutto (€)': Math.round(s.previsto * 100) / 100 };
    });
  }
  function rowsVendite() {
    return D.state.vendite.map(function (v) {
      var p = C.pezzo(v.pezzoId), c = C.anag(v.clienteId);
      return { 'Data': v.data, 'Codice': p ? p.codice : '', 'Pezzo': p ? p.nome : '', 'Unità': U.n(v.quantita), 'Incasso (€)': U.n(v.ricavo), 'Modo': v.modo || 'pezzo', 'Cliente': c ? c.nome : '', 'Spedizione': v.spedStato || '', 'Corriere': v.spedCorriere || '', 'Tracking': v.spedTracking || '', 'Paese': v.spedPaese || '' };
    });
  }
  A['export-xlsx'] = function () {
    if (!D.state.pezzi.length) { UI.toast('Non c’è ancora niente da esportare.'); return; }
    var stamp = U.today();
    if (window.XLSX) {
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsInventario()), 'Inventario');
      if (D.state.lotti.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsLotti()), 'Lotti');
      if (D.state.vendite.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsVendite()), 'Vendite');
      XLSX.writeFile(wb, 'inventario-nexmet-' + stamp + '.xlsx');
    } else {
      U.download('inventario-nexmet-' + stamp + '.csv', new Blob(['﻿' + U.csvStringify(rowsInventario())], { type: 'text/csv;charset=utf-8' }));
      UI.toast('La libreria Excel non è disponibile: ho scaricato un CSV che Excel apre senza problemi.');
    }
    D.log('ha esportato l’inventario', 'dati', '', 'in Excel');
  };
  A['backup-json'] = function () {
    U.download('backup-nexmet-' + U.today() + '.json', new Blob([JSON.stringify(D.snapshot(), null, 2)], { type: 'application/json' }));
    D.meta('ultimoBackup', new Date().toISOString());
    UI.toast('Backup scaricato. Conservalo in un posto sicuro.');
    if (NM.route().path === '' || NM.route().path === 'dati') NM.render();
  };
  A['csv-template'] = function () {
    var head = 'nome;tipo;marca;modello;codice;capacita;quantita;stato;peso;posizione;lotto;prezzo;note';
    var ex = 'RAM DDR3 8GB;RAM;Esempio;DDR3-1600;ABC123;8 GB;20;Funzionante;400;Scaffale A - Scatola 1;Lotto server (esempio);8,50;';
    U.download('modello-importazione.csv', new Blob(['﻿' + head + '\r\n' + ex + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  };

  /* ---------- Importazione da CSV ---------- */
  var csvPending = null;
  function num(s) {
    s = String(s == null ? '' : s).trim(); if (s === '') return '';
    var x = s.indexOf(',') !== -1 ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
    return isNaN(x) ? '' : x;
  }
  function pick(list, v, fallback) {
    var nv = U.norm(v); var hit = list.filter(function (x) { return U.norm(x) === nv; })[0]; return hit || fallback;
  }
  function parseCsv(text) {
    var g = function (r) { for (var i = 1; i < arguments.length; i++) { var v = r[arguments[i]]; if (v !== undefined && v !== '') return v; } return ''; };
    return U.csvParse(text).map(function (r) {
      return {
        nome: g(r, 'nome', 'name'), tipo: pick(C.TIPI, g(r, 'tipo'), 'Altro'), marca: g(r, 'marca'), modello: g(r, 'modello'),
        codiceProdotto: g(r, 'codice', 'codice produttore', 'codiceprodotto'), capacita: g(r, 'capacita'),
        quantita: Math.max(1, num(g(r, 'quantita', 'qta', 'quantity')) || 1), stato: pick(C.STATI, g(r, 'stato'), 'Da verificare'),
        peso: num(g(r, 'peso', 'peso (g)', 'peso totale (g)')), posizione: g(r, 'posizione'), lotto: g(r, 'lotto'),
        prezzoFinale: num(g(r, 'prezzo', 'prezzo finale', 'prezzo finale (€)')), note: g(r, 'note')
      };
    });
  }
  function readText(file, cb) {
    var r = new FileReader(); r.onload = function () { cb(String(r.result)); }; r.onerror = function () { UI.toast('Non riesco a leggere il file.'); }; r.readAsText(file);
  }
  function csvPreview(file) {
    if (!UI.guardEdit()) return;
    readText(file, function (text) {
      var rows = parseCsv(text), ok = rows.filter(function (r) { return r.nome; }), skip = rows.length - ok.length;
      if (!ok.length) { UI.info('Importazione da CSV', '<div class="note warn">Non ho trovato righe con un nome. Controlla che la prima riga contenga i titoli delle colonne (nome, quantita, posizione…). Puoi scaricare il modello dalla pagina Dati.</div>'); return; }
      var newLots = {}; ok.forEach(function (r) { if (r.lotto && !D.state.lotti.some(function (l) { return U.norm(l.nome) === U.norm(r.lotto); })) newLots[r.lotto] = 1; });
      csvPending = ok;
      UI.openDialog('<h2>Importazione da CSV</h2><p>Ho trovato <b>' + ok.length + '</b> pezzi da importare' + (skip ? ' (' + skip + ' righe senza nome verranno saltate)' : '') + '.' +
        (Object.keys(newLots).length ? ' Verranno creati <b>' + Object.keys(newLots).length + '</b> lotti nuovi, con costo da completare.' : '') + '</p>' +
        UI.table([{ h: 'Nome', f: function (r) { return esc(r.nome); } }, { h: 'Qtà', cls: 'num', f: function (r) { return U.num(r.quantita); } }, { h: 'Stato', f: function (r) { return esc(r.stato); } }, { h: 'Posizione', f: function (r) { return esc(r.posizione || '—'); } }, { h: 'Lotto', f: function (r) { return esc(r.lotto || '—'); } }], ok.slice(0, 6), { stack: false }) +
        (ok.length > 6 ? '<p class="sub">…e altri ' + (ok.length - 6) + '.</p>' : '') +
        '<div class="dlg-actions"><button type="button" class="btn ghost" data-act="dlg-close">Annulla</button><button type="button" class="btn primary" data-act="csv-confirm">Importa ' + ok.length + ' pezzi</button></div>');
    });
  }
  A['csv-confirm'] = function () {
    if (!csvPending || !UI.guardEdit()) return;
    var made = 0, lots = {};
    D.state.lotti.forEach(function (l) { lots[U.norm(l.nome)] = l; });
    csvPending.forEach(function (r) {
      var lid = '';
      if (r.lotto) {
        var key = U.norm(r.lotto);
        if (!lots[key]) { lots[key] = { id: U.uid(), nome: r.lotto, fonte: 'Importato da CSV', data: U.today(), costo: 0, fornitoreId: '', ripartizione: 'quantita', note: 'Costo da completare' }; D.put('lotti', lots[key]); }
        lid = lots[key].id;
      }
      D.put('pezzi', { id: U.uid(), codice: D.nextCode(), creato: Date.now(), lottoId: lid, nome: r.nome, tipo: r.tipo, marca: r.marca, modello: r.modello, codiceProdotto: r.codiceProdotto, capacita: r.capacita, quantita: r.quantita, stato: r.stato, peso: r.peso, posizione: r.posizione, test: '', fotoPercorso: '', prezzoRif: '', prezzoIA: '', prezzoFinale: r.prezzoFinale, datiSensibili: false, fase: C.FASI[0], certificato: '', note: r.note });
      made++;
    });
    D.log('ha importato da CSV', 'pezzi', '', made + ' pezzi'); csvPending = null; UI.closeDialog();
    NM.views.refreshPosList(); NM.go('pezzi'); UI.toast('Importati ' + made + ' pezzi.');
  };

  /* ---------- Importazione di copie complete ---------- */
  function importBackup(file) {
    if (!UI.guardAdmin()) return;
    readText(file, function (text) {
      var d; try { d = JSON.parse(text); } catch (e) { d = null; }
      if (!d || !Array.isArray(d.pezzi) || !Array.isArray(d.lotti)) { UI.toast('Il file non è un backup valido.'); return; }
      if (!confirm('Sostituire tutti i dati attuali con quelli del backup (' + d.pezzi.length + ' pezzi, ' + d.lotti.length + ' lotti)?')) return;
      D.restore(d).then(function () { D.log('ha ripristinato un backup', 'dati', '', ''); NM.render(); UI.toast('Backup ripristinato.'); });
    });
  }
  A['import-v1'] = function () {
    if (!UI.guardAdmin()) return;
    D.importV1().then(function (r) { NM.render(); UI.toast('Importati ' + r.pezzi + ' pezzi e ' + r.lotti + ' lotti dal prototipo.'); }).catch(function (e) { UI.toast(e.message); });
  };

  /* ---------- Dati di esempio ---------- */
  function demoSnapshot() {
    var id = U.uid, n = 0, now = Date.now();
    var code = function () { n++; return 'NM-' + String(n).padStart(5, '0'); };
    var f1 = { id: id(), tipo: 'fornitore', nome: 'Fornitore di prova', paese: 'Italia', note: 'Dato di esempio' };
    var c1 = { id: id(), tipo: 'cliente', nome: 'Buyer di prova', paese: 'Germania', note: 'Dato di esempio' };
    var c2 = { id: id(), tipo: 'cliente', nome: 'Rivenditore di prova', paese: 'Polonia', note: 'Dato di esempio' };
    var l1 = { id: id(), nome: 'Lotto server dismessi (esempio)', fonte: 'Asta di prova', data: U.today(), costo: 250, fornitoreId: f1.id, ripartizione: 'valore', note: '' };
    var l2 = { id: id(), nome: 'Lotto schede miste (esempio)', fonte: 'Sito di prova', data: U.today(), costo: 120, fornitoreId: '', ripartizione: 'quantita', note: '' };
    var l3 = { id: id(), nome: 'Lotto portatili guasti (esempio)', fonte: 'Asta di prova', data: U.today(), costo: 90, fornitoreId: '', ripartizione: 'valore', note: '' };
    var base = { marca: '', modello: '', codiceProdotto: '', capacita: '', test: '', fotoPercorso: '', prezzoRif: '', prezzoIA: '', prezzoFinale: '', datiSensibili: false, fase: C.FASI[0], certificato: '', note: '', peso: '', posizione: '' };
    var mk = function (o) { return Object.assign({ id: id(), codice: code(), creato: now - (n * 60000) }, base, o); };
    var pezzi = [
      mk({ nome: 'RAM DDR3 8GB (esempio)', tipo: 'RAM', marca: 'Esempio', modello: 'DDR3-1600', capacita: '8 GB', quantita: 20, stato: 'Funzionante', posizione: 'Scaffale A - Scatola 1', lottoId: l1.id, peso: 400, prezzoRif: 9, prezzoIA: 8, prezzoFinale: 8.5 }),
      mk({ nome: 'RAM DDR2 per macero (esempio)', tipo: 'RAM', marca: 'Varie', modello: 'DDR2', capacita: '1-2 GB', quantita: 60, stato: 'Per macero (a peso)', posizione: 'Scaffale B - Scatola 2', lottoId: l1.id, peso: 1800, prezzoRif: 0.3, prezzoFinale: 0.3 }),
      mk({ nome: 'Disco 2,5" 500GB (esempio)', tipo: 'Disco', marca: 'Esempio', modello: 'SATA', capacita: '500 GB', quantita: 12, stato: 'Da verificare', posizione: 'Scaffale A - Scatola 2', lottoId: l1.id, peso: 1300, prezzoRif: 6, prezzoFinale: 6, datiSensibili: true, fase: 'Verificato' }),
      mk({ nome: 'CPU Xeon E5 (esempio)', tipo: 'CPU', marca: 'Esempio', modello: 'E5-2600', quantita: 6, stato: 'Funzionante', posizione: 'Scaffale A - Scatola 3', lottoId: l1.id, peso: 120, prezzoRif: 22, prezzoFinale: 20 }),
      mk({ nome: 'Schede madri miste (esempio)', tipo: 'Scheda madre', marca: 'Varie', quantita: 15, stato: 'Da verificare', posizione: 'Scaffale B - Scatola 1', lottoId: l2.id, peso: 6000 }),
      mk({ nome: 'Schede di rete (esempio)', tipo: 'Scheda', quantita: 9, stato: 'Funzionante', lottoId: l2.id, peso: 450, prezzoFinale: 6 }),
      mk({ nome: 'SSD 256GB (esempio)', tipo: 'Disco', marca: 'Esempio', capacita: '256 GB', quantita: 8, stato: 'Funzionante', posizione: 'Scaffale C - Scatola 1', lottoId: l3.id, peso: 160, prezzoRif: 14, prezzoFinale: 15, datiSensibili: true, fase: 'Cancellato', certificato: 'CERT-ESEMPIO-001' }),
      mk({ nome: 'Alimentatori 500W (esempio)', tipo: 'Alimentatore', quantita: 5, stato: 'Difettoso', posizione: 'Scaffale C - Scatola 2', lottoId: l3.id, peso: 3000, prezzoFinale: 3 })
    ];
    var vend = [
      { id: id(), pezzoId: pezzi[0].id, quantita: 5, ricavo: 42, modo: 'pezzo', data: U.today(), clienteId: c1.id, spedStato: 'Da spedire', spedCorriere: 'Corriere di prova', spedTracking: '', spedPaese: 'Germania', note: 'Vendita di esempio' },
      { id: id(), pezzoId: pezzi[1].id, quantita: 40, ricavo: 18, modo: 'peso', pesoKg: 1.2, prezzoKg: 15, data: U.today(), clienteId: c2.id, spedStato: 'Spedito', spedCorriere: 'Corriere di prova', spedTracking: 'TRACK-ESEMPIO-1', spedPaese: 'Polonia', note: 'Vendita a peso di esempio' },
      { id: id(), pezzoId: pezzi[6].id, quantita: 3, ricavo: 40, modo: 'pezzo', data: U.today(), clienteId: c1.id, spedStato: 'Consegnato', spedCorriere: 'Corriere di prova', spedTracking: 'TRACK-ESEMPIO-2', spedPaese: 'Germania', note: '' }
    ];
    return { lotti: [l1, l2, l3], pezzi: pezzi, anagrafiche: [f1, c1, c2], vendite: vend, log: [], seq: n };
  }
  A['demo-load'] = function () {
    if (!UI.guardAdmin()) return;
    if ((D.state.pezzi.length || D.state.lotti.length) && !confirm('I dati attuali verranno sostituiti da quelli di esempio. Continuare?')) return;
    D.restore(demoSnapshot(), { keepUsers: true }).then(function () { D.log('ha caricato', 'dati', '', 'i dati di esempio'); NM.views.refreshPosList(); NM.go(''); UI.toast('Dati di esempio caricati.'); });
  };
  A['wipe'] = function () {
    if (!UI.guardAdmin()) return;
    if (!confirm('Cancellare TUTTI i dati di questo browser? Non si può annullare: scarica prima un backup.')) return;
    D.wipe().then(function () { NM.go(''); UI.toast('Dati cancellati.'); });
  };

  /* ---------- Pagina Dati ---------- */
  V.dati = function (root) {
    var admin = UI.isAdmin(), edit = UI.canEdit();
    root.innerHTML = '<div class="page-head"><div><h1>Dati e backup</h1><p class="sub">Esporta per il commercialista, copia i dati al sicuro, importa un elenco.</p></div></div>' +
      '<div class="note warn">I dati stanno <b>solo in questo browser</b>: non vengono condivisi con altri dispositivi e si perdono se pulisci i dati del sito. Scarica un backup ogni tanto. Finché il sito è pubblico non inserire dati reali.</div>' +
      '<div class="panel"><h2>Esporta</h2><p class="sub">L’inventario in Excel (con lotti e vendite) è pensato per il commercialista: le colonne che gli servono vanno ancora chiarite con lui.</p>' +
      '<div class="toolbar"><button type="button" class="btn primary" data-act="export-xlsx">Esporta inventario in Excel</button><button type="button" class="btn" data-act="backup-json">Scarica il backup completo</button></div>' +
      '<p class="sub" style="margin-top:10px">Ultimo backup: ' + (D.state.ultimoBackup ? U.ftime(new Date(D.state.ultimoBackup).getTime()) : 'mai') + '</p></div>' +
      '<div class="panel"><h2>Importa</h2>' + (edit ? '<div class="toolbar" style="margin-bottom:10px"><label class="btn">Importa pezzi da CSV<input id="csvFile" type="file" accept=".csv,text/csv" hidden></label><button type="button" class="btn ghost" data-act="csv-template">Scarica il modello CSV</button></div>' : '<p class="sub">Con il tuo ruolo puoi solo consultare.</p>') +
      (admin ? '<div class="toolbar"><label class="btn">Ripristina un backup<input id="jsonFile" type="file" accept="application/json,.json" hidden></label>' + (D.hasV1() ? '<button type="button" class="btn" data-act="import-v1">Importa i dati del prototipo (v1)</button>' : '') + '</div>' : '') + '</div>' +
      '<div class="panel"><h2>Archivio</h2><p id="storeInfo" class="sub">Controllo lo spazio…</p>' +
      (admin ? '<div class="toolbar" style="margin-top:10px"><button type="button" class="btn" data-act="demo-load">Carica dati di esempio</button><button type="button" class="btn danger" data-act="wipe">Cancella tutti i dati</button></div>' : '<p class="sub">Solo l’Admin può caricare dati di esempio o cancellare.</p>') + '</div>';
    var csv = $('#csvFile'); if (csv) csv.addEventListener('change', function (e) { if (e.target.files[0]) csvPreview(e.target.files[0]); e.target.value = ''; });
    var js = $('#jsonFile'); if (js) js.addEventListener('change', function (e) { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
    D.estimate().then(function (e) {
      var el = $('#storeInfo'); if (!el) return;
      var how = D.mode() === 'idb' ? 'archivio del browser (IndexedDB)' : 'archivio di riserva (localStorage)';
      el.textContent = 'Dati salvati nell’' + how + '. ' + (e && e.usage != null ? 'Spazio usato: ' + (e.usage / 1048576).toFixed(1) + ' MB.' : '') + ' ' + D.state.pezzi.length + ' tipi di pezzo, ' + D.state.lotti.length + ' lotti, ' + D.state.vendite.length + ' vendite.';
    });
  };

  /* ---------- Admin ---------- */
  var RUOLI = { admin: 'Admin', modifica: 'Modifica', consulta: 'Consultazione' };
  V.admin = function (root) {
    root.innerHTML = '<div class="page-head"><div><h1>Admin</h1><p class="sub">Chi può solo consultare e chi può anche modificare.</p></div><div class="toolbar"><button type="button" class="btn primary" data-act="user-new">' + UI.icon('plus') + 'Nuovo utente</button></div></div>' +
      '<div class="note warn">Questa è una simulazione: chiunque apra il sito può scegliere il proprio utente nel menu a sinistra, quindi i ruoli <b>non proteggono nulla</b>. Servono per vedere come funzioneranno. Il login vero arriverà con il passaggio a un archivio con database.</div>' +
      '<div class="panel"><p><b>Admin</b>: fa tutto e gestisce gli utenti. <b>Modifica</b>: inserisce e modifica i dati. <b>Consultazione</b>: può solo vedere.</p></div>' +
      UI.table([
        { h: 'Utente', f: function (u) { return esc(u.nome) + (u.id === D.state.utenteId ? ' <span class="chip" data-tone="grey">tu</span>' : ''); } },
        { h: 'Ruolo', f: function (u) { return '<select data-act="role" data-id="' + esc(u.id) + '" aria-label="Ruolo di ' + esc(u.nome) + '">' + Object.keys(RUOLI).map(function (k) { return '<option value="' + k + '"' + (u.ruolo === k ? ' selected' : '') + '>' + RUOLI[k] + '</option>'; }).join('') + '</select>'; } },
        { h: '', cls: 'acts', f: function (u) { return u.id === D.state.utenteId ? '' : UI.btn('Elimina', 'user-del', u.id, 'danger'); } }
      ], D.state.utenti, { stack: false });
  };
  NM.change.role = function (el) {
    var u = D.state.utenti.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!u) return;
    var admins = D.state.utenti.filter(function (x) { return x.ruolo === 'admin'; }).length;
    if (u.ruolo === 'admin' && el.value !== 'admin' && admins < 2) { UI.toast('Deve restare almeno un Admin.'); NM.render(); return; }
    u.ruolo = el.value; D.meta('utenti', D.state.utenti); D.log('ha cambiato il ruolo di ' + u.nome + ' in', 'utenti', '', RUOLI[u.ruolo]); NM.render(); UI.toast('Ruolo aggiornato');
  };
  A['user-new'] = function () {
    if (!UI.guardAdmin()) return;
    UI.form('Nuovo utente', [{ key: 'nome', label: 'Nome', required: true }, { key: 'ruolo', label: 'Ruolo', type: 'select', options: Object.keys(RUOLI).map(function (k) { return [k, RUOLI[k]]; }), def: 'consulta' }], {}, function (v) {
      D.state.utenti.push({ id: U.uid(), nome: v.nome, ruolo: v.ruolo }); D.meta('utenti', D.state.utenti); D.log('ha aggiunto l’utente', 'utenti', '', v.nome); NM.render(); UI.toast('Utente aggiunto');
    });
  };
  A['user-del'] = function (el) {
    if (!UI.guardAdmin()) return;
    var u = D.state.utenti.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!u || u.id === D.state.utenteId) return;
    if (u.ruolo === 'admin' && D.state.utenti.filter(function (x) { return x.ruolo === 'admin'; }).length < 2) { UI.toast('Deve restare almeno un Admin.'); return; }
    if (!confirm('Eliminare l’utente ' + u.nome + '?')) return;
    D.state.utenti = D.state.utenti.filter(function (x) { return x.id !== u.id; }); D.meta('utenti', D.state.utenti); D.log('ha eliminato l’utente', 'utenti', '', u.nome); NM.render();
  };
})();

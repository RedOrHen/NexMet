/* Avvio, navigazione, scorciatoie. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util, UI = NM.ui, C = NM.calc, D = NM.data, esc = U.esc, $ = U.$;
  var V = (NM.views = NM.views || {});
  var A = (NM.act = NM.act || {});
  NM.change = NM.change || {};

  var ROUTES = [
    { path: '', label: 'Banco', icon: 'home', view: 'home' },
    { path: 'pezzi', label: 'Pezzi', icon: 'box', view: 'pezzi' },
    { path: 'lotti', label: 'Lotti', icon: 'layers', view: 'lotti' },
    { path: 'vendite', label: 'Vendite', icon: 'cart', view: 'vendite' },
    { path: 'margine', label: 'Margine', icon: 'chart', view: 'margine' },
    { path: 'rubrica', label: 'Rubrica', icon: 'users', view: 'rubrica' },
    { path: 'etichette', label: 'Etichette', icon: 'tag', view: 'etichette' },
    { path: 'scan', label: 'Scansiona', icon: 'scan', view: 'scan' },
    { path: 'dati', label: 'Dati e backup', icon: 'db', view: 'dati' },
    { path: 'admin', label: 'Admin', icon: 'shield', view: 'admin', admin: true }
  ];

  /* ---------- Navigazione ---------- */
  NM.route = function () {
    var h = (location.hash || '#/').replace(/^#\/?/, '').split('?');
    return { path: h[0], params: new URLSearchParams(h[1] || '') };
  };
  NM.go = function (path, params) {
    var q = params ? Object.keys(params).filter(function (k) { return params[k] !== '' && params[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&') : '';
    var target = '#/' + path + (q ? '?' + q : '');
    if (location.hash === target) NM.render(); else location.hash = target;
  };

  /* ---------- Tema ---------- */
  function applyTheme() {
    var t = 'auto'; try { t = localStorage.getItem('nexmet.theme') || 'auto'; } catch (e) { /* non disponibile */ }
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    return t;
  }
  A['theme-cycle'] = function () {
    var order = ['auto', 'light', 'dark'], cur = applyTheme(), next = order[(order.indexOf(cur) + 1) % 3];
    try { localStorage.setItem('nexmet.theme', next); } catch (e) { /* non disponibile */ }
    applyTheme(); renderChrome(NM.route().path); UI.toast('Tema: ' + { auto: 'automatico', light: 'chiaro', dark: 'scuro' }[next]);
  };

  /* ---------- Barra laterale e barra in basso ---------- */
  function renderChrome(path) {
    var todo = C.todo().reduce(function (s, x) { return s + x.n; }, 0);
    var role = D.user().ruolo;
    $('#rail').innerHTML = '<div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>NexMet<small>Magazzino</small></span></div>' +
      ROUTES.filter(function (r) { return !r.admin || UI.isAdmin(); }).map(function (r) {
        return '<a class="nav" href="#/' + r.path + '"' + (r.path === path ? ' aria-current="page"' : '') + '>' + UI.icon(r.icon) + '<span>' + r.label + '</span>' + (r.path === '' && todo ? '<span class="count" title="Cose da sistemare">' + todo + '</span>' : '') + '</a>';
      }).join('') +
      '<div class="rail-foot"><button type="button" class="btn sm" data-act="palette-open">' + UI.icon('search') + 'Cerca ovunque (Ctrl+K)</button>' +
      '<label>Utente<select id="userSelect" aria-label="Utente">' + D.state.utenti.map(function (u) {
        return '<option value="' + esc(u.id) + '"' + (u.id === D.state.utenteId ? ' selected' : '') + '>' + esc(u.nome) + ' (' + ({ admin: 'Admin', modifica: 'Modifica', consulta: 'Consultazione' }[u.ruolo]) + ')</option>';
      }).join('') + '</select></label>' +
      '<button type="button" class="btn sm ghost" data-act="theme-cycle">Tema: ' + { auto: 'automatico', light: 'chiaro', dark: 'scuro' }[applyTheme()] + '</button>' +
      '<span>Versione di prova: usa solo dati di esempio.' + (role === 'consulta' ? ' Sei in sola consultazione.' : '') + '</span></div>';
    var tabs = [ROUTES[0], ROUTES[1], null, ROUTES[3]];
    $('#tabbar').innerHTML = tabs.map(function (r) {
      if (!r) return '<a href="#/scan" class="scan-fab" aria-label="Scansiona"><span class="fab">' + UI.icon('scan') + '</span><span>Scansiona</span></a>';
      return '<a href="#/' + r.path + '"' + (r.path === path ? ' aria-current="page"' : '') + '>' + UI.icon(r.icon) + '<span>' + r.label + '</span></a>';
    }).join('') + '<button type="button" data-act="more-open">' + UI.icon('menu') + '<span>Altro</span></button>';
  }
  A['more-open'] = function () {
    UI.openDialog('<h2>Altre sezioni</h2><div class="filters" style="margin-top:14px;display:grid;gap:6px">' +
      ROUTES.filter(function (r) { return ['lotti', 'margine', 'rubrica', 'etichette', 'dati', 'admin'].indexOf(r.path) !== -1 && (!r.admin || UI.isAdmin()); }).map(function (r) {
        return '<button type="button" class="btn" data-act="goto" data-id="' + r.path + '" style="justify-content:flex-start">' + UI.icon(r.icon) + r.label + '</button>';
      }).join('') + '<button type="button" class="btn" data-act="palette-open" style="justify-content:flex-start">' + UI.icon('search') + 'Cerca ovunque</button>' +
      '<button type="button" class="btn" data-act="theme-cycle" style="justify-content:flex-start">Cambia tema</button>' +
      '<label class="field" style="margin-top:8px"><span>Utente</span><select id="userSelectM" aria-label="Utente">' + D.state.utenti.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === D.state.utenteId ? ' selected' : '') + '>' + esc(u.nome) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="dlg-actions"><button type="button" class="btn primary" data-act="dlg-close">Chiudi</button></div>');
  };

  /* ---------- Disegno della schermata ---------- */
  var lastPath = null;
  NM.render = function () {
    var r = NM.route(), entry = ROUTES.filter(function (x) { return x.path === r.path; })[0] || ROUTES[0];
    if (entry.admin && !UI.isAdmin()) { location.hash = '#/'; return; }
    if (V.scanStop) V.scanStop();
    renderChrome(entry.path);
    V.refreshPosList();
    var root = $('#main');
    try { V[entry.view](root, r.params); }
    catch (e) { root.innerHTML = '<div class="panel"><h2>Qualcosa è andato storto</h2><p class="sub">' + esc(e.message) + '</p><button type="button" class="btn" data-act="goto" data-id="">Torna al banco</button></div>'; if (window.console) console.error(e); }
    document.title = (entry.path ? entry.label + ' - ' : '') + 'NexMet Magazzino';
    if (entry.path !== lastPath) { window.scrollTo(0, 0); lastPath = entry.path; }
  };

  /* ---------- Azioni generali ---------- */
  A['goto'] = function (el) { UI.closeDialog(); NM.go(el.dataset.id || ''); };
  A['drawer-close'] = function () { UI.closeDrawer(); };
  A['dlg-close'] = function () { UI.closeDialog(); };
  A['toast-action'] = function () { var f = UI._toastAction; $('#toast').classList.remove('show'); UI._toastAction = null; if (f) f(); };
  A['palette-open'] = function () { UI.closeDialog(); UI.palette.open(); };

  NM.commands = [
    { label: 'Carica un lotto', run: function () { NM.views.caricoOpen(); } },
    { label: 'Nuovo pezzo', run: function () { NM.views.pezzoNew(); } },
    { label: 'Nuova vendita', run: function () { NM.views.venditaNew(); } },
    { label: 'Scansiona un codice', run: function () { NM.go('scan'); } },
    { label: 'Vai al banco di lavoro', run: function () { NM.go(''); } },
    { label: 'Vai ai pezzi', run: function () { NM.go('pezzi'); } },
    { label: 'Vai ai lotti', run: function () { NM.go('lotti'); } },
    { label: 'Vai alle vendite', run: function () { NM.go('vendite'); } },
    { label: 'Vai al margine', run: function () { NM.go('margine'); } },
    { label: 'Vai alla rubrica', run: function () { NM.go('rubrica'); } },
    { label: 'Stampa etichette', run: function () { NM.go('etichette'); } },
    { label: 'Esporta in Excel', run: function () { NM.act['export-xlsx'](); } },
    { label: 'Scarica il backup', run: function () { NM.act['backup-json'](); } }
  ];

  /* ---------- Eventi ---------- */
  document.addEventListener('click', function (e) {
    var pal = e.target.closest('[data-pal]');
    if (pal) { UI.palette.run(Number(pal.dataset.pal)); return; }
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = A[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'userSelect' || t.id === 'userSelectM') {
      D.meta('utenteId', t.value); UI.closeDialog(); UI.closeDrawer(); NM.render();
      UI.toast('Ora sei ' + D.user().nome + '.'); return;
    }
    var fn = t.dataset && t.dataset.act && NM.change[t.dataset.act];
    if (fn) fn(t);
  });
  ['dlg', 'palette'].forEach(function (id) {
    $('#' + id).addEventListener('click', function (e) { if (e.target === this) this.close(); });
  });
  function typing(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); UI.palette.open(); return; }
    if (e.key === 'Escape' && UI.drawerOpen() && !$('#dlg').open && !$('#palette').open) { UI.closeDrawer(); return; }
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || $('#dlg').open || $('#palette').open) return;
    if (e.key === '/') { e.preventDefault(); UI.palette.open(); }
    else if (e.key === 'n' && UI.canEdit()) { e.preventDefault(); V.pezzoNew(); }
  });
  window.addEventListener('hashchange', function () { UI.closeDrawer(); NM.render(); });

  /* ---------- Avvio ---------- */
  D.onError = function () { UI.toast('Non riesco a salvare: scarica subito un backup dalla pagina Dati.'); };
  applyTheme();
  $('#main').innerHTML = '<p class="muted" style="padding:40px 0">Apro il magazzino…</p>';
  D.init().then(function () {
    NM.render();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* l'app funziona anche senza */ });
    }
  });
})();

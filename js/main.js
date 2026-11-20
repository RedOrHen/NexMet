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
      '<div class="me"><span>Utente: <b>' + esc(D.user().nome) + '</b> (' + ({ admin: 'Admin', modifica: 'Modifica', consulta: 'Consultazione' }[role]) + ')</span></div>' +
      '<div class="me"><button type="button" class="btn sm" data-act="refresh">Aggiorna i dati</button><button type="button" class="btn sm" data-act="logout">Esci</button></div>' +
      '<button type="button" class="btn sm ghost" data-act="theme-cycle">Tema: ' + { auto: 'automatico', light: 'chiaro', dark: 'scuro' }[applyTheme()] + '</button>' +
      '<span>' + (role === 'consulta' ? 'Sei in sola consultazione. ' : '') + 'Dati condivisi, salvati su Supabase.</span></div>';
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
      '<button type="button" class="btn" data-act="refresh" style="justify-content:flex-start">Aggiorna i dati</button>' +
      '<button type="button" class="btn" data-act="logout" style="justify-content:flex-start">Esci (' + esc(D.user().nome) + ')</button></div>' +
      '<div class="dlg-actions"><button type="button" class="btn primary" data-act="dlg-close">Chiudi</button></div>');
  };

  /* ---------- Disegno della schermata ---------- */
  var lastPath = null;
  NM.render = function () {
    if (document.body.classList.contains('locked')) return;
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

  /* ---------- Accesso: schermate ---------- */
  function lock() { document.body.classList.add('locked'); UI.closeDrawer(); UI.closeDialog(); }
  function loginShell(inner) {
    return '<section class="login"><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>NexMet<small>Magazzino</small></span></div>' + inner + '</section>';
  }
  function setMsg(text, kind) { var m = $('#loginMsg'); if (m) { m.textContent = text || ''; m.className = 'msg' + (kind ? ' ' + kind : ''); } }
  function niceError(e) {
    var m = String((e && e.message) || e || '');
    if (/invalid login credentials/i.test(m)) return 'Email o password non corrette.';
    if (/email not confirmed/i.test(m)) return 'Devi prima confermare l’email: controlla la posta.';
    if (/rate limit|too many/i.test(m)) return 'Troppi tentativi: aspetta qualche minuto e riprova.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Non riesco a collegarmi: controlla la connessione.';
    return 'Non riesco ad accedere: ' + m;
  }
  V.login = function (message, kind) {
    lock();
    $('#main').innerHTML = loginShell('<h1>Accedi al magazzino</h1><p class="sub">Accesso riservato. Entra con la tua email e la tua password.</p>' +
      '<form id="loginForm" novalidate><label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>' +
      '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>' +
      '<p class="msg" id="loginMsg" role="alert"></p><button type="submit" class="btn primary">Entra</button></form>' +
      '<p class="foot"><button type="button" class="link" data-act="forgot">Password dimenticata?</button></p>');
    setMsg(message, kind);
    var f = $('#loginForm');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = f.elements.email.value.trim(), pw = f.elements.password.value;
      if (!email || !pw) { setMsg('Scrivi email e password.', 'err'); return; }
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true; setMsg('Controllo…');
      D.auth.signIn(email, pw).then(function (session) { handleSession(session); })
        .catch(function (err) { btn.disabled = false; f.elements.password.value = ''; setMsg(niceError(err), 'err'); });
    });
    var first = f.elements.email; if (first && !('ontouchstart' in window)) first.focus();
  };
  V.denied = function () {
    lock();
    $('#main').innerHTML = loginShell('<h1>Accesso non autorizzato</h1><p class="sub">Hai fatto l’accesso, ma questa utenza non è nell’elenco di chi può usare il magazzino. Chiedi a Redi di aggiungerti.</p>' +
      '<form><button type="button" class="btn primary" data-act="logout">Esci</button></form>');
  };
  V.recovery = function () {
    lock();
    $('#main').innerHTML = loginShell('<h1>Scegli una nuova password</h1><p class="sub">Almeno 8 caratteri.</p>' +
      '<form id="pwForm" novalidate><label class="field"><span>Nuova password</span><input name="pw" type="password" autocomplete="new-password" required></label>' +
      '<p class="msg" id="loginMsg" role="alert"></p><button type="submit" class="btn primary">Salva la password</button></form>');
    var f = $('#pwForm');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = f.elements.pw.value;
      if (pw.length < 8) { setMsg('La password deve avere almeno 8 caratteri.', 'err'); return; }
      D.auth.setPassword(pw).then(function () { return D.auth.start().then(function (s) { location.hash = '#/'; handleSession(s); }); })
        .catch(function (err) { setMsg(niceError(err), 'err'); });
    });
  };
  function showLoading(text) { lock(); $('#main').innerHTML = loginShell('<h1>' + esc(text) + '</h1><p class="sub">Un momento…</p>'); }
  function showFailure(e) {
    lock();
    $('#main').innerHTML = loginShell('<h1>Non riesco a collegarmi</h1><p class="sub">' + esc(niceError(e)) + '</p><form><button type="button" class="btn primary" data-act="retry">Riprova</button></form>');
  }
  function handleSession(session) {
    if (!session) { V.login(); return; }
    showLoading('Controllo i permessi');
    D.enter(session).then(function (r) {
      if (!r.ok) { V.denied(); return; }
      document.body.classList.remove('locked');
      NM.render();
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(function () { /* l'app funziona anche senza */ });
      }
    }).catch(showFailure);
  }
  A['forgot'] = function () {
    var email = ($('#loginForm') && $('#loginForm').elements.email.value || '').trim();
    if (!email) { setMsg('Scrivi la tua email qui sopra, poi clicca di nuovo "Password dimenticata?".', 'err'); return; }
    setMsg('Invio…');
    D.auth.reset(email).then(function () { setMsg('Se l’email è tra quelle autorizzate, ti arriva un messaggio con il link per scegliere una nuova password.', 'ok'); })
      .catch(function (err) { setMsg(niceError(err), 'err'); });
  };
  A['logout'] = function () { UI.closeDialog(); D.auth.signOut().then(function () { location.hash = '#/'; V.login('Sei uscito.', 'ok'); }).catch(function () { V.login(); }); };
  A['retry'] = function () { start(); };
  A['refresh'] = function () {
    UI.closeDialog();
    D.reload().then(function () { NM.render(); UI.toast('Dati aggiornati.'); }).catch(function (e) { UI.toast(niceError(e)); });
  };

  /* ---------- Avvio ---------- */
  D.onError = function (e) {
    var m = String((e && e.message) || e || '');
    UI.toast(/row-level security|permission denied|42501/i.test(m) ? 'Il tuo ruolo non permette questa modifica: ricarico i dati.' : 'Non sono riuscito a salvare (' + m + '): ricarico i dati.');
    D.reload().then(function () { if (!document.body.classList.contains('locked')) NM.render(); }).catch(function () { /* senza rete: resta com'è */ });
  };
  // Ricarica i dati quando si torna sulla scheda, se nessuno sta scrivendo.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || document.body.classList.contains('locked') || !D.user().id) return;
    if (Date.now() - D.lastLoad() < 20000) return;
    var busy = $('#dlg').open || $('#palette').open || UI.drawerOpen() || typing({ target: document.activeElement });
    D.reload().then(function () { if (!busy) NM.render(); }).catch(function () { /* senza rete: resta com'è */ });
  });
  function start() {
    applyTheme();
    lock();
    $('#main').innerHTML = loginShell('<h1>Apro il magazzino</h1><p class="sub">Un momento…</p>');
    if (!D.configured()) { $('#main').innerHTML = loginShell('<h1>Collegamento mancante</h1><p class="sub">Il collegamento al database non è raggiungibile. Controlla la connessione e ricarica la pagina.</p>'); return; }
    D.auth.start().then(function (session) {
      if (!start.listening) {
        start.listening = true;
        D.auth.onChange(function (event) {
          if (event === 'SIGNED_OUT') V.login();
          else if (event === 'PASSWORD_RECOVERY') V.recovery();
        });
      }
      handleSession(session);
    }).catch(showFailure);
  }
  start();
})();

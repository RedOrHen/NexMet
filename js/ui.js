/* Componenti di interfaccia: icone, avvisi, finestre, pannello laterale, moduli, ricerca rapida. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util, $ = U.$, esc = U.esc;
  var UI = (NM.ui = {});

  /* ---------- Icone ---------- */
  var P = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    box: '<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
    cart: '<path d="M3 4h3l2 12h11l2-8H7M10 20h.01M17 20h.01"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9"/>',
    users: '<path d="M16 20v-1.5a4 4 0 00-4-4H7a4 4 0 00-4 4V20M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-1.5a4 4 0 00-3-3.9M15.5 4.2a3.5 3.5 0 010 6.6"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8L3 12zM7.5 8h.01"/>',
    db: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
    scan: '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    print: '<path d="M7 9V3h10v6M7 17H5a1 1 0 01-1-1v-5a1 1 0 011-1h14a1 1 0 011 1v5a1 1 0 01-1 1h-2M7 14h10v7H7z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  UI.icon = function (name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  };

  /* ---------- Resistenze (stati) ---------- */
  var TONES = {
    stato: { 'Da verificare': 'yellow', 'Funzionante': 'green', 'Difettoso': 'red', 'Per macero (a peso)': 'brown' },
    fase: { 'Da verificare': 'yellow', 'Verificato': 'blue', 'Cancellato': 'orange', 'Certificato inviato': 'grey', 'Vendibile': 'green' },
    sped: { 'Da spedire': 'orange', 'Spedito': 'blue', 'Consegnato': 'green', 'Ritiro in sede': 'grey' }
  };
  UI.tone = function (kind, label) { return (TONES[kind] || {})[label] || 'grey'; };
  UI.chip = function (kind, label) {
    if (!label) return '<span class="muted">—</span>';
    return '<span class="chip" data-tone="' + UI.tone(kind, label) + '">' + esc(label) + '</span>';
  };

  /* ---------- Permessi ---------- */
  UI.canEdit = function () { var r = NM.data.user().ruolo; return r === 'admin' || r === 'modifica'; };
  UI.isAdmin = function () { return NM.data.user().ruolo === 'admin'; };
  UI.guardEdit = function () { if (!UI.canEdit()) { UI.toast('Il tuo ruolo permette solo la consultazione.'); return false; } return true; };
  UI.guardAdmin = function () { if (!UI.isAdmin()) { UI.toast('Solo l’Admin può farlo.'); return false; } return true; };

  /* ---------- Avvisi ---------- */
  var toastTimer;
  UI.toast = function (msg, opts) {
    opts = opts || {};
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.label ? '<button type="button" data-act="toast-action">' + esc(opts.label) + '</button>' : '');
    UI._toastAction = opts.onAction || null;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); UI._toastAction = null; }, opts.ms || (opts.label ? 7000 : 3200));
  };

  /* ---------- Finestre ---------- */
  UI.openDialog = function (html, opts) {
    var d = $('#dlg');
    d.className = 'noprint' + (opts && opts.wide ? ' wide' : '');
    d.innerHTML = html;
    if (!d.open) d.showModal();
    return d;
  };
  UI.closeDialog = function () { var d = $('#dlg'); if (d.open) d.close(); };

  function fieldHtml(f, v) {
    var val = (v == null || v === '') ? (f.def == null ? '' : f.def) : v;
    var req = f.required ? ' required' : '';
    var dep = (f.dep ? ' data-dep="' + f.dep + '"' : '') + (f.attrs ? ' ' + f.attrs : '');
    if (f.type === 'checkbox') {
      return '<label class="field check' + (f.full ? ' full' : '') + '"' + dep + '><input type="checkbox" name="' + f.key + '"' + (val ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>';
    }
    var input;
    if (f.type === 'select') {
      input = '<select name="' + f.key + '"' + req + '>' + f.options.map(function (o) {
        var ov = Array.isArray(o) ? o[0] : o, ol = Array.isArray(o) ? o[1] : o;
        return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ol) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea name="' + f.key + '" rows="3">' + esc(val) + '</textarea>';
    } else {
      var extra = f.type === 'number' ? ' step="' + (f.step || 'any') + '" min="' + (f.min == null ? 0 : f.min) + '" inputmode="decimal"' : '';
      if (f.list) extra += ' list="' + f.list + '"';
      input = '<input name="' + f.key + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' + req + extra + (f.autofocus ? ' autofocus' : '') + '>';
    }
    return '<label class="field' + (f.full ? ' full' : '') + '"' + dep + '><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span>' + input + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
  }
  UI.fieldsHtml = function (fields, values) {
    return fields.map(function (f) { return fieldHtml(f, values[f.key]); }).join('');
  };
  UI.readFields = function (form, fields) {
    var out = {};
    fields.forEach(function (f) {
      var el = form.elements[f.key];
      if (!el) return;
      if (f.type === 'checkbox') out[f.key] = !!el.checked;
      else if (f.type === 'number') out[f.key] = el.value === '' ? '' : Number(el.value);
      else out[f.key] = el.value.trim();
    });
    return out;
  };
  function wireDeps(form) {
    U.$$('[data-dep]', form).forEach(function (row) {
      var dep = form.elements[row.dataset.dep];
      if (!dep) return;
      var sync = function () { row.hidden = !dep.checked; };
      dep.addEventListener('change', sync); sync();
    });
  }
  /* Modulo generico in una finestra. onSave(valori) può restituire false per tenerlo aperto. */
  UI.form = function (title, fields, values, onSave, opts) {
    opts = opts || {};
    var d = UI.openDialog('<form id="dlgForm"><h2>' + esc(title) + '</h2>' + (opts.sub ? '<p class="sub">' + esc(opts.sub) + '</p>' : '') +
      '<div class="grid">' + UI.fieldsHtml(fields, values || {}) + '</div>' + (opts.extra || '') +
      '<div class="dlg-actions"><button type="button" class="btn ghost" data-act="dlg-close">Annulla</button>' +
      '<button type="submit" class="btn primary">' + esc(opts.submit || 'Salva') + '</button></div></form>', opts);
    var form = $('#dlgForm', d);
    wireDeps(form);
    form.onsubmit = function (e) {
      e.preventDefault();
      if (onSave(UI.readFields(form, fields), form) === false) return;
      UI.closeDialog();
    };
    var first = form.querySelector('input:not([type=checkbox]), select, textarea');
    if (first && !('ontouchstart' in window)) first.focus();
    return form;
  };
  UI.info = function (title, html) {
    UI.openDialog('<h2>' + esc(title) + '</h2>' + html + '<div class="dlg-actions"><button type="button" class="btn primary" data-act="dlg-close">Chiudi</button></div>');
  };

  /* ---------- Pannello laterale ---------- */
  UI.drawer = function (html) {
    $('#drawer').innerHTML = html;
    $('#drawerWrap').hidden = false;
    $('#drawer').scrollTop = 0;
  };
  UI.drawerOpen = function () { return !$('#drawerWrap').hidden; };
  UI.closeDrawer = function () { $('#drawerWrap').hidden = true; $('#drawer').innerHTML = ''; UI.drawerState = null; };

  /* ---------- Tabelle ---------- */
  UI.table = function (cols, rows, o) {
    o = o || {};
    if (!rows.length) return '<div class="tbl-wrap"><div class="empty">' + (o.empty || '<b>Niente da mostrare</b>') + '</div></div>';
    var head = cols.map(function (c) { return '<th class="' + (c.cls || '') + '">' + esc(c.h) + '</th>'; }).join('');
    var body = rows.map(function (r) {
      var attrs = o.rowAttr ? o.rowAttr(r) : '';
      return '<tr' + (o.click ? ' class="click"' : '') + attrs + '>' + cols.map(function (c) {
        return '<td class="' + (c.cls || '') + '"' + (c.h ? ' data-label="' + esc(c.h) + '"' : '') + '>' + c.f(r) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl ' + (o.stack === false ? '' : 'stack') + '"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  };
  UI.btn = function (label, act, id, cls, extra) {
    return '<button type="button" class="btn sm ' + (cls || '') + '" data-act="' + act + '" data-id="' + esc(id || '') + '"' + (extra || '') + '>' + esc(label) + '</button>';
  };

  /* ---------- Ricerca rapida (Ctrl+K) ---------- */
  var palItems = [], palSel = 0;
  function palRender() {
    var list = $('#palList');
    list.innerHTML = palItems.length ? palItems.map(function (it, i) {
      return '<li><button type="button" data-pal="' + i + '" aria-selected="' + (i === palSel) + '"><span>' + esc(it.label) + '</span><small>' + esc(it.hint || '') + '</small></button></li>';
    }).join('') : '<li class="empty">Nessun risultato</li>';
  }
  function palFilter(q) {
    var nq = U.norm(q).trim();
    var items = [];
    (NM.commands || []).forEach(function (c) { if (!nq || U.norm(c.label).indexOf(nq) !== -1) items.push({ label: c.label, hint: 'Azione', run: c.run }); });
    if (nq.length >= 1) {
      var s = NM.data.state, n = 0;
      s.pezzi.forEach(function (p) {
        if (n < 8 && NM.calc.haystack(p).indexOf(nq) !== -1) {
          n++; items.push({ label: p.nome, hint: (p.posizione || 'senza posizione') + ' — ' + p.codice, run: function () { NM.views.openPezzo(p.id); } });
        }
      });
      s.lotti.forEach(function (l) { if (U.norm(l.nome + ' ' + (l.fonte || '')).indexOf(nq) !== -1) items.push({ label: l.nome, hint: 'Lotto', run: function () { NM.go('margine', { lotto: l.id }); } }); });
      s.anagrafiche.forEach(function (a) { if (U.norm(a.nome).indexOf(nq) !== -1) items.push({ label: a.nome, hint: a.tipo === 'fornitore' ? 'Fornitore' : 'Cliente', run: function () { NM.go('rubrica'); } }); });
    }
    palItems = items.slice(0, 14); palSel = 0; palRender();
  }
  UI.palette = {
    open: function () {
      var d = $('#palette');
      d.innerHTML = '<input class="pal-in" id="palIn" type="search" placeholder="Cerca un pezzo, un lotto o un’azione" autocomplete="off" aria-label="Cerca">' +
        '<ul class="pal-list" id="palList"></ul><div class="pal-hint">Frecce per scorrere, Invio per aprire, Esc per chiudere</div>';
      if (!d.open) d.showModal();
      palFilter('');
      var inp = $('#palIn');
      inp.addEventListener('input', function () { palFilter(inp.value); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { palSel = Math.min(palSel + 1, palItems.length - 1); palRender(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { palSel = Math.max(palSel - 1, 0); palRender(); e.preventDefault(); }
        else if (e.key === 'Enter') { UI.palette.run(palSel); e.preventDefault(); }
      });
      inp.focus();
    },
    run: function (i) {
      var it = palItems[i]; if (!it) return;
      var d = $('#palette'); if (d.open) d.close();
      it.run();
    },
    close: function () { var d = $('#palette'); if (d.open) d.close(); }
  };
})();

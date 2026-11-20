/* Menu Tabelle: gli elenchi "Tipo" e "Posizioni". I valori inseriti qui compaiono come scelte
   nei moduli dei pezzi, nei filtri e nel carico dei lotti. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util, UI = NM.ui, C = NM.calc, D = NM.data, esc = U.esc, $ = U.$;
  var V = (NM.views = NM.views || {});
  var A = (NM.act = NM.act || {});

  var CFG = {
    tipi: {
      field: 'tipo', titolo: 'Tipo', cosa: 'tipo', cosaPl: 'tipi', nomeLabel: 'Nuovo tipo', placeholder: 'Es. Switch, Telefono, Fusibile',
      sub: 'I tipi di articolo. Quelli che scrivi qui compaiono come scelta nel campo “Tipo” dei pezzi, nei filtri e nel carico dei lotti.',
      vuoto: '<b>Nessun tipo in elenco</b>Finché la tabella è vuota il sito usa l’elenco predefinito (RAM, Disco, CPU, Scheda madre, Scheda, Alimentatore, Altro).'
    },
    posizioni: {
      field: 'posizione', titolo: 'Posizioni', cosa: 'posizione', cosaPl: 'posizioni', nomeLabel: 'Nuova posizione', placeholder: 'Es. Scaffale A - Scatola 3',
      sub: 'Dove si trovano i pezzi in magazzino (scaffali, scatole). Quelle che scrivi qui compaiono come scelta nel campo “Posizione” dei pezzi, nello spostamento e nel carico dei lotti.',
      vuoto: '<b>Nessuna posizione in elenco</b>Finché la tabella è vuota nei moduli la posizione si scrive a mano.'
    }
  };
  var QUERY = { tipi: '', posizioni: '' };

  function cfg(store) { return CFG[store]; }
  function same(a, b) { return U.norm(String(a || '').trim()) === U.norm(String(b || '').trim()); }
  function usedBy(store, nome) {
    var f = cfg(store).field;
    return D.state.pezzi.filter(function (p) { return same(p[f], nome); });
  }
  function exists(store, nome, exceptId) {
    return D.state[store].some(function (r) { return r.id !== exceptId && same(r.nome, nome); });
  }
  function ordered(store) {
    var rows = D.state[store].slice();
    if (store === 'posizioni') rows.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true, sensitivity: 'base' }); });
    return rows;
  }

  function draw(store, root) {
    var c = cfg(store), edit = UI.canEdit();
    var all = ordered(store), nq = U.norm(QUERY[store]).trim();
    var rows = all.filter(function (r) { return !nq || U.norm(r.nome + ' ' + (r.note || '')).indexOf(nq) !== -1; });
    var missing = C.nonInElenco(c.field);
    root.innerHTML =
      '<div class="page-head"><div><h1>' + esc(c.titolo) + '</h1><p class="sub">' + esc(c.sub) + '</p></div></div>' +
      (edit ? '<form class="tab-add" id="tabAdd" data-s="' + store + '" autocomplete="off">' +
        '<label class="field"><span>' + esc(c.nomeLabel) + '</span><input name="nome" required maxlength="120" placeholder="' + esc(c.placeholder) + '"></label>' +
        '<label class="field"><span>Note (facoltative)</span><input name="note" maxlength="300"></label>' +
        '<button type="submit" class="btn primary">' + UI.icon('plus') + 'Aggiungi</button></form>' : '<p class="note">Il tuo ruolo permette solo la consultazione: gli elenchi si leggono ma non si modificano.</p>') +
      (all.length > 8 ? '<div class="toolbar" style="margin:12px 0"><input id="tabQ" type="search" placeholder="Cerca in ' + esc(c.titolo.toLowerCase()) + '" value="' + esc(QUERY[store]) + '" aria-label="Cerca"></div>' : '') +
      UI.table([
        { h: 'Nome', cls: 'name', f: function (r) { return '<b>' + esc(r.nome) + '</b>'; } },
        { h: 'Note', f: function (r) { return r.note ? esc(r.note) : '<span class="muted">—</span>'; } },
        { h: 'Pezzi', cls: 'num', f: function (r) { var n = usedBy(store, r.nome).length; return n ? '<b>' + n + '</b>' : '<span class="muted">0</span>'; } },
        { h: '', cls: 'acts', f: function (r) { return edit ? UI.btn('Modifica', 'tab-edit', r.id, '', ' data-s="' + store + '"') + ' ' + UI.btn('Elimina', 'tab-del', r.id, 'danger', ' data-s="' + store + '"') : ''; } }
      ], rows, { empty: all.length ? '<b>Nessun risultato</b>Cambia la ricerca.' : c.vuoto }) +
      (missing.length ? '<section class="section" style="margin-top:18px"><h2>Usati dai pezzi ma non in elenco</h2>' +
        '<p class="sub">Questi valori sono già scritti su alcuni pezzi (dati vecchi o importati) ma non sono nella tabella.' + (edit ? ' Aggiungili per averli tra le scelte.' : '') + '</p>' +
        '<div class="filters">' + missing.map(function (m) {
          return '<span class="miss">' + esc(m) + (edit ? ' <button type="button" class="btn sm" data-act="tab-add-missing" data-s="' + store + '" data-v="' + esc(m) + '">Aggiungi</button>' : '') + '</span>';
        }).join('') + '</div>' +
        (edit && missing.length > 1 ? '<p style="margin-top:10px"><button type="button" class="btn" data-act="tab-add-missing" data-s="' + store + '" data-v="">Aggiungi tutti (' + missing.length + ')</button></p>' : '') + '</section>' : '');
    var form = $('#tabAdd', root);
    if (form) {
      form.onsubmit = function (e) { e.preventDefault(); addRow(store, form); };
      if (!('ontouchstart' in window) && !QUERY[store]) form.elements.nome.focus();
    }
    var q = $('#tabQ', root);
    if (q) q.addEventListener('input', U.debounce(function () { QUERY[store] = q.value; draw(store, root); var again = $('#tabQ', root); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }, 120));
  }

  function addRow(store, form) {
    if (!UI.guardEdit()) return;
    var c = cfg(store), nome = String(form.elements.nome.value || '').trim().replace(/\s+/g, ' '), note = String(form.elements.note.value || '').trim();
    if (!nome) { UI.toast('Scrivi un nome.'); return; }
    if (exists(store, nome)) { UI.toast('“' + nome + '” è già in elenco.'); return; }
    var r = { id: U.uid(), nome: nome, note: note, creato: Date.now() };
    D.put(store, r);
    D.log('ha aggiunto a ' + c.titolo, store, r.id, nome);
    NM.render(); UI.toast(c.titolo + ': aggiunto “' + nome + '”');
  }
  function renamePezzi(store, oldName, newName) {
    var f = cfg(store).field, used = usedBy(store, oldName);
    used.forEach(function (p) { var o = {}; o[f] = newName; D.put('pezzi', Object.assign({}, p, o)); });
    return used.length;
  }

  A['tab-edit'] = function (el) {
    if (!UI.guardEdit()) return;
    var store = el.dataset.s, c = cfg(store), r = D.get(store, el.dataset.id); if (!r) return;
    var n = usedBy(store, r.nome).length;
    UI.form('Modifica ' + c.cosa, [
      { key: 'nome', label: 'Nome', required: true, full: true, hint: n ? 'Se lo cambi, si aggiornano anche i ' + n + ' pezzi che lo usano.' : '' },
      { key: 'note', label: 'Note', full: true }
    ], r, function (v) {
      var nome = String(v.nome || '').trim().replace(/\s+/g, ' ');
      if (!nome) { UI.toast('Scrivi un nome.'); return false; }
      if (exists(store, nome, r.id)) { UI.toast('“' + nome + '” è già in elenco.'); return false; }
      var changed = nome !== r.nome ? renamePezzi(store, r.nome, nome) : 0;
      D.put(store, Object.assign({}, r, { nome: nome, note: v.note }));
      D.log('ha modificato in ' + c.titolo, store, r.id, r.nome + (nome !== r.nome ? ' → ' + nome : ''));
      NM.render(); UI.toast('Salvato' + (changed ? ': aggiornati ' + changed + ' pezzi' : ''));
    });
  };
  A['tab-del'] = function (el) {
    if (!UI.guardEdit()) return;
    var store = el.dataset.s, c = cfg(store), r = D.get(store, el.dataset.id); if (!r) return;
    var n = usedBy(store, r.nome).length;
    if (n) { UI.toast('“' + r.nome + '” è usato da ' + n + (n === 1 ? ' pezzo' : ' pezzi') + ': cambia prima quelli, poi potrai eliminarlo.'); return; }
    if (!confirm('Eliminare “' + r.nome + '” dall’elenco?')) return;
    D.remove(store, r.id);
    D.log('ha eliminato da ' + c.titolo, store, r.id, r.nome);
    NM.render();
    UI.toast('Eliminato “' + r.nome + '”.', { label: 'Annulla', onAction: function () { D.put(store, r); D.log('ha ripristinato in ' + c.titolo, store, r.id, r.nome); NM.render(); } });
  };
  A['tab-add-missing'] = function (el) {
    if (!UI.guardEdit()) return;
    var store = el.dataset.s, c = cfg(store), v = el.dataset.v;
    var list = v ? [v] : C.nonInElenco(c.field), made = 0;
    list.forEach(function (name) {
      if (exists(store, name)) return;
      D.put(store, { id: U.uid(), nome: name, note: '', creato: Date.now() + made }); made++;
    });
    if (made) D.log('ha aggiunto a ' + c.titolo, store, '', made + (made === 1 ? ' valore già in uso' : ' valori già in uso'));
    NM.render(); UI.toast(made ? 'Aggiunti all’elenco: ' + made : 'Niente da aggiungere.');
  };

  V.tabTipo = function (root) { draw('tipi', root); };
  V.tabPosizioni = function (root) { draw('posizioni', root); };
})();

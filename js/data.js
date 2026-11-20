/* Livello dati. L'interfaccia parla solo con NM.data: per passare a un database con login
   in futuro basta riscrivere questo file, senza toccare le schermate.
   Archivio: IndexedDB (con ripiego su localStorage). I dati sono tenuti anche in memoria. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util;

  var STORES = ['lotti', 'pezzi', 'anagrafiche', 'vendite', 'log'];
  var META_KEYS = ['utenti', 'utenteId', 'seq', 'ultimoBackup'];
  var LS_FALLBACK = 'nexmet.v2.fallback';
  var V1_KEY = 'nexmet.magazzino.v1';
  var LOG_MAX = 500;

  var idb = null;
  var mode = 'idb';

  function defaultUsers() {
    return [{ id: 'u1', nome: 'Redi', ruolo: 'admin' }, { id: 'u2', nome: 'Elvinas', ruolo: 'consulta' }];
  }
  var state = {
    lotti: [], pezzi: [], anagrafiche: [], vendite: [], log: [],
    utenti: defaultUsers(), utenteId: 'u1', seq: 0, ultimoBackup: ''
  };
  var D = (NM.data = { state: state, version: 0 });
  D.mode = function () { return mode; };
  D.onError = function () {};

  /* ---------- IndexedDB ---------- */
  function openDb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('IndexedDB non disponibile'));
      var r = indexedDB.open('nexmet-magazzino', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        STORES.forEach(function (s) { d.createObjectStore(s, { keyPath: 'id' }); });
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbAll(store) {
    return new Promise(function (res, rej) {
      var q = idb.transaction(store).objectStore(store).getAll();
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  function idbRun(store, fn) {
    return new Promise(function (res, rej) {
      var t = idb.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = function () { res(); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error); };
    });
  }
  function idbPut(store, list) {
    return idbRun(store, function (s) { list.forEach(function (o) { s.put(o); }); }).catch(D.onError);
  }
  function idbDel(store, ids) {
    return idbRun(store, function (s) { ids.forEach(function (id) { s.delete(id); }); }).catch(D.onError);
  }
  function saveMeta(keys) {
    if (mode !== 'idb') return;
    idbPut('meta', (keys || META_KEYS).map(function (k) { return { key: k, value: state[k] }; }));
  }

  /* ---------- Ripiego su localStorage ---------- */
  var lsTimer;
  function lsSave() {
    clearTimeout(lsTimer);
    lsTimer = setTimeout(function () {
      try { localStorage.setItem(LS_FALLBACK, JSON.stringify(state)); } catch (e) { D.onError(e); }
    }, 250);
  }

  function touch() { D.version++; if (mode === 'ls') lsSave(); }

  /* ---------- Avvio ---------- */
  function ensureUsers() {
    if (!Array.isArray(state.utenti) || !state.utenti.length) state.utenti = defaultUsers();
    if (!state.utenti.some(function (u) { return u.id === state.utenteId; })) state.utenteId = state.utenti[0].id;
  }
  D.init = function () {
    return openDb().then(function (db) {
      idb = db;
      mode = 'idb';
      return Promise.all(STORES.map(function (s) { return idbAll(s).then(function (rows) { state[s] = rows; }); }))
        .then(function () { return idbAll('meta'); })
        .then(function (rows) { rows.forEach(function (r) { state[r.key] = r.value; }); });
    }).catch(function () {
      mode = 'ls';
      try {
        var raw = localStorage.getItem(LS_FALLBACK);
        if (raw) Object.assign(state, JSON.parse(raw));
      } catch (e) { /* archivio non leggibile: si parte vuoti */ }
    }).then(function () { ensureUsers(); D.version++; });
  };

  /* ---------- Scrittura ---------- */
  D.get = function (store, id) { return state[store].find(function (x) { return x.id === id; }); };
  D.put = function (store, obj) {
    var arr = state[store], i = arr.findIndex(function (x) { return x.id === obj.id; });
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    touch();
    if (mode === 'idb') idbPut(store, [obj]);
    return obj;
  };
  D.bulkPut = function (store, list) {
    list.forEach(function (obj) {
      var arr = state[store], i = arr.findIndex(function (x) { return x.id === obj.id; });
      if (i >= 0) arr[i] = obj; else arr.push(obj);
    });
    touch();
    if (mode === 'idb') idbPut(store, list);
  };
  D.remove = function (store, id) {
    state[store] = state[store].filter(function (x) { return x.id !== id; });
    touch();
    if (mode === 'idb') idbDel(store, [id]);
  };
  D.meta = function (key, val) { state[key] = val; touch(); saveMeta([key]); };
  D.user = function () {
    return state.utenti.find(function (u) { return u.id === state.utenteId; }) || state.utenti[0];
  };
  D.nextCode = function () {
    state.seq += 1;
    saveMeta(['seq']);
    return 'NM-' + String(state.seq).padStart(5, '0');
  };
  D.log = function (action, entity, refId, label) {
    var e = { id: U.uid(), ts: Date.now(), user: D.user().nome, action: action, entity: entity, refId: refId || '', label: label || '' };
    state.log.push(e);
    if (mode === 'idb') idbPut('log', [e]);
    if (state.log.length > LOG_MAX) {
      var old = state.log.splice(0, state.log.length - LOG_MAX);
      if (mode === 'idb') idbDel('log', old.map(function (x) { return x.id; }));
    }
    touch();
  };

  /* ---------- Copia completa, ripristino, azzeramento ---------- */
  D.snapshot = function () {
    return {
      version: 2, exportedAt: new Date().toISOString(),
      lotti: state.lotti, pezzi: state.pezzi, anagrafiche: state.anagrafiche, vendite: state.vendite,
      log: state.log, utenti: state.utenti, seq: state.seq
    };
  };
  function clearAll() {
    if (mode !== 'idb') return Promise.resolve();
    return Promise.all(STORES.map(function (s) { return idbRun(s, function (st) { st.clear(); }); }));
  }
  D.restore = function (snap, opts) {
    opts = opts || {};
    var keepUsers = opts.keepUsers;
    var users = state.utenti, uid = state.utenteId;
    return clearAll().then(function () {
      STORES.forEach(function (s) { state[s] = Array.isArray(snap[s]) ? snap[s] : []; });
      state.seq = Math.max(U.n(snap.seq), maxSeq(state.pezzi));
      if (keepUsers) { state.utenti = users; state.utenteId = uid; }
      else if (Array.isArray(snap.utenti) && snap.utenti.length) { state.utenti = snap.utenti; }
      ensureUsers();
      touch();
      if (mode === 'idb') {
        return Promise.all(STORES.map(function (s) { return idbPut(s, state[s]); })).then(function () { saveMeta(); });
      }
    });
  };
  function maxSeq(pezzi) {
    return pezzi.reduce(function (m, p) {
      var k = /^NM-(\d+)$/.exec(p.codice || '');
      return k ? Math.max(m, Number(k[1])) : m;
    }, 0);
  }
  D.wipe = function () {
    return D.restore({ lotti: [], pezzi: [], anagrafiche: [], vendite: [], log: [], seq: 0 }, { keepUsers: true });
  };

  /* ---------- Dati del prototipo (v1) ---------- */
  D.hasV1 = function () { try { return !!localStorage.getItem(V1_KEY); } catch (e) { return false; } };
  D.importV1 = function () {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(V1_KEY)); } catch (e) { raw = null; }
    if (!raw || !Array.isArray(raw.pezzi)) return Promise.reject(new Error('Dati del prototipo non leggibili'));
    ['lotti', 'pezzi', 'anagrafiche', 'vendite'].forEach(function (s) { D.bulkPut(s, raw[s] || []); });
    state.seq = Math.max(state.seq, U.n(raw.seq), maxSeq(state.pezzi));
    saveMeta(['seq']);
    D.log('importato', 'dati', '', 'Dati del prototipo (v1)');
    return Promise.resolve({ pezzi: raw.pezzi.length, lotti: (raw.lotti || []).length });
  };

  /* ---------- Spazio occupato ---------- */
  D.estimate = function () {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    return Promise.resolve(null);
  };
})();

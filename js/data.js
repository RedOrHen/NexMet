/* Livello dati: Supabase (database con accesso protetto).
   Le schermate parlano solo con NM.data. I dati sono tenuti anche in memoria per essere veloci;
   ogni modifica viene scritta subito nel database, in ordine, nelle colonne di ogni tabella. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util;
  var CFG = window.NM_CONFIG || {};
  var V1_KEY = 'nexmet.magazzino.v1';
  var LOG_MAX = 500;
  var PAGE = 1000;
  // Ordine di scrittura: prima ciò a cui gli altri fanno riferimento.
  var STORES = ['anagrafiche', 'lotti', 'pezzi', 'vendite', 'log'];

  var state = { lotti: [], pezzi: [], anagrafiche: [], vendite: [], log: [], utenti: [], utenteId: '', seq: 0, ultimoBackup: '' };
  var D = (NM.data = { state: state, version: 0 });
  var client = null, queue = Promise.resolve(), pool = [], lastLoad = 0;
  D.onError = function () {};
  D.mode = function () { return 'supabase'; };
  D.lastLoad = function () { return lastLoad; };

  /* ---------- Colonne di ogni tabella: [campo del sito, colonna, tipo] ---------- */
  var SCHEMA = {
    anagrafiche: [['tipo', 'tipo', 's'], ['nome', 'nome', 's'], ['email', 'email', 's'], ['telefono', 'telefono', 's'], ['indirizzo', 'indirizzo', 's'], ['paese', 'paese', 's'], ['note', 'note', 's']],
    lotti: [['nome', 'nome', 's'], ['fonte', 'fonte', 's'], ['data', 'data', 'd'], ['costo', 'costo', 'n0'], ['fornitoreId', 'fornitore_id', 'fk'], ['ripartizione', 'ripartizione', 's0'], ['note', 'note', 's']],
    pezzi: [['codice', 'codice', 's'], ['nome', 'nome', 's'], ['tipo', 'tipo', 's'], ['marca', 'marca', 's'], ['modello', 'modello', 's'], ['codiceProdotto', 'codice_prodotto', 's'],
      ['capacita', 'capacita', 's'], ['quantita', 'quantita', 'i'], ['stato', 'stato', 's'], ['peso', 'peso', 'n'], ['test', 'test', 's'], ['posizione', 'posizione', 's'],
      ['lottoId', 'lotto_id', 'fk'], ['fotoPercorso', 'foto_percorso', 's'], ['prezzoRif', 'prezzo_rif', 'n'], ['prezzoIA', 'prezzo_ia', 'n'], ['prezzoFinale', 'prezzo_finale', 'n'],
      ['datiSensibili', 'dati_sensibili', 'b'], ['fase', 'fase', 's'], ['certificato', 'certificato', 's'], ['note', 'note', 's'], ['creato', 'creato', 'ts']],
    vendite: [['pezzoId', 'pezzo_id', 'fk'], ['quantita', 'quantita', 'i'], ['ricavo', 'ricavo', 'n0'], ['modo', 'modo', 's0'], ['pesoKg', 'peso_kg', 'n'], ['prezzoKg', 'prezzo_kg', 'n'],
      ['gruppo', 'gruppo', 's'], ['data', 'data', 'd'], ['clienteId', 'cliente_id', 'fk'], ['spedStato', 'sped_stato', 's'], ['spedCorriere', 'sped_corriere', 's'],
      ['spedTracking', 'sped_tracking', 's'], ['spedPaese', 'sped_paese', 's'], ['note', 'note', 's']],
    log: [['ts', 'ts', 'ts'], ['user', 'utente', 's'], ['action', 'azione', 's'], ['entity', 'entita', 's'], ['refId', 'rif_id', 's'], ['label', 'etichetta', 's']]
  };
  function toDb(type, v) {
    switch (type) {
      case 's': return (v === '' || v == null) ? null : String(v);
      case 's0': return (v === '' || v == null) ? undefined : String(v);
      case 'n': return U.has(v) ? Number(v) : null;
      case 'n0': return U.has(v) ? Number(v) : 0;
      case 'i': return U.has(v) ? Math.round(Number(v)) : undefined;
      case 'b': return !!v;
      case 'd': return v ? String(v).slice(0, 10) : null;
      case 'fk': return v ? String(v) : null;
      case 'ts': return U.has(v) && Number(v) > 0 ? new Date(Number(v)).toISOString() : undefined;
    }
    return v;
  }
  function fromDb(type, v) {
    switch (type) {
      case 's': case 's0': case 'fk': case 'd': return v == null ? '' : String(v);
      case 'n': case 'n0': case 'i': return v == null ? '' : Number(v);
      case 'b': return !!v;
      case 'ts': return v ? new Date(v).getTime() : 0;
    }
    return v;
  }
  // I campi sconosciuti (aggiunti in futuro al sito) finiscono nella colonna "extra" e non si perdono.
  function toRow(store, o) {
    var row = { id: o.id }, known = { id: 1 }, extra = {};
    SCHEMA[store].forEach(function (f) {
      known[f[0]] = 1;
      var v = toDb(f[2], o[f[0]]);
      if (v !== undefined) row[f[1]] = v;
    });
    if (store !== 'log') {
      Object.keys(o).forEach(function (k) { if (!known[k]) extra[k] = o[k]; });
      row.extra = extra;
    }
    return row;
  }
  function fromRow(store, r) {
    var o = { id: r.id };
    SCHEMA[store].forEach(function (f) { o[f[0]] = fromDb(f[2], r[f[1]]); });
    if (r.extra && typeof r.extra === 'object') Object.keys(r.extra).forEach(function (k) { if (!(k in o)) o[k] = r.extra[k]; });
    return o;
  }

  /* ---------- Operazioni sul database, una alla volta e in ordine ---------- */
  function run(fn) {
    var p = queue.then(fn);
    queue = p.catch(function () { /* l'errore lo gestisce chi ha chiamato */ });
    return p;
  }
  function must(res) { if (res && res.error) throw res.error; return res; }
  function chunks(list, n) { var out = []; for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }
  function upsertRows(store, objs) {
    return chunks(objs.map(function (o) { return toRow(store, o); }), 200).reduce(function (p, part) {
      return p.then(function () { return client.from(store).upsert(part, { onConflict: 'id' }).then(must); });
    }, Promise.resolve());
  }
  function fail(e) { D.onError(e); }

  /* ---------- Accesso ---------- */
  D.configured = function () { return !!(CFG.url && CFG.key && window.supabase && window.supabase.createClient); };
  D.auth = {
    start: function () {
      client = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      return client.auth.getSession().then(function (r) { return r.data ? r.data.session : null; });
    },
    onChange: function (cb) { client.auth.onAuthStateChange(function (event, session) { setTimeout(function () { cb(event, session); }, 0); }); },
    signIn: function (email, password) {
      return client.auth.signInWithPassword({ email: String(email).trim(), password: password }).then(function (r) { must(r); return r.data.session; });
    },
    signOut: function () {
      state.lotti = []; state.pezzi = []; state.anagrafiche = []; state.vendite = []; state.log = []; state.utenti = []; state.utenteId = ''; pool = []; D.version++;
      return client.auth.signOut();
    },
    reset: function (email) {
      return client.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: location.origin + location.pathname }).then(must);
    },
    setPassword: function (pw) { return client.auth.updateUser({ password: pw }).then(must); }
  };
  D.user = function () {
    return state.utenti.filter(function (u) { return u.id === state.utenteId; })[0] || { id: '', nome: '', ruolo: 'consulta' };
  };
  // Dopo l'accesso: legge il ruolo e i dati. Chi non è nell'elenco degli autorizzati non entra.
  D.enter = function (session) {
    return client.from('nexmet_utenti').select('*').then(must).then(function (res) {
      var rows = res.data || [];
      var mine = rows.filter(function (r) { return r.user_id === session.user.id; })[0];
      if (!mine) return { ok: false };
      state.utenti = rows.map(function (r) { return { id: r.user_id, nome: r.nome, ruolo: r.ruolo }; });
      state.utenteId = mine.user_id;
      try { state.ultimoBackup = localStorage.getItem('nexmet.ultimoBackup') || ''; } catch (e) { state.ultimoBackup = ''; }
      return D.reload().then(function () {
        var canWrite = mine.ruolo === 'admin' || mine.ruolo === 'modifica';
        return (canWrite ? D.reserveCodes(30).catch(fail) : Promise.resolve()).then(function () { return { ok: true }; });
      });
    });
  };

  /* ---------- Lettura ---------- */
  function fetchAll(store) {
    var all = [], from = 0;
    function next() {
      var q = client.from(store).select('*');
      // nell'ordine in cui sono stati inseriti (data di creazione), così gli elenchi restano stabili
      q = store === 'log' ? q.order('ts', { ascending: false }).range(0, LOG_MAX - 1) : q.order('creato', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
      return q.then(must).then(function (res) {
        all = all.concat(res.data || []);
        if (store !== 'log' && (res.data || []).length === PAGE) { from += PAGE; return next(); }
        return all;
      });
    }
    return next();
  }
  D.reload = function () {
    return Promise.all(STORES.map(function (s) { return fetchAll(s); })).then(function (all) {
      STORES.forEach(function (s, i) {
        var list = all[i].map(function (r) { return fromRow(s, r); });
        state[s] = s === 'log' ? list.reverse() : list;
      });
      state.seq = state.pezzi.reduce(function (m, p) { var k = /^NM-(\d+)$/.exec(p.codice || ''); return k ? Math.max(m, Number(k[1])) : m; }, 0);
      lastLoad = Date.now();
      D.version++;
    });
  };

  /* ---------- Scrittura ---------- */
  D.get = function (store, id) { return state[store].filter(function (x) { return x.id === id; })[0]; };
  D.put = function (store, obj) {
    var arr = state[store], i = arr.findIndex(function (x) { return x.id === obj.id; });
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    D.version++;
    run(function () { return upsertRows(store, [obj]); }).catch(fail);
    return obj;
  };
  D.bulkPut = function (store, list) {
    list.forEach(function (obj) {
      var arr = state[store], i = arr.findIndex(function (x) { return x.id === obj.id; });
      if (i >= 0) arr[i] = obj; else arr.push(obj);
    });
    D.version++;
    return run(function () { return upsertRows(store, list); }).catch(fail);
  };
  D.remove = function (store, id) {
    state[store] = state[store].filter(function (x) { return x.id !== id; });
    D.version++;
    run(function () { return client.from(store).delete().eq('id', id).then(must); }).catch(fail);
  };
  D.meta = function (key, val) {
    state[key] = val;
    if (key === 'ultimoBackup') { try { localStorage.setItem('nexmet.ultimoBackup', val); } catch (e) { /* non disponibile */ } }
  };
  D.log = function (action, entity, refId, label) {
    var e = { id: U.uid(), ts: Date.now(), user: D.user().nome, action: action, entity: entity, refId: refId || '', label: label || '' };
    state.log.push(e);
    if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
    D.version++;
    run(function () { return client.from('log').insert(toRow('log', e)).then(must); }).catch(fail);
  };

  /* ---------- Codici interni dei pezzi (NM-00001, ...), unici anche con più utenti ---------- */
  D.reserveCodes = function (n) {
    var missing = Math.max(n - pool.length, 0);
    if (!missing) return Promise.resolve();
    return client.rpc('nx_riserva_codici', { n: Math.min(Math.max(missing, 20), 1000) }).then(must).then(function (res) {
      pool = pool.concat((res.data || []).map(Number)).sort(function (a, b) { return a - b; });
    });
  };
  D.nextCode = function () {
    if (!pool.length) throw new Error('I codici non sono ancora pronti: riprova tra un momento.');
    var c = pool.shift();
    if (pool.length < 10) D.reserveCodes(30).catch(fail);
    return 'NM-' + String(c).padStart(5, '0');
  };

  /* ---------- Copia completa, ripristino, azzeramento (Admin) ---------- */
  D.snapshot = function () {
    return {
      version: 3, exportedAt: new Date().toISOString(),
      lotti: state.lotti, pezzi: state.pezzi, anagrafiche: state.anagrafiche, vendite: state.vendite,
      log: state.log, seq: state.seq
    };
  };
  function deleteAll() {
    return ['vendite', 'pezzi', 'lotti', 'anagrafiche', 'log'].reduce(function (p, s) {
      return p.then(function () { return client.from(s).delete().neq('id', '__nessuno__').then(must); });
    }, Promise.resolve());
  }
  D.restore = function (snap) {
    var data = {};
    STORES.forEach(function (s) { data[s] = Array.isArray(snap[s]) ? snap[s] : []; });
    var maxCode = data.pezzi.reduce(function (m, p) { var k = /^NM-(\d+)$/.exec(p.codice || ''); return k ? Math.max(m, Number(k[1])) : m; }, 0);
    return run(function () {
      return deleteAll().then(function () {
        return STORES.reduce(function (p, s) { return p.then(function () { return data[s].length ? upsertRows(s, data[s]) : null; }); }, Promise.resolve());
      }).then(function () {
        return client.rpc('nx_imposta_codice', { minimo: Math.max(maxCode, U.n(snap.seq)) }).then(must);
      }).then(function () { pool = []; return D.reload(); }).then(function () { return D.reserveCodes(30); });
    });
  };
  D.wipe = function () {
    return run(function () { return deleteAll().then(function () { return D.reload(); }); });
  };

  /* ---------- Gestione degli utenti autorizzati (Admin) ---------- */
  function refreshUsers() {
    return client.from('nexmet_utenti').select('*').then(must).then(function (res) {
      state.utenti = (res.data || []).map(function (r) { return { id: r.user_id, nome: r.nome, ruolo: r.ruolo }; });
      D.version++;
    });
  }
  D.setRole = function (userId, ruolo) { return client.from('nexmet_utenti').update({ ruolo: ruolo }).eq('user_id', userId).then(must).then(refreshUsers); };
  D.addUser = function (userId, nome, ruolo) { return client.from('nexmet_utenti').insert({ user_id: userId, nome: nome, ruolo: ruolo }).then(must).then(refreshUsers); };
  D.removeUser = function (userId) { return client.from('nexmet_utenti').delete().eq('user_id', userId).then(must).then(refreshUsers); };

  /* ---------- Dati del prototipo (v1, salvati nel browser) ---------- */
  D.hasV1 = function () { try { return !!localStorage.getItem(V1_KEY); } catch (e) { return false; } };
  D.importV1 = function () {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(V1_KEY)); } catch (e) { raw = null; }
    if (!raw || !Array.isArray(raw.pezzi)) return Promise.reject(new Error('Dati del prototipo non leggibili'));
    var maxCode = (raw.pezzi || []).reduce(function (m, p) { var k = /^NM-(\d+)$/.exec(p.codice || ''); return k ? Math.max(m, Number(k[1])) : m; }, 0);
    return STORES.slice(0, 4).reduce(function (p, s) { return p.then(function () { return (raw[s] && raw[s].length) ? D.bulkPut(s, raw[s]) : null; }); }, Promise.resolve())
      .then(function () { return run(function () { return client.rpc('nx_imposta_codice', { minimo: maxCode }).then(must); }); })
      .then(function () { D.log('ha importato', 'dati', '', 'i dati del prototipo (v1)'); return { pezzi: raw.pezzi.length, lotti: (raw.lotti || []).length }; });
  };

  D.estimate = function () { return Promise.resolve(null); };
})();

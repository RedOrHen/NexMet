/* Calcoli di magazzino e margine. Legge solo da NM.data.state. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = NM.util;
  var C = (NM.calc = {});

  C.STATI = ['Da verificare', 'Funzionante', 'Difettoso', 'Per macero (a peso)'];
  C.TIPI = ['RAM', 'Disco', 'CPU', 'Scheda madre', 'Scheda', 'Alimentatore', 'Altro'];
  C.FASI = ['Da verificare', 'Verificato', 'Cancellato', 'Certificato inviato', 'Vendibile'];
  C.SPEDIZIONI = ['Da spedire', 'Spedito', 'Consegnato', 'Ritiro in sede'];

  var cacheVer = -1, cache = null;
  function ctx() {
    var D = NM.data;
    if (cache && cacheVer === D.version) return cache;
    var s = D.state;
    var x = { sold: {}, revenue: {}, lotti: {}, lotPezzi: {}, pezzi: {}, anag: {} };
    s.lotti.forEach(function (l) { x.lotti[l.id] = l; x.lotPezzi[l.id] = []; });
    s.anagrafiche.forEach(function (a) { x.anag[a.id] = a; });
    s.pezzi.forEach(function (p) {
      x.pezzi[p.id] = p;
      if (x.lotPezzi[p.lottoId]) x.lotPezzi[p.lottoId].push(p);
    });
    s.vendite.forEach(function (v) {
      x.sold[v.pezzoId] = (x.sold[v.pezzoId] || 0) + U.n(v.quantita);
      x.revenue[v.pezzoId] = (x.revenue[v.pezzoId] || 0) + U.n(v.ricavo);
    });
    cache = x; cacheVer = D.version;
    return x;
  }
  C.ctx = ctx;
  C.pezzo = function (id) { return ctx().pezzi[id]; };
  C.lotto = function (id) { return ctx().lotti[id]; };
  C.anag = function (id) { return ctx().anag[id]; };
  C.sold = function (p) { return ctx().sold[p.id] || 0; };
  C.giacenza = function (p) { return U.n(p.quantita) - C.sold(p); };

  /* Costo per unità del pezzo: costo del lotto ripartito per quantità (predefinito)
     oppure per valore stimato (se il lotto lo chiede e tutti i pezzi hanno un prezzo). */
  C.unitCost = function (p) {
    var x = ctx(), l = x.lotti[p.lottoId];
    if (!l) return 0;
    var lp = x.lotPezzi[l.id] || [];
    if (!lp.length) return 0;
    if (l.ripartizione === 'valore') {
      var price = function (q) { return U.n(q.prezzoFinale) || U.n(q.prezzoRif); };
      if (lp.every(function (q) { return price(q) > 0; })) {
        var tot = lp.reduce(function (s, q) { return s + U.n(q.quantita) * price(q); }, 0);
        if (tot > 0) return U.n(l.costo) * price(p) / tot;
      }
    }
    var qt = lp.reduce(function (s, q) { return s + U.n(q.quantita); }, 0);
    return qt > 0 ? U.n(l.costo) / qt : 0;
  };
  C.pezzoStats = function (p) {
    var x = ctx();
    var venduti = x.sold[p.id] || 0, ricavi = x.revenue[p.id] || 0, uc = C.unitCost(p);
    var giac = U.n(p.quantita) - venduti;
    return {
      venduti: venduti, ricavi: ricavi, uc: uc, giac: giac,
      costoTotale: uc * U.n(p.quantita), costoVenduti: uc * venduti,
      margine: ricavi - uc * venduti,
      valoreGiac: giac * U.n(p.prezzoFinale),
      costoGiac: giac * uc
    };
  };
  C.lottoStats = function (l) {
    var ps = ctx().lotPezzi[l.id] || [];
    var st = { ps: ps, qtot: 0, giac: 0, ricavi: 0, costoVend: 0, potenziale: 0, costo: U.n(l.costo) };
    ps.forEach(function (p) {
      var m = C.pezzoStats(p);
      st.qtot += U.n(p.quantita); st.giac += m.giac; st.ricavi += m.ricavi;
      st.costoVend += m.costoVenduti; st.potenziale += m.valoreGiac;
    });
    st.margine = st.ricavi - st.costoVend;
    st.marginePct = st.ricavi > 0 ? st.margine / st.ricavi * 100 : null;
    st.recupero = st.costo > 0 ? st.ricavi / st.costo * 100 : null;
    st.previsto = st.ricavi + st.potenziale - st.costo; // se si vende tutto al prezzo finale
    return st;
  };
  C.totals = function () {
    var s = NM.data.state, t = { unita: 0, valore: 0, costo: 0, ricavi: 0, margine: 0, tipi: s.pezzi.length };
    s.pezzi.forEach(function (p) {
      var m = C.pezzoStats(p);
      t.unita += Math.max(m.giac, 0); t.valore += m.valoreGiac;
    });
    s.lotti.forEach(function (l) {
      var st = C.lottoStats(l);
      t.costo += st.costo; t.ricavi += st.ricavi; t.margine += st.margine;
    });
    return t;
  };

  /* Cose da sistemare: ogni voce porta al filtro corrispondente. */
  C.todo = function () {
    var s = NM.data.state, x = ctx();
    var inStock = s.pezzi.filter(function (p) { return C.giacenza(p) > 0; });
    var out = [];
    var add = function (key, label, n, params) { if (n > 0) out.push({ key: key, label: label, n: n, params: params }); };
    add('verificare', 'pezzi da verificare', inStock.filter(function (p) { return p.stato === 'Da verificare'; }).length, { stato: 'Da verificare' });
    add('posizione', 'pezzi senza posizione', inStock.filter(function (p) { return !p.posizione; }).length, { senzaPos: '1' });
    add('prezzo', 'pezzi senza prezzo finale', inStock.filter(function (p) { return p.stato !== 'Per macero (a peso)' && !U.has(p.prezzoFinale); }).length, { senzaPrezzo: '1' });
    add('dischi', 'dischi con dati da trattare', inStock.filter(function (p) { return p.datiSensibili && p.fase !== 'Vendibile'; }).length, { dati: '1' });
    add('spedizioni', 'vendite da spedire', s.vendite.filter(function (v) { return v.spedStato === 'Da spedire'; }).length, { sped: 'Da spedire', _route: 'vendite' });
    add('lotti', 'lotti senza pezzi registrati', s.lotti.filter(function (l) { return !(x.lotPezzi[l.id] || []).length; }).length, { _route: 'lotti' });
    return out;
  };

  /* Ricerca testuale su un pezzo. */
  C.haystack = function (p) {
    var l = ctx().lotti[p.lottoId];
    return U.norm([p.codice, p.nome, p.marca, p.modello, p.codiceProdotto, p.capacita, p.posizione, p.tipo, l && l.nome].join(' '));
  };
})();

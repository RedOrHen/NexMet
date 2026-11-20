/* Utilità condivise. Nessuna dipendenza. */
(function () {
  'use strict';
  var NM = (window.NM = window.NM || {});
  var U = (NM.util = {});

  var eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  var nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

  U.$ = function (s, r) { return (r || document).querySelector(s); };
  U.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.uid = function () { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); };
  U.today = function () { return new Date().toISOString().slice(0, 10); };
  U.n = function (v) { return (v === '' || v == null || isNaN(Number(v))) ? 0 : Number(v); };
  U.has = function (v) { return v !== '' && v != null && !isNaN(Number(v)); };
  U.money = function (v) { return U.has(v) ? eur.format(Number(v)) : '—'; };
  U.num = function (v) { return nf.format(U.n(v)); };
  U.pct = function (v) { return v == null || !isFinite(v) ? '—' : nf.format(v) + '%'; };
  U.sign = function (v) { return v > 0.005 ? 'pos' : (v < -0.005 ? 'neg' : ''); };
  U.fdate = function (d) { return d ? String(d).split('-').reverse().join('/') : '—'; };
  U.ftime = function (ts) { return new Date(ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); };
  U.norm = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  U.debounce = function (fn, ms) {
    var t;
    return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  };
  U.download = function (name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600);
  };

  /* CSV: delimitatore ; o , riconosciuto dalla prima riga, virgolette gestite. */
  U.csvParse = function (text) {
    text = String(text).replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var delim = (first.split(';').length >= first.split(',').length) ? ';' : ',';
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (x) { return x !== ''; })) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(function (x) { return x !== ''; })) rows.push(row);
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return U.norm(h).trim(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = (r[i] || '').trim(); });
      return o;
    });
  };
  U.csvStringify = function (rows) {
    if (!rows.length) return '';
    var keys = Object.keys(rows[0]);
    var cell = function (v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [keys.map(cell).join(';')].concat(rows.map(function (r) { return keys.map(function (k) { return cell(r[k]); }).join(';'); })).join('\r\n');
  };
})();

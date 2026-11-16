// Token Radar: a static page that reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, momentum filters, a live-token comparison and a per-protocol detail drawer. No
// network and no framework: every byte it shows is already in data.js. Farm steps come from the board
// itself, so the page and board.json cannot drift apart.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', signal: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 365) return '1y ' + Math.round(days - 365) + 'd';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMultiple(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 10 ? n.toFixed(0) : n.toFixed(2)) + 'x';
  }

  // The model in one function. It recomputes every row from the snapshot figures and the model
  // constants, so the drawer can show that the page and board.json agree on the number.
  function impliedOf(row, model) {
    var hasGrowth = row.change_7d !== null && row.change_7d !== undefined && isFinite(row.change_7d);
    var growth = hasGrowth ? Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d)) : 0;
    var weight = growth >= 0 ? model.growth_weight : model.growth_weight * model.downside_weight;
    var growthMult = Math.max(0.1, 1 + (growth / 100) * weight);
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var ratio = Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days;
    var maturity = model.maturity_floor + Math.sqrt(ratio) * model.maturity_range;
    var confidence = hasGrowth ? 1 : model.unknown_growth_discount;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * confidence));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('signal')) state.signal = params.get('signal');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.signal !== 'all') params.set('signal', state.signal);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.signal !== 'all' && r.signal !== state.signal) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.implied_multiple; bv = b.implied_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', { class: 'brand-copy' },
          el('span', { class: 'brand-name', text: 'Token Radar' }),
          el('span', { class: 'brand-tag', text: 'pre-token intelligence' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'chip live', text: 'snapshot ' + DATA.as_of }),
        el('span', { class: 'chip', text: 'DefiLlama index' }),
        el('span', { class: 'chip', text: DATA.model_version })
      )
    );
  }

  function lede() {
    var median = DATA.live_multiple_median;
    return el('section', { class: 'lede' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'the launch watch' }),
        el('h1', null, 'Find the protocols ', el('em', null, 'before'), ' the token.'),
        el('p', null,
          'Every protocol on the watchlist records ', el('b', null, 'no token'), ', and the radar adds ', el('b', null, String(DATA.early_size)),
          ' pre-token protocols below the floor. Rank is an implied launch value built only from TVL, seven-day growth and time without a token.',
          median === null ? '' : ' The live market’s median market-cap/TVL multiple is ' + fmtMultiple(median) + ', the yardstick the base multiple sits inside.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact accent' }, el('b', { text: DATA.watchlist_size + '/' + DATA.watchlist_size }), el('span', { text: 'watchlist covered' })),
        el('div', { class: 'fact' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'pre-token rows scored' })),
        el('div', { class: 'fact blue' }, el('b', { text: String(DATA.early_size) }), el('span', { text: 'early rows below floor' })),
        el('div', { class: 'fact amber' }, el('b', { text: String(DATA.live_size) }), el('span', { text: 'live tokens compared' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var signals = ['all', 'Surging', 'Warming', 'Steady', 'Cooling', 'Falling', 'Unknown'];
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search protocol, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var signal = el('select', { id: 'signal', 'aria-label': 'Filter by momentum' },
      signals.map(function (s) { return el('option', { value: s, text: s === 'all' ? 'All momentum' : s, selected: s === state.signal ? 'selected' : null }); })
    );
    signal.addEventListener('change', function () { state.signal = signal.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var shown = state.tab === 'pre-token' ? filteredRows().length : DATA.live.length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'signal', text: 'Momentum' }), signal),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: shown + (state.tab === 'pre-token' ? ' rows shown' : ' live-token protocols') })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? '↓' : '↑' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or momentum band to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.signal = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', null,
          el('div', { class: 'name' },
            el('b', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
            el('span', { class: 'signal ' + r.signal, text: r.signal })
          )
        ),
        el('td', { class: 'num dim', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('div', { class: 'name' },
            el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
            el('span', { class: 'multiple', text: fmtMultiple(r.implied_multiple) + ' of TVL' })
          )
        )),
        el('td', null, el('span', { class: 'signal', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model inputs and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d / momentum'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num rank', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMultiple(r.mcap_tvl_multiple) }),
        el('td', null, el('span', { class: 'signal', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live tokens: these protocols already trade, so their market cap is a fact, not a model. The market-cap/TVL multiple is the yardstick the pre-token base sits inside.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Mcap/TVL' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var median = DATA.live_multiple_median;
    var formula =
      'implied = round(\n' +
      '  tvl_usd x ' + m.base_multiple + '\n' +
      '  x (1 + growth/100 x ' + m.growth_weight + ')' + '   // growth ≥ 0\n' +
      '  x (1 + growth/100 x ' + m.growth_weight + ' x ' + m.downside_weight + ') // growth < 0\n' +
      '  x (' + m.maturity_floor + ' + sqrt(min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ') x ' + m.maturity_range + ')\n' +
      '  x confidence\n' +
      ')';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the implied value is built' }),
      el('p', { class: 'sub', text: 'One function scores every row from the snapshot’s own figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'model-grid' },
        el('div', { class: 'formula', text: formula }),
        el('div', { class: 'legend' },
          el('div', { class: 'legend-row' }, el('span', { text: 'Base multiple' }), el('b', { text: m.base_multiple + 'x TVL' })),
          el('div', { class: 'legend-row' }, el('span', { text: 'Growth weight / downside' }), el('b', { text: m.growth_weight + 'x / ' + m.downside_weight + 'x' })),
          el('div', { class: 'legend-row' }, el('span', { text: 'Growth clamp' }), el('b', { text: m.growth_floor + '% … +' + m.growth_cap + '%' })),
          el('div', { class: 'legend-row' }, el('span', { text: 'Maturity range' }), el('b', { text: m.maturity_floor + 'x … ' + (m.maturity_floor + m.maturity_range).toFixed(2) + 'x' })),
          el('div', { class: 'legend-row' }, el('span', { text: 'Maturity horizon' }), el('b', { text: m.maturity_days + 'd · sqrt curve' })),
          el('div', { class: 'legend-row' }, el('span', { text: 'No growth reading' }), el('b', { text: m.unknown_growth_discount + 'x confidence' })),
          el('div', { class: 'legend-row' }, el('span', { text: 'Live median mcap/TVL' }), el('b', { text: median === null ? 'n/a' : median + 'x' }))
        )
      ),
      el('p', { class: 'note', text: 'The square-root maturity curve gives a protocol’s first year without a token more weight than its fifth. A falling TVL is penalised 1.25x, and a missing seven-day reading keeps its place but loses the confidence multiplier. Implied value is an estimate, not a price.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    var steps = row.farm_steps;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-tag', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Momentum band' }), el('b', null, el('span', { class: 'signal ' + row.signal, text: row.signal }))),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: row.growth_multiplier.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: row.maturity_multiplier.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Confidence multiplier' }), el('b', { text: row.confidence_multiplier.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Implied multiple' }), el('b', { text: fmtMultiple(row.implied_multiple) + ' of TVL' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied launch value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': this page recomputes the row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', exactly the number board.json carries.' : ' — the board data is stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan · ' + steps.length + ' steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', text: 'The plan is derived from this protocol’s category, chains, TVL, age and momentum. Verify the app’s own page before depositing, and never pay a fee to claim a reward.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

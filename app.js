(() => {
  'use strict';

  const EURO = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  const pct = n => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round2 = n => Math.round(n * 100) / 100;

  const DEFAULT_STATE = {
    cash: 3420.15,
    xp: 2480,
    currentPlayer: 'ZOE',
    realAssets: {
      NVDA: { name: 'NVIDIA', price: 170.80, change: 2.18, base: 170.80, history: [163,165,164,166,168,167,169,171,170.8] },
      AAPL: { name: 'Apple', price: 226.30, change: 1.32, base: 226.30, history: [221,222,223,222.4,224,223.7,225.2,226.3] },
      MSFT: { name: 'Microsoft', price: 505.20, change: 0.84, base: 505.20, history: [499,500,501.6,501,503,502.8,504,505.2] },
      TSLA: { name: 'Tesla', price: 312.75, change: -0.74, base: 312.75, history: [318,316,317,315,313.5,314,312.7] }
    },
    friends: {
      ZOE: { name: 'Zoë', price: 142.18, change: 8.41, sentiment: 72, history: [112,118,120,126,124,130,134,137,142.18] },
      MKE: { name: 'Mike', price: 87.63, change: -2.31, sentiment: 43, history: [94,92,93,91,90,89,88.4,87.63] },
      LRS: { name: 'Lars', price: 199.41, change: 4.72, sentiment: 66, history: [182,186,184,190,189,193,195,199.41] },
      ALX: { name: 'Alex', price: 64.92, change: -6.18, sentiment: 31, history: [78,76,73,74,70,68,66,64.92] }
    },
    holdings: {
      ZOE: { shares: 30, avg: 118.20, type: 'friend' },
      AAPL: { shares: 12, avg: 219.10, type: 'real' },
      NVDA: { shares: 4, avg: 162.40, type: 'real' },
      MKE: { shares: 18, avg: 92.30, type: 'friend' },
      LRS: { shares: 7, avg: 187.50, type: 'friend' }
    },
    players: [
      { symbol: 'ZOE', name: 'Zoë', time: 183, netWorth: 15432.21, ready: true },
      { symbol: 'LRS', name: 'Lars', time: 201, netWorth: 13221.36, ready: true },
      { symbol: 'MKE', name: 'Mike', time: 244, netWorth: 9887.11, ready: true },
      { symbol: 'ALX', name: 'Alex', time: 291, netWorth: 6442.92, ready: false }
    ],
    news: [
      { category: 'BREAKING', title: 'ZOE outperforms the room', body: 'Strong reaction performance lifts confidence in the session’s most watched friend stock.', time: 'just now' },
      { category: 'MARKET', title: 'LRS extends a steady winning streak', body: 'Consistent finishes keep Lars firmly in positive territory.', time: '3 min ago' },
      { category: 'SENTIMENT', title: 'MKE investors remain cautious', body: 'Two weak rounds have put pressure on the friend-market price.', time: '7 min ago' },
      { category: 'PAPER TRADING', title: 'NVDA position moves into profit', body: 'The demo feed lifts the portfolio’s real-market allocation.', time: '11 min ago' }
    ],
    activities: [
      { title: 'ZOE +8.41%', sub: 'Reaction win moved the Friend Market' },
      { title: 'Bought 4 NVDA', sub: 'Paper order · €649.60 average' },
      { title: 'LRS +4.72%', sub: 'Strong memory round' }
    ],
    portfolioHistory: [10220,10480,10390,10740,10980,10860,11190,11070,11410,11290,11650,11520,11870,11740,12100,12020,12390,12220,12630,12510,12840.15]
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem('friendExchangeStateV1');
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_STATE), ...parsed };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  };

  let state = loadState();
  let holdingsFilter = 'all';
  let tradeContext = null;
  let tradeAction = 'buy';
  let toastTimer = null;

  const save = () => localStorage.setItem('friendExchangeStateV1', JSON.stringify(state));
  const priceOf = symbol => state.realAssets[symbol]?.price ?? state.friends[symbol]?.price ?? 0;
  const nameOf = symbol => state.realAssets[symbol]?.name ?? state.friends[symbol]?.name ?? symbol;
  const typeOf = symbol => state.realAssets[symbol] ? 'real' : 'friend';
  const changeOf = symbol => state.realAssets[symbol]?.change ?? state.friends[symbol]?.change ?? 0;
  const holdingValue = symbol => (state.holdings[symbol]?.shares || 0) * priceOf(symbol);
  const investedValue = () => Object.keys(state.holdings).reduce((sum, symbol) => sum + holdingValue(symbol), 0);
  const portfolioValue = () => state.cash + investedValue();
  const exposure = type => Object.entries(state.holdings).filter(([, h]) => h.type === type).reduce((sum, [s]) => sum + holdingValue(s), 0);

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2500);
  }

  function sparkline(points, negative = false) {
    const vals = points.slice(-10);
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    const coords = vals.map((v, i) => `${(i/(vals.length-1))*100},${30 - ((v-min)/range)*25}`).join(' ');
    return `<div class="sparkline"><svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${coords}" style="stroke:${negative ? 'var(--red)' : 'var(--green)'}"></polyline></svg></div>`;
  }

  function chartPath(values, width = 760, height = 210, padX = 35, padY = 18) {
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const usableW = width - padX * 2, usableH = height - padY * 2;
    const pts = values.map((v, i) => ({ x: padX + (i / (values.length - 1)) * usableW, y: padY + (1 - (v - min) / range) * usableH }));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return { d, area: `${d} L${pts.at(-1).x.toFixed(1)},220 L${pts[0].x.toFixed(1)},220 Z`, last: pts.at(-1) };
  }

  function renderChart() {
    const { d, area, last } = chartPath(state.portfolioHistory);
    document.getElementById('portfolioLine').setAttribute('d', d);
    document.getElementById('portfolioArea').setAttribute('d', area);
    document.getElementById('portfolioPoint').setAttribute('cx', last.x);
    document.getElementById('portfolioPoint').setAttribute('cy', last.y);
  }

  function holdingsRows(filter = 'all', full = false) {
    return Object.entries(state.holdings)
      .filter(([, h]) => filter === 'all' || h.type === filter)
      .map(([symbol, h]) => {
        const price = priceOf(symbol), value = h.shares * price, change = changeOf(symbol), pl = value - h.shares * h.avg;
        return `<tr data-trade-symbol="${symbol}">
          <td><div class="asset-name"><span class="asset-icon">${symbol[0]}</span><span class="asset-title"><strong>${symbol}</strong><small>${nameOf(symbol)}</small></span></div></td>
          <td><span class="type-chip">${h.type === 'real' ? 'Real' : 'Friend'}</span></td><td>${h.shares.toFixed(h.shares % 1 ? 2 : 0)}</td>
          ${full ? `<td>${EURO.format(h.avg)}</td>` : ''}<td>${EURO.format(price)}</td><td>${EURO.format(value)}</td>
          <td class="${full ? (pl >= 0 ? 'positive' : 'negative') : (change >= 0 ? 'positive' : 'negative')}">${full ? EURO.format(pl) : pct(change)}</td></tr>`;
      }).join('');
  }

  function renderHoldings() {
    document.getElementById('overviewHoldings').innerHTML = holdingsRows(holdingsFilter, false) || `<tr><td colspan="6">No positions in this segment.</td></tr>`;
    document.getElementById('portfolioHoldings').innerHTML = holdingsRows('all', true);
    document.querySelectorAll('[data-trade-symbol]').forEach(row => row.addEventListener('click', () => openTrade(row.dataset.tradeSymbol)));
  }

  function renderAssets() {
    document.getElementById('realAssetGrid').innerHTML = Object.entries(state.realAssets).map(([symbol, a]) => `
      <article class="asset-card ${a.change < 0 ? 'is-negative' : ''}" data-trade-card="${symbol}">
        <div class="asset-card-top"><div><h4>${symbol}</h4><small>${a.name}</small></div><span class="type-chip">Paper</span></div>
        <div class="asset-price">${EURO.format(a.price)}</div><div class="asset-change ${a.change >= 0 ? 'positive' : 'negative'}">${pct(a.change)}</div>
        <div class="asset-mini-chart">${sparkline(a.history, a.change < 0)}</div></article>`).join('');

    document.getElementById('friendStockList').innerHTML = Object.entries(state.friends).map(([symbol, f]) => `
      <article class="friend-stock-row ${f.change < 0 ? 'is-negative' : ''}" data-trade-card="${symbol}">
        <span class="avatar">${symbol[0]}</span><div class="friend-stock-info"><strong>${symbol} · ${f.name}</strong><span>Sentiment ${f.sentiment}%</span></div>
        <div class="friend-stock-price"><strong>${EURO.format(f.price)}</strong><span class="${f.change >= 0 ? 'positive' : 'negative'}">${pct(f.change)}</span></div>
        <div class="friend-row-spark">${sparkline(f.history, f.change < 0)}</div></article>`).join('');
    document.querySelectorAll('[data-trade-card]').forEach(card => card.addEventListener('click', () => openTrade(card.dataset.tradeCard)));
  }

  function renderImpact() {
    document.getElementById('impactList').innerHTML = Object.entries(state.friends).map(([symbol, f]) => `
      <div class="impact-row ${f.change < 0 ? 'is-negative' : ''}"><strong>${symbol}</strong><span class="${f.change >= 0 ? 'positive' : 'negative'}">${pct(f.change)}</span>${sparkline(f.history, f.change < 0)}</div>`).join('');
    const entries = Object.entries(state.friends).sort((a,b) => b[1].change - a[1].change);
    document.getElementById('bestFriendSymbol').textContent = entries[0][0];
    document.getElementById('bestFriendMove').textContent = pct(entries[0][1].change);
    document.getElementById('worstFriendSymbol').textContent = entries.at(-1)[0];
    document.getElementById('worstFriendMove').textContent = pct(entries.at(-1)[1].change);
  }

  function renderPlayers() {
    const sorted = [...state.players].sort((a,b) => a.time - b.time);
    document.getElementById('miniRanking').innerHTML = sorted.map((p, i) => `<div class="rank-row"><span class="rank-index">${i+1}</span><span class="rank-avatar">${p.symbol[0]}</span><strong>${p.name}</strong><span class="rank-time">${p.time} ms</span></div>`).join('');
    document.getElementById('playerStack').innerHTML = state.players.map(p => `<div class="player-row"><span class="avatar">${p.symbol[0]}</span><div><strong>${p.name}</strong><small> ${p.symbol}</small></div><span class="ready-dot" style="opacity:${p.ready ? 1 : .24}"></span></div>`).join('');
    document.getElementById('onlineCount').textContent = `${state.players.length} players online`;
  }

  function renderPortfolio() {
    const total = portfolioValue(), invested = investedValue(), baseline = state.portfolioHistory[0], delta = total - baseline, deltaPct = baseline ? delta / baseline * 100 : 0;
    state.portfolioHistory[state.portfolioHistory.length - 1] = round2(total);
    ['portfolioValue','portfolioPageValue'].forEach(id => document.getElementById(id).textContent = EURO.format(total));
    document.getElementById('portfolioDelta').textContent = `${delta >= 0 ? '+' : '−'}${EURO.format(Math.abs(delta))} · ${pct(deltaPct)}`;
    document.getElementById('portfolioDelta').className = delta >= 0 ? 'positive' : 'negative';
    document.getElementById('portfolioPageDelta').textContent = `${pct(deltaPct)} this session`;
    document.getElementById('portfolioPageDelta').className = delta >= 0 ? 'positive' : 'negative';
    ['headerCash','overviewCash','portfolioCash'].forEach(id => document.getElementById(id).textContent = EURO.format(state.cash));
    document.getElementById('overviewInvested').textContent = EURO.format(invested);
    const real = exposure('real'), friend = exposure('friend');
    document.getElementById('realExposure').textContent = `${total ? Math.round(real/total*100) : 0}%`;
    document.getElementById('friendExposure').textContent = `${total ? Math.round(friend/total*100) : 0}%`;
    document.getElementById('allocationDonut').style.background = `conic-gradient(var(--green) 0 ${real/total*100}%, var(--warm) ${real/total*100}% ${(real+friend)/total*100}%, rgba(169,197,209,.7) ${(real+friend)/total*100}% 100%)`;
    document.getElementById('allocationLegend').innerHTML = [['Real market','var(--green)',real],['Friend market','var(--warm)',friend],['Cash','var(--blue)',state.cash]].map(([label,color,val]) => `<div><i style="background:${color}"></i><span>${label}</span><strong>${Math.round(val/total*100)}%</strong></div>`).join('');
    document.getElementById('highlightNetWorth').textContent = EURO.format(Math.max(total,15432.21));
    document.getElementById('xpCount').textContent = state.xp.toLocaleString('en-GB');
    renderChart();
  }

  function renderNews() {
    const lead = state.news[0];
    document.getElementById('leadHeadline').textContent = lead.title.toUpperCase();
    document.getElementById('leadSummary').textContent = lead.body;
    document.getElementById('newsStack').innerHTML = state.news.slice(1,5).map(n => `<article class="news-card glass glass--light"><span class="news-category">${n.category}</span><h3>${n.title}</h3><p>${n.body}</p><time>${n.time}</time></article>`).join('');
    document.getElementById('activityList').innerHTML = state.activities.slice(0,4).map(a => `<div class="activity-item"><strong>${a.title}</strong><span>${a.sub}</span></div>`).join('');
  }

  function renderLeaderboards() {
    const investorRows = [...state.players].sort((a,b)=>b.netWorth-a.netWorth).map((p,i)=>`<div class="leaderboard-row"><span class="leaderboard-rank">${i+1}</span><span class="avatar">${p.symbol[0]}</span><div class="leaderboard-info"><strong>${p.name}</strong><span>${p.symbol} investor</span></div><div class="leaderboard-value"><strong>${EURO.format(p.netWorth)}</strong><span>${i===0?'session leader':'paper net worth'}</span></div></div>`).join('');
    document.getElementById('investorLeaderboard').innerHTML = `<div class="leaderboard-list">${investorRows}</div>`;
    const companyRows = Object.entries(state.friends).sort((a,b)=>b[1].price-a[1].price).map(([symbol,f],i)=>`<div class="leaderboard-row"><span class="leaderboard-rank">${i+1}</span><span class="avatar">${symbol[0]}</span><div class="leaderboard-info"><strong>${f.name}</strong><span>${symbol} · sentiment ${f.sentiment}%</span></div><div class="leaderboard-value"><strong>${EURO.format(f.price)}</strong><span class="${f.change>=0?'positive':'negative'}">${pct(f.change)}</span></div></div>`).join('');
    document.getElementById('companyLeaderboard').innerHTML = `<div class="leaderboard-list">${companyRows}</div>`;
  }

  function renderTicker() {
    const assets = [...Object.entries(state.realAssets), ...Object.entries(state.friends)];
    document.getElementById('tickerTrack').innerHTML = assets.map(([symbol,a]) => `<span class="ticker-item"><strong>${symbol}</strong><span>${EURO.format(a.price)}</span><span class="${a.change>=0?'positive':'negative'}">${pct(a.change)}</span></span>`).join('');
  }

  function renderAll() { renderPortfolio(); renderHoldings(); renderAssets(); renderImpact(); renderPlayers(); renderNews(); renderLeaderboards(); renderTicker(); }

  function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === view));
    document.querySelectorAll('[data-view-target]').forEach(b => b.classList.toggle('is-active', b.dataset.viewTarget === view && (b.classList.contains('nav-link') || b.classList.contains('side-link'))));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null,'',`#${view}`);
  }
  document.querySelectorAll('[data-view-target]').forEach(el => el.addEventListener('click', () => switchView(el.dataset.viewTarget)));

  document.querySelectorAll('[data-chart-tabs] button').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-chart-tabs] button').forEach(b => b.classList.remove('is-active')); btn.classList.add('is-active'); showToast(`${btn.textContent} chart range selected`);
  }));
  document.querySelectorAll('[data-holdings-filter] button').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-holdings-filter] button').forEach(b=>b.classList.remove('is-active')); btn.classList.add('is-active'); holdingsFilter=btn.dataset.filter; renderHoldings();
  }));

  function openTrade(symbol) {
    const asset = state.realAssets[symbol] || state.friends[symbol]; if (!asset) return;
    tradeContext = { symbol, type: typeOf(symbol) }; tradeAction = 'buy';
    document.getElementById('tradeTypeLabel').textContent = tradeContext.type === 'real' ? 'REAL MARKET · PAPER TRADE' : 'FRIEND MARKET';
    document.getElementById('tradeSymbol').textContent = symbol; document.getElementById('tradeName').textContent = asset.name;
    document.getElementById('tradePrice').textContent = EURO.format(asset.price); const ch=document.getElementById('tradeChange'); ch.textContent=pct(asset.change); ch.className=asset.change>=0?'positive':'negative';
    document.querySelectorAll('[data-action]').forEach(b=>b.classList.toggle('is-active',b.dataset.action==='buy'));
    const vals = asset.history.slice(-10), min=Math.min(...vals), max=Math.max(...vals), range=max-min||1; const coords=vals.map((v,i)=>`${i/(vals.length-1)*100},${50-(v-min)/range*42}`).join(' ');
    document.getElementById('tradeSpark').innerHTML=`<svg viewBox="0 0 100 55" preserveAspectRatio="none"><polyline points="${coords}" style="stroke:${asset.change>=0?'var(--green)':'var(--red)'}"></polyline></svg>`;
    updateTradePreview(); document.getElementById('tradeModal').showModal();
  }

  function updateTradePreview() {
    if (!tradeContext) return; const amount=Math.max(0,Number(document.getElementById('tradeAmount').value)||0); const price=priceOf(tradeContext.symbol); const shares=amount/price;
    document.getElementById('tradeSharesPreview').textContent=shares.toFixed(3);
    const after=tradeAction==='buy'?state.cash-amount:state.cash+Math.min(amount,holdingValue(tradeContext.symbol)); document.getElementById('tradeCashPreview').textContent=EURO.format(after);
  }
  document.getElementById('tradeAmount').addEventListener('input',updateTradePreview);
  document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{tradeAction=btn.dataset.action;document.querySelectorAll('[data-action]').forEach(b=>b.classList.toggle('is-active',b===btn));updateTradePreview()}));
  document.getElementById('confirmTrade').addEventListener('click',()=>{
    if(!tradeContext)return; const amount=Math.max(0,Number(document.getElementById('tradeAmount').value)||0); if(amount<=0)return showToast('Enter an order amount.'); const symbol=tradeContext.symbol, price=priceOf(symbol);
    if(tradeAction==='buy'){
      if(amount>state.cash+0.001)return showToast('Not enough paper cash.'); const shares=amount/price; const old=state.holdings[symbol]||{shares:0,avg:price,type:typeOf(symbol)}; const newShares=old.shares+shares; old.avg=((old.avg*old.shares)+(price*shares))/newShares; old.shares=newShares; state.holdings[symbol]=old; state.cash-=amount; addActivity(`Bought ${shares.toFixed(2)} ${symbol}`,`Paper order · ${EURO.format(amount)}`);
    } else {
      const h=state.holdings[symbol]; if(!h||h.shares<=0)return showToast(`You do not hold ${symbol}.`); const sharesToSell=Math.min(h.shares,amount/price); const proceeds=sharesToSell*price; h.shares-=sharesToSell; state.cash+=proceeds; if(h.shares<.0001)delete state.holdings[symbol]; addActivity(`Sold ${sharesToSell.toFixed(2)} ${symbol}`,`Paper order · ${EURO.format(proceeds)}`);
    }
    save(); renderAll(); document.getElementById('tradeModal').close(); showToast(`${tradeAction==='buy'?'Buy':'Sell'} order filled in paper mode.`);
  });

  document.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',()=>document.getElementById('tradeModal').close()));
  document.querySelectorAll('[data-close-game]').forEach(el=>el.addEventListener('click',()=>document.getElementById('gameModal').close()));
  function addActivity(title,sub){state.activities.unshift({title,sub});state.activities=state.activities.slice(0,12)}
  function addNews(category,title,body){state.news.unshift({category,title,body,time:'just now'});state.news=state.news.slice(0,12)}

  function applyFriendMove(symbol, move, reason) {
    const f=state.friends[symbol], old=f.price; f.price=round2(Math.max(4,old*(1+move/100))); f.change=round2(move); f.sentiment=Math.round(clamp(f.sentiment+move*1.4,5,95)); f.history.push(f.price); if(f.history.length>18)f.history.shift(); addActivity(`${symbol} ${pct(move)}`,reason);
  }

  function finishRound(kind, score) {
    const player = state.players.find(p=>p.symbol===state.currentPlayer); let quality;
    if(kind==='reaction'){quality=clamp((360-score)/190,0,1);player.time=Math.round(score)}
    else if(kind==='timer'){quality=clamp(1-Math.abs(score-5)/2.5,0,1)}
    else if(kind==='memory'){quality=clamp(score/6,0,1)}
    else if(kind==='estimate'){quality=clamp(1-score,0,1)}
    else quality=clamp(score,0,1);
    const move=round2(-4+quality*13); applyFriendMove(state.currentPlayer,move,`${kind} round performance`); state.xp+=Math.round(80+quality*170);
    player.netWorth=round2(player.netWorth*(1+move/200));
    state.players.filter(p=>p.symbol!==state.currentPlayer).forEach(p=>{const q=Math.random()*.78+.12,mv=round2(-5+q*10);applyFriendMove(p.symbol,mv,'simulated local opponent result');p.netWorth=round2(p.netWorth*(1+mv/250));if(kind==='reaction')p.time=Math.round(185+Math.random()*160)});
    addNews('ROUND RESULT',`${state.currentPlayer} ${move>=0?'beats':'misses'} expectations`,`${quality>.78?'Excellent':quality>.55?'Solid':quality>.35?'Mixed':'Weak'} ${kind} performance. Friend Market reprices ${state.currentPlayer} by ${pct(move)}.`);
    state.portfolioHistory.push(round2(portfolioValue())); if(state.portfolioHistory.length>28)state.portfolioHistory.shift(); save(); renderAll(); return {quality,move};
  }

  const gameDefinitions={reaction:{title:'REACTION TEST',eyebrow:'REFLEX ROUND'},timer:{title:'STOP THE CLOCK',eyebrow:'PRECISION ROUND'},memory:{title:'MEMORY GRID',eyebrow:'MEMORY ROUND'},estimate:{title:'CLOSEST WINS',eyebrow:'ESTIMATION ROUND'},higher:{title:'HIGHER / LOWER',eyebrow:'MARKET IQ ROUND'}};
  document.querySelectorAll('[data-open-game]').forEach(btn=>btn.addEventListener('click',()=>openGame(btn.dataset.openGame)));

  function openGame(type){const def=gameDefinitions[type];if(!def)return;const modal=document.getElementById('gameModal');document.getElementById('gameTitle').textContent=def.title;document.getElementById('gameEyebrow').textContent=def.eyebrow;document.getElementById('gameStockPrice').textContent=`ZOE · ${EURO.format(state.friends.ZOE.price)}`;document.getElementById('gameResults').hidden=true;modal.showModal();startGame(type)}
  function showRoundResults(label,value,result){const box=document.getElementById('gameResults');box.hidden=false;const sorted=[...state.players].sort((a,b)=>a.time-b.time);box.innerHTML=`<div class="results-title">ROUND RESULT · ${label}</div><div class="market-result-strip"><span class="market-result-chip">Your result <strong>${value}</strong></span><span class="market-result-chip">ZOE move <strong class="${result.move>=0?'positive':'negative'}">${pct(result.move)}</strong></span><span class="market-result-chip">XP <strong>+${Math.round(80+result.quality*170)}</strong></span></div><table class="results-table">${sorted.map((p,i)=>`<tr><td>${i+1}</td><td>${p.name}</td><td>${label==='REACTION'?`${p.time} ms`:'round complete'}</td><td class="${state.friends[p.symbol].change>=0?'positive':'negative'}">${pct(state.friends[p.symbol].change)}</td></tr>`).join('')}</table>`}
  function startGame(type){const stage=document.getElementById('gameStage');if(type==='reaction')reactionGame(stage);if(type==='timer')timerGame(stage);if(type==='memory')memoryGame(stage);if(type==='estimate')estimateGame(stage);if(type==='higher')higherGame(stage)}

  function reactionGame(stage){let armed=false,start=0,timer=null;stage.innerHTML=`<div class="game-core"><p>Wait. Do not click early.</p><div class="reaction-pad" id="reactionPad"><div><div class="huge">WAIT</div><p>The panel will turn warm green.</p></div></div></div>`;const pad=document.getElementById('reactionPad');timer=setTimeout(()=>{armed=true;start=performance.now();pad.classList.add('ready');pad.querySelector('.huge').textContent='NOW'},1400+Math.random()*2600);pad.addEventListener('click',()=>{if(!armed){clearTimeout(timer);pad.classList.add('too-early');pad.querySelector('.huge').textContent='TOO EARLY';setTimeout(()=>reactionGame(stage),1000);return}const ms=performance.now()-start;pad.querySelector('.huge').textContent=`${Math.round(ms)} MS`;armed=false;const result=finishRound('reaction',ms);showRoundResults('REACTION',`${Math.round(ms)} ms`,result)},{once:true})}
  function timerGame(stage){let running=false,start=0,raf;stage.innerHTML=`<div class="game-core"><p>Stop the clock as close as possible to exactly 5.000 seconds.</p><div class="huge" id="stopClock">0.000</div><button class="stop-button" id="stopButton">START</button></div>`;const clock=document.getElementById('stopClock'),button=document.getElementById('stopButton');const tick=()=>{clock.textContent=((performance.now()-start)/1000).toFixed(3);raf=requestAnimationFrame(tick)};button.onclick=()=>{if(!running){running=true;start=performance.now();button.textContent='STOP';tick()}else{cancelAnimationFrame(raf);const sec=(performance.now()-start)/1000;clock.textContent=sec.toFixed(3);button.disabled=true;const result=finishRound('timer',sec);showRoundResults('PRECISION',`${sec.toFixed(3)} s`,result)}}}
  function memoryGame(stage){const sequence=[...Array(16).keys()].sort(()=>Math.random()-.5).slice(0,6);let picks=[];stage.innerHTML=`<div class="game-core"><p>Memorize the highlighted tiles.</p><div class="memory-grid">${Array.from({length:16},(_,i)=>`<button class="memory-cell" data-cell="${i}"></button>`).join('')}</div></div>`;const cells=[...stage.querySelectorAll('.memory-cell')];sequence.forEach(i=>cells[i].classList.add('lit'));setTimeout(()=>{cells.forEach(c=>c.classList.remove('lit'));cells.forEach(c=>c.onclick=()=>{const i=Number(c.dataset.cell);if(picks.includes(i))return;picks.push(i);c.style.background=sequence.includes(i)?'rgba(166,210,148,.45)':'rgba(232,134,120,.35)';if(picks.length===sequence.length){const score=picks.filter(i=>sequence.includes(i)).length;const result=finishRound('memory',score);showRoundResults('MEMORY',`${score}/6 correct`,result)}})},1800)}
  function estimateGame(stage){const qs=[{q:'How many kilometres of blood vessels are in an adult human body?',a:100000,u:'km'},{q:'How many keys are on a standard full-size PC keyboard?',a:104,u:'keys'},{q:'How many minutes are in one week?',a:10080,u:'minutes'}];const item=qs[Math.floor(Math.random()*qs.length)];stage.innerHTML=`<div class="game-core"><p>${item.q}</p><input class="estimate-input" id="estimateValue" type="number" placeholder="Your estimate"/><div class="choice-row"><button id="submitEstimate">LOCK ANSWER</button></div></div>`;document.getElementById('submitEstimate').onclick=()=>{const guess=Number(document.getElementById('estimateValue').value);if(!Number.isFinite(guess)||guess<=0)return showToast('Enter an estimate.');const error=Math.abs(guess-item.a)/item.a;const result=finishRound('estimate',Math.min(1,error));showRoundResults('ESTIMATE',`${guess.toLocaleString()} ${item.u} · ${(error*100).toFixed(1)}% error`,result)}}
  function higherGame(stage){const a=Math.floor(20+Math.random()*80),b=Math.floor(20+Math.random()*80);stage.innerHTML=`<div class="game-core"><p>Will the hidden number be higher or lower than:</p><div class="huge">${a}</div><div class="choice-row"><button data-choice="higher">HIGHER</button><button data-choice="lower">LOWER</button></div></div>`;stage.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{const correct=(b>a&&btn.dataset.choice==='higher')||(b<a&&btn.dataset.choice==='lower');stage.querySelector('.huge').textContent=b;const result=finishRound('higher',correct?1:0);showRoundResults('HIGHER / LOWER',correct?'Correct':'Wrong',result)})}

  function randomWalk(){Object.values(state.realAssets).forEach(a=>{const step=(Math.random()-.48)*.006;a.price=round2(Math.max(1,a.price*(1+step)));a.change=round2((a.price/a.base-1)*100);a.history.push(a.price);if(a.history.length>18)a.history.shift()});save();renderAssets();renderTicker();renderHoldings();renderPortfolio()}
  setInterval(randomWalk,5000);

  let marketSeconds=1*3600+27*60+58,nextSeconds=42,roundSeconds=18;
  setInterval(()=>{marketSeconds=marketSeconds<=0?2*3600:marketSeconds-1;nextSeconds=nextSeconds<=0?60:nextSeconds-1;roundSeconds=roundSeconds<=0?18:roundSeconds-1;const fmt=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;document.getElementById('marketCountdown').textContent=fmt(marketSeconds);document.getElementById('nextRoundCountdown').textContent=`${String(Math.floor(nextSeconds/60)).padStart(2,'0')}:${String(nextSeconds%60).padStart(2,'0')}`;document.getElementById('roundTimer').textContent=`00:${String(roundSeconds).padStart(2,'0')}`},1000);

  document.getElementById('copyRoom').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('KELDER-42');showToast('Room code copied.')}catch{showToast('Room code: KELDER-42')}});
  document.getElementById('resetPortfolio').addEventListener('click',()=>{if(confirm('Reset local paper portfolio and session data?')){state=structuredClone(DEFAULT_STATE);save();renderAll();showToast('Local demo reset.')}});
  document.getElementById('resetDemoPrices').addEventListener('click',()=>{state.realAssets=structuredClone(DEFAULT_STATE.realAssets);save();renderAll();showToast('Demo market prices reset.')} );
  document.getElementById('profileButton').addEventListener('click',()=>showToast('Profile/auth will move to Supabase when multiplayer is enabled.'));
  document.getElementById('soundToggle').addEventListener('click',()=>showToast('Ambient audio is intentionally disabled in this prototype.'));

  const initialHash=location.hash.replace('#',''); if(document.querySelector(`[data-view="${initialHash}"]`)) switchView(initialHash);
  renderAll();
})();

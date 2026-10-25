/* =====================================================================
   SẢNH GAME BÀI MULTIPLAYER — CLIENT
   Tiến Lên 13 · Tiến Lên 6 · Sâm Lốc · Liêng · Xì Dách
   REST + SSE, ghép bàn theo sảnh & mức cược
   ===================================================================== */

const CR_RANK_TXT = {3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2'};
const CR_SUIT_TXT = ['♠','♣','♦','♥'];       /* 0 Bích · 1 Chuồn · 2 Rô · 3 Cơ */
const CR_SUIT_FILE = ['S','C','D','H'];

function crFmt(n){ return (Number(n)||0).toLocaleString('vi-VN'); }
function crFile(c){ return 'assets/cards/' + (CR_RANK_TXT[c>>2] || '') + (CR_SUIT_FILE[c&3] || 'S') + '.png?v=2'; }
function crName(c){ return (CR_RANK_TXT[c>>2] || '?') + (CR_SUIT_TXT[c&3] || ''); }
function crEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* Dừng AUTO Tài Xỉu khi vào sảnh bài để không đặt cược/âm thanh chạy nền */
function crStopTxAuto(){
  if(typeof auto !== 'undefined' && auto.active) auto.active = false;
}

/* Nạp trước 52 lá để chia bài hiện ảnh ngay, không bị khung trống */
let _crPreloaded = false;
let _crImages = [];
function crPreload(){
  if(_crPreloaded) return;
  _crPreloaded = true;
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['S','C','D','H'];
  for(const s of suits) for(const r of ranks){
    const im = new Image();
    im.src = 'assets/cards/' + r + s + '.png?v=2';
    if(im.decode) im.decode().catch(()=>{});
    _crImages.push(im);   /* giữ tham chiếu để ảnh đã decode luôn sẵn trong cache */
  }
}

function crCardEl(c, cls, pick){
  const el = document.createElement('div');
  el.className = 'cr-card' + (cls ? ' ' + cls : '') + (pick ? ' pick' : '');
  const img = document.createElement('img');
  img.src = crFile(c);
  img.alt = crName(c);
  img.draggable = false;
  img.decoding = 'sync';   /* hiện ảnh ngay, tránh khung trống khi chia bài */
  el.appendChild(img);
  el.dataset.card = c;
  return el;
}
function crBackEl(cls){
  const el = document.createElement('div');
  el.className = 'cr-card back' + (cls ? ' ' + cls : '');
  return el;
}
function crLiengName(cards){
  if(!cards || cards.length !== 3) return '—';
  const rs = cards.map(c=>c>>2).sort((a,b)=>a-b);
  const hi = Math.max(...cards);
  if(rs[0]===rs[1] && rs[1]===rs[2]) return 'SÁP';
  const set = rs.join(',');
  const straight = (rs[1]===rs[0]+1 && rs[2]===rs[1]+1) || set==='3,14,15' || set==='12,13,14';
  if(straight) return 'LIÊNG';
  if(rs[0]===11 && rs[1]===12 && rs[2]===13) return 'ẢNH';
  const pts = rs.reduce((s,r)=> s + (r===14?1 : r===15?2 : r>=11?10 : r), 0) % 10;
  return pts + ' ĐIỂM';
}
function crXdScore(cards){
  let total = 0, aces = 0;
  for(const c of cards || []){
    const r = c>>2;
    if(r===14) aces++;
    else if(r===15) total += 2;
    else if(r>=11) total += 10;
    else total += r;
  }
  let best = total + aces;
  if(aces && total + 10 + (aces-1) <= 21) best = total + 10 + (aces-1);
  return best;
}

/* =====================================================================
   NHẬN DIỆN BỘ BÀI TIẾN LÊN / SÂM LỐC
   Đôi · Sám cô · Tứ quý · Sảnh · Ba đôi thông · Bốn đôi thông
   ===================================================================== */
function crConsecutive(ranks){
  for(let i=1; i<ranks.length; i++) if(ranks[i] !== ranks[i-1] + 1) return false;
  return true;
}
function crEvalTL(cards){
  const n = (cards || []).length;
  if(!n) return null;
  const sorted = [...cards].sort((a,b)=>a-b);
  const ranks = sorted.map(c=>c>>2);
  const high = sorted[n-1];
  const counts = new Map();
  ranks.forEach(r => counts.set(r, (counts.get(r) || 0) + 1));
  const groups = [...counts.keys()].sort((a,b)=>a-b);

  if(n===1) return { t:'single', len:1, high, name:'LÁ LẺ' };
  if(n===2 && groups.length===1) return { t:'pair', len:2, high, name:'ĐÔI' };
  if(n===3 && groups.length===1) return { t:'triple', len:3, high, name:'SÁM CÔ' };
  if(n===4 && groups.length===1) return { t:'four', len:4, high, name:'TỨ QUÝ' };
  if(n===6 && groups.length===3 && groups.every(r=>counts.get(r)>=2) && crConsecutive(groups))
    return { t:'pairs3', len:6, high, name:'BA ĐÔI THÔNG' };
  if(n===8 && groups.length===4 && groups.every(r=>counts.get(r)>=2) && crConsecutive(groups))
    return { t:'pairs4', len:8, high, name:'BỐN ĐÔI THÔNG' };
  if(n>=3 && groups.length===n && !groups.includes(15) && crConsecutive(groups))
    return { t:'straight', len:n, high, name:'SẢNH' };
  return null;
}
function crBeatsTL(a, b){
  if(!b) return true;
  if(!a) return false;
  const isTwo = c => c != null && (c>>2) === 15;
  if(a.t==='four' && b.t==='single' && isTwo(b.high)) return true;
  if(a.t==='four' && b.t==='pair' && isTwo(b.high)) return true;
  if(a.t==='four' && b.t==='pairs3') return true;
  if(a.t==='four' && b.t==='four') return a.high > b.high;
  if(a.t==='pairs3' && b.t==='single' && isTwo(b.high)) return true;
  if(a.t==='pairs3' && b.t==='pairs3') return a.high > b.high;
  if(a.t==='pairs4' && (b.t==='single' || b.t==='pair') && isTwo(b.high)) return true;
  if(a.t==='pairs4' && (b.t==='pairs3' || b.t==='four')) return true;
  if(a.t==='pairs4' && b.t==='pairs4') return a.high > b.high;
  return a.t===b.t && a.len===b.len && a.high > b.high;
}
function crComboLabel(combo, cards){
  if(!combo) return '';
  const cs = cards || combo.cards || [];
  const rs = [...new Set(cs.map(c=>c>>2))].sort((a,b)=>a-b);
  const rt = r => CR_RANK_TXT[r] || '?';
  if(!rs.length) return combo.name;
  if(combo.t==='straight' || combo.t==='pairs3' || combo.t==='pairs4')
    return combo.name + ' ' + rt(rs[0]) + '–' + rt(rs[rs.length-1]);
  return combo.name + ' ' + rt(combo.high>>2);
}
/* Tìm mọi bộ có thể đánh từ bài trên tay. last = eval của bài trên bàn */
function crFindCombos(hand, last){
  const by = new Map();
  [...(hand || [])].sort((a,b)=>a-b).forEach(c=>{
    const r = c>>2;
    if(!by.has(r)) by.set(r, []);
    by.get(r).push(c);
  });
  const ranks = [...by.keys()].sort((a,b)=>a-b);
  const out = [];
  const add = cards => {
    const ev = crEvalTL(cards);
    if(ev) out.push({ ...ev, cards });
  };

  ranks.forEach(r => { if(by.get(r).length>=2) add(by.get(r).slice(0,2)); });
  ranks.forEach(r => { if(by.get(r).length>=3) add(by.get(r).slice(0,3)); });
  ranks.forEach(r => { if(by.get(r).length===4) add(by.get(r).slice(0,4)); });

  for(let i=0; i+2<ranks.length; i++){
    const w = ranks.slice(i, i+3);
    if(w[2]===w[0]+2 && w.every(r=>by.get(r).length>=2))
      add(w.flatMap(r=>by.get(r).slice(0,2)));
  }
  for(let i=0; i+3<ranks.length; i++){
    const w = ranks.slice(i, i+4);
    if(w[3]===w[0]+3 && w.every(r=>by.get(r).length>=2))
      add(w.flatMap(r=>by.get(r).slice(0,2)));
  }

  const sr = ranks.filter(r=>r!==15);
  const runs = [];
  let run = [];
  sr.forEach((r, i) => {
    if(i===0 || r===sr[i-1]+1) run.push(r);
    else { if(run.length) runs.push(run); run = [r]; }
  });
  if(run.length) runs.push(run);
  runs.forEach(r => {
    for(let len=r.length; len>=3; len--)
      for(let i=0; i+len<=r.length; i++)
        add(r.slice(i, i+len).map(x=>by.get(x)[0]));
  });

  ranks.forEach(r => add([by.get(r)[0]]));

  const order = { pairs4:0, pairs3:1, four:2, straight:3, triple:4, pair:5, single:6 };
  if(last){
    return out.filter(c => crBeatsTL(c, last))
      .sort((a,b) => (a.high-b.high) || (a.cards.length-b.cards.length));
  }
  return out.sort((a,b) =>
    (order[a.t]-order[b.t]) || (b.cards.length-a.cards.length) || (b.high-a.high));
}

/* Tách sảnh bài ra khỏi #stage 1600×900 để giao diện dùng đúng kích thước
   màn hình thật (không bị scale nhỏ / letterbox trên điện thoại & laptop). */
(function crDetachScreens(){
  ['cardsHub','cardsRoom'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.parentElement && el.parentElement.id === 'stage') document.body.appendChild(el);
  });
})();

const CardsUI = {
  active:false,
  inRoom:false,
  halls:[],
  hallId:'tienlen13',
  stake:50000,
  room:null,
  es:null,
  busy:false,
  selected:new Set(),
  handDesc:false,
  _pendingHall:null,
  _resultShown:false,
  _lastPhase:'',
  _lastTurn:-1,
  _hubTimer:null,
  _clock:null,
  _stateAt:0,
  _turnLeft:0,

  token(){ return (typeof Net !== 'undefined' && Net.token) || localStorage.getItem('tx_token') || ''; },
  $(id){ return document.getElementById(id); },
  myName(){
    try{ if(typeof Auth !== 'undefined' && Auth.user) return Auth.user.name || 'Khách'; }catch(e){}
    return 'Khách';
  },
  hall(id){ return this.halls.find(h => h.id === id) || null; },

  /* ---------------- HUB ---------------- */
  openHub(hallId){
    if(hallId) this.hallId = hallId;
    if(!this.token()){
      this._pendingHall = hallId || this.hallId;
      if(typeof toast === 'function') toast('Đăng nhập hoặc bấm CHƠI THỬ để vào sảnh bài multiplayer!');
      if(typeof openAuth === 'function') openAuth();
      return;
    }
    this.active = true;
    this.inRoom = false;
    this.room = null;
    this._resultShown = false;
    document.body.classList.add('cards-active');
    crStopTxAuto();
    crPreload();
    const hub = this.$('cardsHub');
    const room = this.$('cardsRoom');
    if(room) room.classList.remove('open');
    if(hub) hub.classList.add('open');
    if(typeof closeHome === 'function') closeHome();
    if(typeof closeModal === 'function') closeModal();
    const toastEl = this.$('toast'); if(toastEl) toastEl.classList.remove('show');
    if(typeof Sound !== 'undefined') Sound.stopAll();   /* tắt mọi âm thanh Tài Xỉu đang phát dở */
    this.connect();
    this.loadHalls();
    this.renderHub();
    clearInterval(this._hubTimer);
    this._hubTimer = setInterval(() => {
      const h = this.$('cardsHub');
      if(h && h.classList.contains('open')) this.loadHalls();
    }, 5000);
    if(typeof Sound !== 'undefined') Sound.click();
  },

  closeAll(leave){
    const hadRoom = !!this.room;
    const token = this.token();
    this.active = false;
    this.inRoom = false;
    this.room = null;
    this.selected.clear();
    this._resultShown = false;
    this._lastPhase = '';
    this._lastTurn = -1;
    document.body.classList.remove('cards-active');
    const hub = this.$('cardsHub');
    const room = this.$('cardsRoom');
    if(hub) hub.classList.remove('open');
    if(room) room.classList.remove('open');
    this.hideResult();
    clearInterval(this._hubTimer); this._hubTimer = null;
    clearInterval(this._clock); this._clock = null;
    if(this.es){ try{ this.es.close(); }catch(e){} this.es = null; }
    if(leave && hadRoom && token){
      try{
        fetch('/api/cards/leave', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ token })
        }).catch(()=>{});
      }catch(e){}
    }
  },

  async loadHalls(){
    try{
      const r = await fetch('/api/cards/halls?t=' + Date.now(), { cache:'no-store' });
      const j = await r.json();
      if(j && j.ok){
        this.halls = j.halls || [];
        const hub = this.$('cardsHub');
        if(hub && hub.classList.contains('open')) this.renderHub();
      }
    }catch(e){}
  },

  renderHub(){
    const box = this.$('chHalls');
    const detail = this.$('chDetail');
    if(!box || !detail) return;
    this.paintBalance();
    const un = this.$('chUserName'); if(un) un.textContent = this.myName();

    if(!this.halls.length){
      box.innerHTML = '<div class="ch-empty">Đang tải sảnh bài…<br>Hãy chắc chắn server đang chạy.</div>';
      detail.innerHTML = '<div class="ch-empty">Chưa có dữ liệu sảnh.</div>';
      return;
    }

    const curHall = this.hall(this.hallId) || this.halls[0];
    if(curHall) this.hallId = curHall.id;

    box.innerHTML = this.halls.map(h => {
      const cnt = (h.stakes || []).reduce((n, s) => n + (s.tables || []).reduce((m, t) => m + (t.players || 0), 0), 0);
      return `<div class="ch-hall ${h.id === this.hallId ? 'sel' : ''} ${h.soon ? 'soon' : ''}" data-hall="${crEsc(h.id)}">
        <span class="st ${h.soon ? 'soon' : 'live'}">${h.soon ? 'SẮP CÓ' : '● LIVE'}</span>
        <div class="ic">${h.icon || '🃏'}</div>
        <div class="nm">${crEsc(h.name)}</div>
        <div class="ds">${crEsc(h.desc || '')}</div>
        ${h.soon ? '' : `<div class="cnt">${cnt} người đang chơi</div>`}
      </div>`;
    }).join('');

    box.querySelectorAll('[data-hall]').forEach(el => {
      el.onclick = () => {
        const h = this.hall(el.dataset.hall);
        if(!h || h.soon) return;
        this.hallId = h.id;
        if(typeof Sound !== 'undefined') Sound.click();
        this.renderHub();
      };
    });

    const h = this.hall(this.hallId);
    if(!h){ detail.innerHTML = '<div class="ch-empty">Sảnh không tồn tại.</div>'; return; }
    const stakes = h.stakes || [];
    let cur = stakes.find(s => s.stake === this.stake) || stakes[0];
    if(cur) this.stake = cur.stake;
    const tables = cur ? (cur.tables || []) : [];

    detail.innerHTML = `
      <div class="ch-detail-head">
        <h3>${h.icon || '🃏'} ${crEsc(h.name)}</h3>
        <p>${crEsc(h.desc || '')} · ${h.minSeats}–${h.seats} người/bàn</p>
      </div>
      <div class="ch-stakes">
        ${stakes.map(s => `<button class="ch-stake ${s.stake === this.stake ? 'on' : ''}" data-stake="${s.stake}">
          ${crFmt(s.stake)}<small>${s.stake >= 1000000 ? 'CAO' : s.stake >= 200000 ? 'TRUNG' : s.stake >= 50000 ? 'THƯỜNG' : 'THẤP'}</small>
        </button>`).join('')}
      </div>
      <div class="ch-tables">
        ${tables.length ? tables.map(t => {
          const full = t.players >= t.seats;
          const can = t.phase === 'waiting' && !full;
          const ph = t.phase === 'waiting' ? 'ĐANG CHỜ' : t.phase === 'playing' ? 'ĐANG CHƠI' : 'KẾT THÚC';
          return `<div class="ch-table-row">
            <div class="no">BÀN #${t.table}</div>
            <div class="meta"><b>${t.players}/${t.seats}</b> người chơi<br>${crFmt(this.stake)}đ / người</div>
            <span class="ph ${t.phase}">${ph}</span>
            <button class="ch-join" data-table="${t.table}" ${can ? '' : 'disabled'}>${can ? 'VÀO ▸' : 'KHÓA'}</button>
          </div>`;
        }).join('') : `<div class="ch-empty">Chưa có bàn ở mức cược này.<br>Bấm <b>VÀO BÀN NHANH</b> để tạo bàn mới và chờ người chơi.</div>`}
      </div>
      <div class="ch-detail-foot">
        <button class="ch-quick" id="chQuick" ${h.soon ? 'disabled' : ''}>⚡ VÀO BÀN NHANH · ${crFmt(this.stake)}đ</button>
      </div>`;

    detail.querySelectorAll('[data-stake]').forEach(el => {
      el.onclick = () => {
        this.stake = Number(el.dataset.stake) || 0;
        if(typeof Sound !== 'undefined') Sound.chip();
        this.renderHub();
      };
    });
    detail.querySelectorAll('[data-table]').forEach(el => {
      el.onclick = () => this.join(this.hallId, this.stake, Number(el.dataset.table) || 0);
    });
    const quick = this.$('chQuick');
    if(quick) quick.onclick = () => this.join(this.hallId, this.stake, 0);
  },

  /* ---------------- SSE ---------------- */
  connect(){
    if(!this.token()) return;
    if(this.es) return;
    try{
      const es = new EventSource('/api/cards/stream?token=' + encodeURIComponent(this.token()));
      this.es = es;
      es.onmessage = ev => {
        let m; try{ m = JSON.parse(ev.data); }catch(e){ return; }
        if(m.event === 'hello' || m.event === 'lobby'){
          if(Array.isArray(m.halls)){
            this.halls = m.halls;
            const hub = this.$('cardsHub');
            if(hub && hub.classList.contains('open')) this.renderHub();
          }
        } else if(m.event === 'state' && m.state){
          this.onState(m.state);
        }
      };
      es.onerror = () => { /* EventSource tự reconnect */ };
    }catch(e){}
  },

  /* ---------------- STATE ---------------- */
  onState(st){
    if(!st || st.ok === false){
      if(st && st.error && typeof toast === 'function') toast(st.error);
      return;
    }
    if(!this.inRoom) this.openRoom();
    const prevPhase = this._lastPhase;
    this.room = st;
    this._stateAt = Date.now();
    this._turnLeft = Number(st.turnLeft) || 0;

    if(typeof st.balance === 'number' && typeof state !== 'undefined'){
      state.balance = st.balance;
      if(typeof Net !== 'undefined') Net.meBal = st.balance;
      this.paintBalance();
    }

    if(st.phase !== 'playing') this.selected.clear();
    else {
      const hand = st.hand || [];
      this.selected = new Set([...this.selected].filter(c => hand.includes(c)));
    }

    if(st.phase === 'ended' && st.result){
      if(!this._resultShown) this.showResult(st);
    } else {
      this._resultShown = false;
      this.hideResult();
    }

    if(st.phase === 'playing' && st.turnSeat === st.mySeat && prevPhase === 'playing' && this._lastTurn !== st.mySeat){
      if(typeof Sound !== 'undefined') Sound.tick();
    }
    this._lastTurn = st.phase === 'playing' ? st.turnSeat : -1;
    this._lastPhase = st.phase;

    this.renderRoom();
  },

  paintBalance(){
    if(typeof state === 'undefined') return;
    const v = crFmt(state.balance);
    ['chBalance','homeBalance','pageBalance'].forEach(id => {
      const el = this.$(id); if(el) el.textContent = v;
    });
  },

  openRoom(){
    this.inRoom = true;
    this.active = true;
    document.body.classList.add('cards-active');
    crStopTxAuto();
    crPreload();
    const hub = this.$('cardsHub'); if(hub) hub.classList.remove('open');
    const room = this.$('cardsRoom'); if(room) room.classList.add('open');
    const toastEl = this.$('toast'); if(toastEl) toastEl.classList.remove('show');
    if(typeof Sound !== 'undefined') Sound.stopAll();
    if(typeof closeHome === 'function') closeHome();
    this.connect();
    this.renderRoom();
    clearInterval(this._clock);
    this._clock = setInterval(() => this.tickClock(), 500);
  },

  tickClock(){
    if(!this.room || this.room.phase !== 'playing') return;
    const el = this.$('crTurnLeft'); if(!el) return;
    const left = Math.max(0, this._turnLeft - Math.floor((Date.now() - this._stateAt) / 1000));
    el.textContent = left + 's';
  },

  playersSorted(){ return ((this.room && this.room.players) || []).slice().sort((a,b) => a.seat - b.seat); },
  myPlayer(){ return this.playersSorted().find(p => p.me) || null; },
  myTurn(){ const st = this.room; return !!(st && st.phase === 'playing' && st.mySeat === st.turnSeat); },

  renderRoom(){
    const st = this.room;
    if(!st) return;
    const me = this.myPlayer();
    const hall = this.hall(st.hall);
    const hn = this.$('crHallName'); if(hn) hn.textContent = st.hallName || (hall && hall.name) || 'GAME BÀI';
    const sk = this.$('crStake'); if(sk) sk.textContent = crFmt(st.stake);
    const tb = this.$('crTable'); if(tb) tb.textContent = 'BÀN #' + st.table;
    const ph = this.$('crPhase');
    if(ph) ph.textContent = st.phase === 'waiting' ? 'ĐANG CHỜ NGƯỜI' : st.phase === 'playing' ? 'ĐANG CHƠI' : 'KẾT THÚC';
    const tl = this.$('crTurnLeft');
    if(tl) tl.textContent = st.phase === 'playing' ? Math.max(0, Number(st.turnLeft) || 0) + 's' : '';

    this.renderSeats(me);
    this.renderCenter();
    this.renderActions(me);
    this.renderHand(me);
    this.renderCombos(me);
    this.renderMe(me);
    this.renderLog();
  },

  renderSeats(me){
    const box = this.$('crSeats');
    if(!box) return;
    const st = this.room;
    const all = this.playersSorted();
    const mi = all.findIndex(p => p.me);
    const opp = mi >= 0 ? all.slice(mi + 1).concat(all.slice(0, mi)) : all.slice(1);
    const n = Math.min(opp.length, 5);
    box.innerHTML = opp.slice(0, 5).map((p, i) => {
      const isTurn = st.phase === 'playing' && p.seat === st.turnSeat;
      const showReady = p.ready && st.phase === 'waiting';
      const tags = [];
      if(showReady) tags.push('<i class="cr-tag ready">SẴN SÀNG</i>');
      if(p.passed) tags.push('<i class="cr-tag pass">BỎ LƯỢT</i>');
      if(p.folded) tags.push('<i class="cr-tag fold">BỎ BÀI</i>');
      if(p.out) tags.push('<i class="cr-tag out">DỪNG</i>');
      const initial = (p.name || '?').trim().charAt(0).toUpperCase() || '?';
      return `<div class="cr-seat pos-${n}-${i} ${isTurn ? 'turn' : ''} ${showReady ? 'ready' : ''}">
        ${isTurn ? '<div class="cr-turn-dot">LƯỢT</div>' : ''}
        <div class="cr-av">${crEsc(initial)}</div>
        <div class="cr-nm">${crEsc(p.name)}</div>
        <div class="cr-meta">${p.count} lá${showReady ? ' · ✓' : ''}</div>
        ${tags.join('')}
      </div>`;
    }).join('');
  },

  renderCenter(){
    const box = this.$('crCenter');
    if(!box) return;
    const st = this.room;
    const hall = st.hall;
    const me = this.myPlayer();
    const pot = st.pot ? `<div class="cr-pot">${crFmt(st.pot)}</div>` : '';

    if(st.phase === 'waiting'){
      box.innerHTML = `<div class="lbl">PHÒNG CHỜ</div>
        <div class="big">${st.players.length}/${st.seats} NGƯỜI</div>
        <div class="sub">Cần tối thiểu <b>${st.minSeats}</b> người. Tất cả bấm <b>SẴN SÀNG</b> để bắt đầu ván.</div>`;
      return;
    }
    if(st.phase === 'ended'){
      box.innerHTML = `<div class="big">VÁN ĐÃ KẾT THÚC</div><div class="sub">Xem kết quả bên dưới.</div>`;
      return;
    }

    if(hall === 'tienlen13' || hall === 'tienlen6' || hall === 'samloc'){
      const lp = st.lastPlay;
      if(lp){
        const who = (st.players.find(p => p.seat === lp.seat) || {}).name || 'Người chơi';
        box.innerHTML = `<div class="lbl">BÀI TRÊN BÀN</div>
          <div class="cr-play-cards" id="crPlayCards"></div>
          <div class="sub"><b>${crEsc(who)}</b> vừa đánh ${lp.cards.length} lá</div>
          ${pot}`;
        const pc = this.$('crPlayCards');
        if(pc) lp.cards.forEach((c, i) => {
          const el = crCardEl(c, 'small');
          el.style.zIndex = i + 1;
          pc.appendChild(el);
        });
      } else {
        box.innerHTML = `<div class="big">VÒNG MỚI · ĐÁNH TỰ DO</div>
          <div class="sub">Người có lượt được ra bộ bài bất kỳ để mở vòng.</div>${pot}`;
      }
      return;
    }

    if(hall === 'lieng'){
      const cur = (st.center && st.center.currentBet) || st.stake;
      box.innerHTML = `<div class="lbl">LIÊNG · 3 LÁ</div>
        <div class="big">MỨC TỐ: ${crFmt(cur)}đ</div>
        <div class="sub">Bài của bạn: <b>${me ? crLiengName(st.hand) : '—'}</b> · ${st.players.length} người chơi</div>
        ${pot}`;
      return;
    }

    if(hall === 'xidach'){
      box.innerHTML = `<div class="lbl">NHÀ CÁI</div>
        <div class="cr-play-cards" id="crHouseCards"></div>
        <div class="sub">Điểm của bạn: <b>${me ? crXdScore(st.hand) : '—'}</b> · Rút tối đa 5 lá, gần 21 nhất thắng</div>
        ${pot}`;
      const hc = this.$('crHouseCards');
      if(hc){ hc.appendChild(crBackEl('small')); hc.appendChild(crBackEl('small')); }
      return;
    }

    box.innerHTML = `<div class="big">${crEsc(st.hallName || 'GAME BÀI')}</div>${pot}`;
  },

  renderActions(me){
    const box = this.$('crActions');
    if(!box) return;
    const st = this.room;
    const myTurn = this.myTurn();
    const hall = st.hall;

    if(st.phase === 'waiting'){
      const ready = !!(me && me.ready);
      box.innerHTML = `
        <button class="cr-btn green ${ready ? 'on' : ''}" id="crReady">${ready ? '✓ ĐÃ SẴN SÀNG' : 'SẴN SÀNG'}</button>
        <button class="cr-btn ghost" id="crShare">📋 MỜI BẠN</button>
        <span class="cr-hint">${st.players.length}/${st.seats} người · cần ≥ <b>${st.minSeats}</b> · tất cả sẵn sàng để bắt đầu</span>`;
      this.bind('crReady', () => this.ready());
      this.bind('crShare', () => this.copyInvite());
      return;
    }

    if(st.phase === 'ended'){
      box.innerHTML = `
        <button class="cr-btn gold" id="crWait" disabled>⏳ CHỜ VÁN MỚI…</button>
        <button class="cr-btn ghost" id="crLeave2">RỜI BÀN</button>
        <span class="cr-hint">Hệ thống tự chuyển về phòng chờ sau vài giây.</span>`;
      this.bind('crLeave2', () => this.leave());
      return;
    }

    if(hall === 'lieng'){
      const cur = (st.center && st.center.currentBet) || st.stake;
      const paid = me ? (me.paid || 0) : 0;
      const need = Math.max(0, cur - paid);
      box.innerHTML = `
        <button class="cr-btn red" id="crFold" ${myTurn ? '' : 'disabled'}>BỎ BÀI</button>
        <button class="cr-btn green" id="crCall" ${myTurn ? '' : 'disabled'}>THEO ${need ? crFmt(need) + 'đ' : ''}</button>
        <button class="cr-btn gold" id="crRaise" ${myTurn ? '' : 'disabled'}>TỐ +${crFmt(st.stake)}đ</button>
        <span class="cr-hint">${myTurn ? 'Lượt của bạn — chọn theo, tố hoặc bỏ bài.' : 'Đang chờ <b>' + crEsc(st.turnName || 'người chơi') + '</b>…'}</span>`;
      this.bind('crFold', () => this.act('fold'));
      this.bind('crCall', () => this.act('call'));
      this.bind('crRaise', () => this.act('raise'));
      return;
    }

    if(hall === 'xidach'){
      const score = me ? crXdScore(st.hand) : 0;
      box.innerHTML = `
        <button class="cr-btn green" id="crHit" ${myTurn ? '' : 'disabled'}>RÚT BÀI</button>
        <button class="cr-btn ghost" id="crStand" ${myTurn ? '' : 'disabled'}>DỪNG</button>
        <span class="cr-hint">Điểm của bạn: <b>${score}</b> · ${myTurn ? 'lượt của bạn' : 'đang chờ ' + crEsc(st.turnName || 'người chơi')}</span>`;
      this.bind('crHit', () => this.act('hit'));
      this.bind('crStand', () => this.act('stand'));
      return;
    }

    const sel = this.selected.size;
    const selCards = [...this.selected];
    const combo = crEvalTL(selCards);
    const mustBeat = st.lastPlay && st.lastPlay.seat !== st.mySeat ? st.lastPlay.eval : null;
    const comboOk = !!(combo && (!mustBeat || crBeatsTL(combo, mustBeat)));
    const canPlay = myTurn && sel > 0;
    const canPass = myTurn && !!st.lastPlay;
    const selHint = sel
      ? `Đã chọn <b>${sel}</b> lá${combo ? ' · <b>' + crComboLabel(combo, selCards) + '</b>' : ' · chưa thành bộ'}${combo && !comboOk ? ' · <b>không đè được</b>' : ''}`
      : 'Lượt của bạn — chọn bài hoặc bấm <b>GỢI Ý</b>.';
    box.innerHTML = `
      <button class="cr-btn blue" id="crSort">SẮP BÀI</button>
      <button class="cr-btn green" id="crSuggest" ${myTurn ? '' : 'disabled'}>💡 GỢI Ý</button>
      <button class="cr-btn gold" id="crPlay" ${canPlay ? '' : 'disabled'}>ĐÁNH BÀI${sel ? ' (' + sel + ')' : ''}</button>
      <button class="cr-btn ghost" id="crPass" ${canPass ? '' : 'disabled'}>BỎ LƯỢT</button>
      <span class="cr-hint">${myTurn ? selHint : 'Đang chờ <b>' + crEsc(st.turnName || 'người chơi') + '</b>…'}</span>`;
    this.bind('crSort', () => this.sortHand());
    this.bind('crSuggest', () => this.hintPlay());
    this.bind('crPlay', () => this.act('play', { cards:[...this.selected] }));
    this.bind('crPass', () => this.act('pass'));
  },

  bind(id, fn){
    const el = this.$(id);
    if(el) el.onclick = fn;
  },

  renderHand(me){
    const box = this.$('crHand');
    if(!box) return;
    const st = this.room;
    const hall = st.hall;
    if(st.phase === 'waiting'){
      if(box._sig !== 'waiting'){
        box._sig = 'waiting';
        box.innerHTML = '<div class="cr-hand-msg">Bài sẽ được chia khi tất cả người chơi bấm <b>SẴN SÀNG</b>.</div>';
      }
      return;
    }
    const hand = (st.hand || []).slice();
    if(this.handDesc) hand.reverse();
    if(!hand.length){
      if(box._sig !== 'empty'){
        box._sig = 'empty';
        box.innerHTML = '<div class="cr-hand-msg">Bạn đã hết bài 🎉</div>';
      }
      return;
    }
    const myTurn = this.myTurn();
    const pick = myTurn && (hall === 'tienlen13' || hall === 'tienlen6' || hall === 'samloc');
    /* Đưa trạng thái pick vào sig để cache không bỏ qua thay đổi lượt */
    const sig = hall + '|' + hand.join(',') + '|' + (pick ? '1' : '0');
    /* Bộ bài không đổi (chỉ đổi lượt) → cập nhật class, không dựng lại ảnh */
    if(box._sig === sig && box.querySelector('.cr-card')){
      box.querySelectorAll('.cr-card').forEach(el => {
        const c = +el.dataset.card;
        el.classList.toggle('pick', pick);
        el.classList.toggle('sel', this.selected.has(c));
        el.onclick = pick ? () => this.toggleCard(c, el) : null;
      });
      return;
    }
    box._sig = sig;
    box.innerHTML = '';
    hand.forEach((c, i) => {
      const el = crCardEl(c, '', pick);
      el.style.zIndex = i + 1;
      if(this.selected.has(c)) el.classList.add('sel');
      if(pick) el.onclick = () => this.toggleCard(c, el);
      box.appendChild(el);
    });
    if(hall === 'lieng' || hall === 'xidach'){
      const tag = document.createElement('div');
      tag.className = 'cr-hint';
      tag.style.marginLeft = '18px';
      tag.innerHTML = hall === 'lieng' ? `Bài: <b>${crLiengName(st.hand)}</b>` : `Điểm: <b>${crXdScore(st.hand)}</b>`;
      box.appendChild(tag);
    }
  },

  renderCombos(me){
    let box = this.$('crCombos');
    if(!box){
      box = document.createElement('div');
      box.id = 'crCombos';
      box.className = 'cr-combos';
      const hand = this.$('crHand');
      if(hand && hand.parentNode) hand.parentNode.insertBefore(box, hand);
    }
    const st = this.room;
    if(!st) return;
    const hall = st.hall;
    const pick = st.phase === 'playing' && this.myTurn() &&
      (hall === 'tienlen13' || hall === 'tienlen6' || hall === 'samloc');
    if(!pick || !st.hand || !st.hand.length){
      box.style.display = 'none';
      box.innerHTML = '';
      box._sig = '';
      return;
    }
    box.style.display = 'flex';

    const lastEval = st.lastPlay && st.lastPlay.seat !== st.mySeat ? st.lastPlay.eval : null;
    const sig = st.hand.join(',') + '|' +
      (lastEval ? lastEval.t + ':' + lastEval.len + ':' + lastEval.high : '0');
    if(box._sig !== sig){
      box._sig = sig;
      let list = crFindCombos(st.hand, lastEval);
      if(lastEval) list = list.slice(0, 8);
      else list = list.filter(c => c.t !== 'single').slice(0, 10);

      if(!list.length){
        box.innerHTML = '<span class="cr-combos-lbl">GỢI Ý</span><span class="cr-combo-none">' +
          (lastEval ? 'Không có bộ đỡ được — hãy bỏ lượt' : 'Không có bộ đặc biệt — bấm GỢI Ý để đánh lá nhỏ nhất') +
          '</span>';
      } else {
        box.innerHTML = '<span class="cr-combos-lbl">GỢI Ý</span>' + list.map(c =>
          `<button class="cr-combo" data-cards="${c.cards.join(',')}">${crEsc(crComboLabel(c))}</button>`
        ).join('');
        box.querySelectorAll('[data-cards]').forEach(el => {
          el.onclick = () => this.selectCombo(el.dataset.cards.split(',').map(Number));
        });
      }
    }
    this.paintComboActive();
  },

  paintComboActive(){
    const box = this.$('crCombos');
    if(!box) return;
    const sel = [...this.selected].sort((a,b)=>a-b).join(',');
    box.querySelectorAll('[data-cards]').forEach(el => {
      const cs = el.dataset.cards.split(',').map(Number).sort((a,b)=>a-b).join(',');
      el.classList.toggle('on', !!sel && cs === sel);
    });
  },

  paintHandSelection(){
    const box = this.$('crHand');
    if(!box) return;
    box.querySelectorAll('.cr-card').forEach(el => {
      el.classList.toggle('sel', this.selected.has(+el.dataset.card));
    });
  },

  selectCombo(cards){
    if(!this.myTurn()) return;
    const hand = (this.room && this.room.hand) || [];
    this.selected = new Set((cards || []).filter(c => hand.includes(c)));
    this.paintHandSelection();
    this.paintComboActive();
    this.renderActions(this.myPlayer());
    if(typeof Sound !== 'undefined') Sound.click();
  },

  hintPlay(){
    if(!this.myTurn()) return;
    const st = this.room;
    const lastEval = st.lastPlay && st.lastPlay.seat !== st.mySeat ? st.lastPlay.eval : null;
    const all = crFindCombos(st.hand || [], lastEval);
    let pick = null;
    if(lastEval){
      pick = all[0] || null;
    } else {
      const singles = all.filter(c => c.t === 'single').sort((a,b) => a.high - b.high);
      pick = singles[0] || all[0] || null;
    }
    if(!pick){
      const hint = this.$('crActions') && this.$('crActions').querySelector('.cr-hint');
      if(hint) hint.innerHTML = '<b>Không có bộ đỡ được</b> — hãy bỏ lượt.';
      return;
    }
    this.selectCombo(pick.cards);
  },

  renderMe(me){
    const box = this.$('crMe');
    if(!box) return;
    const st = this.room;
    if(!me){ box.innerHTML = ''; return; }
    const myTurn = this.myTurn();
    const initial = (me.name || 'B').trim().charAt(0).toUpperCase() || 'B';
    box.innerHTML = `
      <div class="cr-av me">${crEsc(initial)}</div>
      <div>
        <div class="cr-nm">${crEsc(me.name || 'Bạn')}</div>
        <div class="cr-meta">${crFmt(st.balance)}đ · ${me.count} lá</div>
      </div>
      ${myTurn ? '<div class="cr-turn-dot">LƯỢT CỦA BẠN</div>' : ''}`;
  },

  renderLog(){
    const box = this.$('crLog');
    if(!box) return;
    const log = (this.room && this.room.log) || [];
    box.innerHTML = log.slice(-4).map(x => `<div>${crEsc(x.text)}</div>`).join('');
  },

  toggleCard(c, el){
    if(!this.myTurn()) return;
    const hall = this.room.hall;
    if(hall !== 'tienlen13' && hall !== 'tienlen6' && hall !== 'samloc') return;
    const on = !this.selected.has(c);
    if(on) this.selected.add(c);
    else this.selected.delete(c);
    if(el) el.classList.toggle('sel', on);   /* chỉ đổi lá được chọn — không render lại cả bộ bài */
    this.paintComboActive();
    if(typeof Sound !== 'undefined') Sound.click();
    this.renderActions(this.myPlayer());
  },

  sortHand(){
    this.handDesc = !this.handDesc;
    if(typeof Sound !== 'undefined') Sound.chip();
    this.renderHand(this.myPlayer());
  },

  /* ---------------- HÀNH ĐỘNG ---------------- */
  async join(hall, stake, table){
    if(this.busy) return;
    if(!this.token()){ this.openHub(hall); return; }
    this.busy = true;
    try{
      const r = await fetch('/api/cards/join', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token:this.token(), hall, stake, table:table || 0 })
      }).then(x => x.json());
      if(!r.ok){ if(typeof toast === 'function') toast(r.error || 'Không vào được bàn!'); return; }
      this.hallId = hall;
      this.stake = stake;
      this.room = r.state;
      this._resultShown = false;
      this._lastPhase = r.state ? r.state.phase : '';
      this.selected.clear();
      this.openRoom();
      if(typeof Sound !== 'undefined') Sound.chip();
      this.loadHalls();
    }catch(e){
      if(typeof toast === 'function') toast('Không kết nối được máy chủ!');
    }finally{ this.busy = false; }
  },

  async ready(){
    if(this.busy) return;
    this.busy = true;
    try{
      const r = await fetch('/api/cards/ready', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token:this.token() })
      }).then(x => x.json());
      if(!r.ok){ if(typeof toast === 'function') toast(r.error || 'Không sẵn sàng được!'); return; }
      if(r.state) this.onState(r.state);
      if(typeof Sound !== 'undefined') Sound.chip();
    }catch(e){}
    finally{ this.busy = false; }
  },

  async act(action, data){
    if(this.busy) return;
    this.busy = true;
    try{
      const payload = Object.assign({ token:this.token(), action }, data || {});
      const r = await fetch('/api/cards/action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      }).then(x => x.json());
      if(!r.ok){
        if(typeof toast === 'function') toast(r.error || 'Nước đi không hợp lệ!');
        return;
      }
      if(action === 'play' || action === 'pass' || action === 'fold' || action === 'call' || action === 'raise' || action === 'hit' || action === 'stand'){
        this.selected.clear();
      }
      if(r.state) this.onState(r.state);
      if(typeof Sound !== 'undefined'){
        if(action === 'play' || action === 'hit') Sound.playCard();
        else if(action === 'pass' || action === 'fold' || action === 'stand') Sound.passTurn();
        else Sound.chip();
      }
    }catch(e){
      if(typeof toast === 'function') toast('Không gửi được nước đi!');
    }finally{ this.busy = false; }
  },

  async leave(){
    const token = this.token();
    const had = !!this.room;
    this.room = null;
    this.inRoom = false;
    this.selected.clear();
    this._resultShown = false;
    this.hideResult();
    const room = this.$('cardsRoom'); if(room) room.classList.remove('open');
    clearInterval(this._clock); this._clock = null;
    if(had && token){
      try{
        await fetch('/api/cards/leave', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ token })
        });
      }catch(e){}
    }
    this.openHub();
  },

  copyInvite(){
    const link = location.origin + location.pathname + '?cards=' + encodeURIComponent(this.hallId);
    const done = () => { if(typeof toast === 'function') toast('Đã copy link mời bạn bè!'); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(done).catch(() => { if(typeof toast === 'function') toast(link); });
    } else if(typeof toast === 'function') toast(link);
  },

  /* ---------------- KẾT QUẢ ---------------- */
  showResult(st){
    const box = this.$('crResult');
    if(!box) return;
    const r = st.result || {};
    const hall = st.hall;
    let title = 'VÁN KẾT THÚC', cls = '', sub = '', rows = '', house = '';

    if(hall === 'xidach'){
      const mine = (r.players || []).find(p => p.seat === st.mySeat) || null;
      const win = mine && mine.outcome === 'win';
      const push = mine && mine.outcome === 'push';
      title = win ? '🎉 BẠN THẮNG!' : push ? '🤝 HÒA VỐN' : '💀 BẠN THUA';
      cls = win ? 'win' : push ? '' : 'lose';
      sub = `Nhà cái: <b>${r.houseScore} điểm</b> · Pot <b>${crFmt(r.pot)}đ</b>`;
      house = `<div class="cr-res-house"><span>NHÀ CÁI</span><b>${r.houseScore} điểm</b><div class="cards" id="crResHouse"></div></div>`;
      rows = (r.players || []).map(p => {
        const oc = p.outcome === 'win' ? 'THẮNG' : p.outcome === 'push' ? 'HÒA' : p.outcome === 'bust' ? 'QUẮC' : 'THUA';
        return `<div class="cr-res-row ${p.outcome === 'win' ? 'win' : ''}">
          <div class="who">${crEsc(p.name)}<small>${p.score} điểm</small></div>
          <div class="cards" data-rev="${p.seat}"></div>
          <div class="outcome ${p.outcome === 'win' ? 'win' : p.outcome === 'push' ? 'push' : 'lose'}">${oc}</div>
        </div>`;
      }).join('');
    } else {
      const win = r.winner === st.mySeat;
      title = win ? '🎉 BẠN THẮNG!' : 'VÁN KẾT THÚC';
      cls = win ? 'win' : 'lose';
      sub = `Người về nhất: <b>${crEsc(r.winnerName || '—')}</b>` +
            (r.prize ? ` · Nhận <b>${crFmt(r.prize)}đ</b>` : '') +
            (r.handName ? ` · ${crEsc(r.handName)}` : '');
      rows = (r.reveal || []).map(p => `<div class="cr-res-row ${p.seat === r.winner ? 'win' : ''}">
        <div class="who">${crEsc(p.name)}<small>${p.count != null ? p.count + ' lá còn lại' : ''}</small></div>
        <div class="cards" data-rev="${p.seat}"></div>
        <div class="outcome ${p.seat === r.winner ? 'win' : 'lose'}">${p.seat === r.winner ? 'VỀ NHẤT' : 'THUA'}</div>
      </div>`).join('');
    }

    box.innerHTML = `<div class="cr-result-box">
      <div class="cr-res-title ${cls}">${title}</div>
      <div class="cr-res-sub">${sub}</div>
      ${house}
      <div class="cr-res-rows">${rows}</div>
      <div class="cr-res-actions">
        <button class="cr-btn gold" id="crResClose">ĐÓNG</button>
        <button class="cr-btn ghost" id="crResLeave">RỜI BÀN</button>
      </div>
    </div>`;
    box.classList.add('open');

    const fill = (seat, cards) => {
      const el = box.querySelector(`[data-rev="${seat}"]`);
      if(!el) return;
      (cards || []).forEach((c, i) => {
        const card = crCardEl(c, 'small');
        card.style.zIndex = i + 1;
        el.appendChild(card);
      });
    };
    if(hall === 'xidach'){
      fill('house', r.house);
      (r.players || []).forEach(p => fill(p.seat, p.cards));
    } else {
      (r.reveal || []).forEach(p => fill(p.seat, p.cards));
    }

    this.bind('crResClose', () => this.hideResult());
    this.bind('crResLeave', () => this.leave());
    this._resultShown = true;

    if(typeof Sound !== 'undefined'){
      if(hall === 'xidach'){
        const mine = (r.players || []).find(p => p.seat === st.mySeat);
        if(mine && mine.outcome === 'win') Sound.win();
        else if(mine && mine.outcome === 'push') Sound.chip();
        else Sound.lose();
      } else if(r.winner === st.mySeat) Sound.win();
      else Sound.lose();
    }
  },

  hideResult(){
    const box = this.$('crResult');
    if(box) box.classList.remove('open');
  }
};

/* ---------------- GẮN SỰ KIỆN TĨNH ---------------- */
(function(){
  const back = document.getElementById('chBack');
  if(back) back.onclick = () => { CardsUI.closeAll(true); if(typeof openHome === 'function') openHome(); };
  const leave = document.getElementById('crLeave');
  if(leave) leave.onclick = () => CardsUI.leave();
  window.addEventListener('beforeunload', () => {
    if(CardsUI.room && CardsUI.token() && navigator.sendBeacon){
      try{
        navigator.sendBeacon('/api/cards/leave', new Blob([JSON.stringify({ token:CardsUI.token() })], { type:'application/json' }));
      }catch(e){}
    }
  });
  /* link mời: /?cards=tienlen13 */
  setTimeout(() => {
    try{
      const q = new URLSearchParams(location.search).get('cards');
      if(q) CardsUI.openHub(q);
    }catch(e){}
  }, 1400);
})();

/* =====================================================================
   MULTIPLAYER CARD GAMES SERVER — SẢNH BÀI NHIỀU NGƯỜI
   Tiến Lên 13 · Tiến Lên 6 · Sâm Lốc · Liêng · Xì Dách
   REST + SSE, chia sảnh theo game & mức cược
   ===================================================================== */
const crypto = require('crypto');

const HALLS = [
  { id:'tienlen13', name:'TIẾN LÊN 13 LÁ', icon:'🃏', seats:4, minSeats:2, cards:13,
    desc:'Bài 13 lá · 2–4 người · về nhất ăn cả' },
  { id:'tienlen6',  name:'TIẾN LÊN 6 LÁ',  icon:'🎴', seats:4, minSeats:2, cards:6,
    desc:'Ván nhanh 6 lá · 2–4 người' },
  { id:'samloc',    name:'SÂM LỐC',        icon:'♠️', seats:4, minSeats:2, cards:10,
    desc:'Sâm lốc 10 lá · 2–4 người' },
  { id:'lieng',     name:'LIÊNG',          icon:'🂡', seats:6, minSeats:2, cards:3,
    desc:'Liêng 3 lá · 2–6 người · tố tiền' },
  { id:'xidach',    name:'XÌ DÁCH',        icon:'♣️', seats:5, minSeats:2, cards:2,
    desc:'Đấu với nhà cái · 2–5 người' },
  { id:'maubinh',   name:'MẬU BINH',       icon:'🀄', seats:4, minSeats:2, soon:true,
    desc:'Sắp ra mắt' },
  { id:'phom',      name:'PHỎM',           icon:'🀫', seats:4, minSeats:2, soon:true,
    desc:'Sắp ra mắt' }
];
const STAKES = [10000, 50000, 200000, 1000000];
const RAKE = 0.05;
const TURN_MS = 25000;
const RESULT_MS = 6000;

const HALL_BY_ID = Object.fromEntries(HALLS.map(h => [h.id, h]));

/* ---------------- bài tây ---------------- */
function newDeck(){
  const d = [];
  for(let r=3; r<=15; r++) for(let s=0; s<4; s++) d.push(r*4+s);  /* 12..63 */
  return d;
}
function shuffle(a){
  for(let i=a.length-1; i>0; i--){
    const j = crypto.randomInt(i+1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rankOf = c => c >> 2;
const suitOf = c => c & 3;

/* ----- đánh giá bộ bài tiến lên / sâm lốc ----- */
function evalTL(cards){
  const n = cards.length;
  if(!n) return null;
  const s = [...cards].sort((a,b)=>a-b);
  const high = s[n-1];
  if(n===1) return { t:'single', len:1, high };
  if(n===2 && rankOf(s[0])===rankOf(s[1])) return { t:'pair', len:2, high };
  if(n===3 && rankOf(s[0])===rankOf(s[1]) && rankOf(s[1])===rankOf(s[2]))
    return { t:'triple', len:3, high };
  if(n===4 && rankOf(s[0])===rankOf(s[1]) && rankOf(s[1])===rankOf(s[2]) && rankOf(s[2])===rankOf(s[3]))
    return { t:'four', len:4, high };
  if(n>=3){
    let ok = true;
    for(let i=0; i<n-1; i++){
      if(rankOf(s[i])===15 || rankOf(s[i+1])===15){ ok=false; break; }
      if(rankOf(s[i+1]) !== rankOf(s[i])+1){ ok=false; break; }
    }
    if(ok) return { t:'straight', len:n, high };
  }
  return null;
}
function beatsTL(a, b){
  if(!b) return true;
  if(a.t==='four' && b.t==='single' && rankOf(b.high)===15) return true;   /* tứ quý chặt heo */
  if(a.t==='four' && b.t==='four') return a.high > b.high;
  return a.t===b.t && a.len===b.len && a.high > b.high;
}

/* ----- liêng ----- */
function evalLieng(cards){
  const rs = cards.map(rankOf).sort((a,b)=>a-b);
  const highCard = Math.max(...cards);
  const set = rs.join(',');
  if(rs[0]===rs[1] && rs[1]===rs[2]) return { v:300000 + rs[2]*1000 + highCard%4, name:'Sáp' };
  const straight = (rs[1]===rs[0]+1 && rs[2]===rs[1]+1) || set==='3,14,15' || set==='12,13,14';
  if(straight) return { v:200000 + rs[2]*1000 + highCard%4, name:'Liêng' };
  if(rs[0]===11 && rs[1]===12 && rs[2]===13) return { v:100000 + highCard, name:'Ảnh' };
  const pts = rs.reduce((sum,r)=> sum + (r===14?1 : r===15?2 : r>=11?10 : r), 0) % 10;
  return { v: pts*1000 + highCard, name:'Điểm '+pts };
}

/* ----- xì dách ----- */
function xdScore(cards){
  let total = 0, aces = 0;
  for(const c of cards){
    const r = rankOf(c);
    if(r===14) aces++;
    else if(r===15) total += 2;
    else if(r>=11) total += 10;
    else total += r;
  }
  let best = total + aces;
  if(aces && total + 10 + (aces-1) <= 21) best = total + 10 + (aces-1);
  return best;
}
function xdBlackjack(cards){
  if(cards.length!==2) return false;
  const rs = cards.map(rankOf);
  if(rs[0]===14 && rs[1]===14) return true;             /* xì bàn */
  return rs.includes(14) && rs.some(r => r>=11 && r!==14); /* xì dách */
}

/* ===================================================================== */
function createCards(deps){
  const { getUser, onBalance, json, body } = deps;
  const rooms = new Map();       /* key -> room */
  const byToken = new Map();     /* token -> room */
  const clients = new Map();     /* token -> Set(res) */
  let tableSeq = 0;

  const roomKey = (hall, stake, no) => `${hall}:${stake}:${no}`;

  /* ---------------- lớp phòng ---------------- */
  class Room {
    constructor(hall, stake, no){
      this.hall = hall;
      this.stake = stake;
      this.no = no;
      this.key = roomKey(hall.id, stake, no);
      this.players = [];
      this.phase = 'waiting';
      this.turn = 0;
      this.deadline = 0;
      this.lastPlay = null;
      this.passCount = 0;
      this.pot = 0;
      this.center = null;
      this.result = null;
      this.log = [];
      this.timer = null;
      this.createdAt = Date.now();
    }
    seatFree(seat){ return !this.players.some(p => p.seat===seat); }
    nextSeat(){
      for(let i=0; i<this.hall.seats; i++) if(this.seatFree(i)) return i;
      return -1;
    }
    add(token, user){
      if(this.players.length >= this.hall.seats) return { ok:false, error:'Bàn đã đầy!' };
      if(user.balance < this.stake) return { ok:false, error:'Cần tối thiểu '+this.stake.toLocaleString('vi-VN')+'đ để vào bàn!' };
      const seat = this.nextSeat();
      this.players.push({ token, uid:user.id, name:user.name, seat, ready:false, hand:[], passed:false, folded:false, out:false, paid:0, score:0 });
      this.players.sort((a,b)=>a.seat-b.seat);
      byToken.set(token, this);
      this.note(`${user.name} vào bàn`);
      return { ok:true };
    }
    remove(token){
      const idx = this.players.findIndex(p => p.token===token);
      if(idx < 0) return;
      const p = this.players[idx];
      this.players.splice(idx, 1);
      byToken.delete(token);
      this.note(`${p.name} rời bàn`);
      if(this.phase==='playing' && this.players.length){
        if(this.turn === p.seat) this.advanceTurn(p.seat, true);
        if(this.players.length < 2) this.abort();
      }
      if(!this.players.length){
        rooms.delete(this.key);
        return;
      }
      this.broadcast();
    }
    note(text){
      this.log.push({ at:Date.now(), text });
      if(this.log.length > 30) this.log.shift();
    }
    broadcast(){
      for(const p of this.players) pushState(p.token, this.stateFor(p.token));
    }
    stateFor(token){
      const me = this.players.find(p => p.token===token);
      const turnPlayer = this.players.find(p => p.seat===this.turn);
      return {
        ok:true, hall:this.hall.id, hallName:this.hall.name, stake:this.stake, table:this.no,
        phase:this.phase, seats:this.hall.seats, minSeats:this.hall.minSeats, cards:this.hall.cards,
        turnSeat:this.turn, turnName:turnPlayer?turnPlayer.name:'', turnLeft: this.deadline? Math.max(0, Math.ceil((this.deadline-Date.now())/1000)) : 0,
        pot:this.pot, players:this.players.map(p => ({
          seat:p.seat, name:p.name, ready:p.ready, count:p.hand.length,
          passed:p.passed, folded:p.folded, out:p.out, me:p.token===token, score:p.score, paid:p.paid
        })),
        mySeat: me ? me.seat : -1,
        hand: me ? me.hand.slice().sort((a,b)=>a-b) : [],
        balance: me ? ((getUser(token) || {}).balance || 0) : 0,
        lastPlay: this.lastPlay ? { seat:this.lastPlay.seat, cards:this.lastPlay.cards, type:this.lastPlay.eval.t } : null,
        center: this.center,
        result: this.result,
        log: this.log.slice(-8)
      };
    }
    start(){
      const hall = this.hall;
      if(this.players.length < hall.minSeats) return { ok:false, error:'Cần ít nhất '+hall.minSeats+' người để bắt đầu!' };
      for(const p of this.players){
        const u = getUser(p.token);
        if(!u || u.balance < this.stake) return { ok:false, error:`${p.name} không đủ số dư!` };
      }
      this.phase = 'playing';
      this.result = null;
      this.lastPlay = null;
      this.passCount = 0;
      this.center = null;
      this.pot = 0;
      this.log = [];
      const deck = shuffle(newDeck());
      const nCards = hall.cards;
      this.players.forEach((p, i) => {
        p.hand = deck.slice(i*nCards, (i+1)*nCards);
        p.passed = false; p.folded = false; p.out = false;
        p.paid = 0; p.score = 0;
        onBalance(p.token, -this.stake);
        p.paid = this.stake;
        this.pot += this.stake;
      });
      if(hall.id === 'xidach'){
        this.house = deck.slice(this.players.length*2, this.players.length*2 + 2);
        this.houseDone = false;
        this._xdDeck = shuffle(newDeck());
        this.turn = this.players[0].seat;
      } else if(hall.id === 'lieng'){
        this.turn = this.players[0].seat;
        this.center = { currentBet:this.stake };
        this.liengActed = new Set();
      } else {
        /* tiến lên: người có 3♠ đi trước (hoặc lá nhỏ nhất) */
        let first = this.players[0];
        let low = 99;
        for(const p of this.players) for(const c of p.hand) if(c < low){ low = c; first = p; }
        this.turn = first.seat;
      }
      this.deadline = Date.now() + TURN_MS;
      this.note('Ván mới bắt đầu — cược '+this.stake.toLocaleString('vi-VN')+'đ/người');
      this.broadcast();
      pushRoomList();
      return { ok:true };
    }
    abort(){
      for(const p of this.players){
        if(p.paid) onBalance(p.token, p.paid);
        p.paid = 0;
      }
      this.pot = 0;
      this.phase = 'waiting';
      this.players.forEach(p => { p.ready = false; p.hand = []; });
      this.broadcast();
      pushRoomList();
    }
    playerAt(seat){ return this.players.find(p => p.seat===seat); }
    activePlayers(){ return this.players.filter(p => !p.folded && !p.out); }
    advanceTurn(fromSeat, skip){
      const n = this.hall.seats;
      let seat = fromSeat;
      for(let i=0; i<n; i++){
        seat = (seat+1) % n;
        const p = this.playerAt(seat);
        if(p && !p.folded && !p.out && p.hand.length) { this.turn = seat; break; }
      }
      this.deadline = Date.now() + TURN_MS;
    }
    act(token, action, data){
      const p = this.players.find(x => x.token===token);
      if(!p) return { ok:false, error:'Bạn không ở trong bàn này!' };
      if(this.phase !== 'playing') return { ok:false, error:'Ván chưa bắt đầu!' };

      if(this.hall.id === 'xidach') return this.actXidach(p, action);
      if(this.hall.id === 'lieng') return this.actLieng(p, action, data);

      /* --- tiến lên / sâm lốc --- */
      if(p.seat !== this.turn) return { ok:false, error:'Chưa đến lượt bạn!' };
      if(p.passed) return { ok:false, error:'Bạn đã bỏ lượt trong vòng này!' };

      if(action === 'pass'){
        if(!this.lastPlay) return { ok:false, error:'Vòng mới — bạn phải đánh bài!' };
        p.passed = true;
        this.note(`${p.name} bỏ lượt`);
        const alive = this.activePlayers().filter(x => !x.passed && x.hand.length);
        if(alive.length <= 1){
          const winner = alive[0] || this.playerAt(this.lastPlay.seat);
          this.lastPlay = null;
          this.players.forEach(x => x.passed = false);
          this.turn = winner ? winner.seat : p.seat;
          this.note(`Vòng mới — ${winner?winner.name:''} đánh trước`);
        } else {
          this.advanceTurn(p.seat, true);
        }
        this.deadline = Date.now() + TURN_MS;
        this.broadcast();
        return { ok:true };
      }

      if(action === 'play'){
        const cards = Array.isArray(data.cards) ? data.cards.map(Number) : [];
        if(!cards.length) return { ok:false, error:'Chưa chọn lá bài nào!' };
        const uniq = new Set(cards);
        if(uniq.size !== cards.length) return { ok:false, error:'Bài chọn bị trùng!' };
        if(!cards.every(c => p.hand.includes(c))) return { ok:false, error:'Bạn không có lá bài này!' };
        const ev = evalTL(cards);
        if(!ev) return { ok:false, error:'Bộ bài không hợp lệ!' };
        if(this.lastPlay && this.lastPlay.seat !== p.seat && !beatsTL(ev, this.lastPlay.eval))
          return { ok:false, error:'Bài không đè được bài trên bàn!' };
        if(this.lastPlay && this.lastPlay.seat === p.seat) this.lastPlay = null; /* chủ vòng đánh tiếp */

        p.hand = p.hand.filter(c => !uniq.has(c));
        this.lastPlay = { seat:p.seat, cards, eval:ev };
        this.passCount = 0;
        this.note(`${p.name} đánh ${cards.length} lá`);
        if(p.hand.length === 0) return this.finish(p);
        this.advanceTurn(p.seat, true);
        this.broadcast();
        return { ok:true };
      }
      return { ok:false, error:'Hành động không hợp lệ!' };
    }

    actLieng(p, action){
      if(p.seat !== this.turn) return { ok:false, error:'Chưa đến lượt bạn!' };
      if(p.folded) return { ok:false, error:'Bạn đã bỏ bài!' };
      const need = Math.max(0, (this.center?.currentBet || this.stake) - p.paid);
      if(action === 'fold'){
        p.folded = true;
        this.note(`${p.name} bỏ bài`);
      } else if(action === 'call'){
        if(need > 0){
          const u = getUser(p.token);
          if(!u || u.balance < need) return { ok:false, error:'Không đủ số dư để theo!' };
          onBalance(p.token, -need); p.paid += need; this.pot += need;
        }
        this.note(`${p.name} theo`);
      } else if(action === 'raise'){
        const add = need + this.stake;
        const u = getUser(p.token);
        if(!u || u.balance < add) return { ok:false, error:'Không đủ số dư để tố!' };
        onBalance(p.token, -add); p.paid += add; this.pot += add;
        this.center = this.center || {};
        this.center.currentBet = p.paid;
        this.note(`${p.name} tố lên ${p.paid.toLocaleString('vi-VN')}đ`);
      } else return { ok:false, error:'Hành động không hợp lệ!' };

      if(!this.liengActed) this.liengActed = new Set();
      if(action === 'raise') this.liengActed = new Set([p.seat]);
      else this.liengActed.add(p.seat);

      const alive = this.players.filter(x => !x.folded);
      if(alive.length <= 1) return this.showdownLieng();
      const pending = alive.filter(x => !this.liengActed.has(x.seat));
      if(!pending.length) return this.showdownLieng();

      let next = null;
      for(let i=1; i<=this.hall.seats; i++){
        const seat = (p.seat + i) % this.hall.seats;
        const q = this.playerAt(seat);
        if(q && !q.folded && !this.liengActed.has(seat)){ next = seat; break; }
      }
      if(next == null){
        for(let i=1; i<=this.hall.seats; i++){
          const seat = (p.seat + i) % this.hall.seats;
          const q = this.playerAt(seat);
          if(q && !q.folded){ next = seat; break; }
        }
      }
      if(next == null) return this.showdownLieng();
      this.turn = next;
      this.deadline = Date.now() + TURN_MS;
      this.broadcast();
      return { ok:true };
    }
    nextLiengSeat(from){
      for(let i=1; i<=this.hall.seats; i++){
        const seat = (from+i) % this.hall.seats;
        const p = this.playerAt(seat);
        if(p && !p.folded) return seat;
      }
      return null;
    }
    showdownLieng(){
      const alive = this.players.filter(p => !p.folded);
      let best = null, bestEv = null;
      for(const p of alive){
        const ev = evalLieng(p.hand);
        if(!bestEv || ev.v > bestEv.v){ best = p; bestEv = ev; }
      }
      this.phase = 'ended';
      this.result = {
        winner: best ? best.seat : -1,
        winnerName: best ? best.name : '',
        handName: bestEv ? bestEv.name : '',
        pot: this.pot,
        reveal: this.players.map(p => ({ seat:p.seat, cards:p.hand.slice().sort((a,b)=>a-b), name:p.name }))
      };
      if(best){
        const prize = Math.round(this.pot * (1-RAKE));
        onBalance(best.token, prize);
        this.note(`${best.name} thắng ${prize.toLocaleString('vi-VN')}đ (${bestEv.name})`);
      }
      this.deadline = 0;
      this.broadcast();
      this.scheduleReset();
      return { ok:true };
    }

    actXidach(p, action){
      if(p.seat !== this.turn) return { ok:false, error:'Chưa đến lượt bạn!' };
      if(p.folded || p.out) return { ok:false, error:'Bạn đã dừng!' };
      if(action === 'hit'){
        if(p.hand.length >= 5) return { ok:false, error:'Tối đa 5 lá!' };
        const deck = this._xdDeck || (this._xdDeck = shuffle(newDeck()));
        let card = deck.pop();
        while(p.hand.includes(card) || (this.house||[]).includes(card) || this.players.some(x => x!==p && x.hand.includes(card))) card = deck.pop();
        p.hand.push(card);
        p.score = xdScore(p.hand);
        if(p.score > 21){ p.out = true; this.note(`${p.name} quắc (${p.score})`); }
        else if(p.score === 21){ p.out = true; this.note(`${p.name} đủ 21 điểm`); }
        else { this.broadcast(); return { ok:true }; }
      } else if(action === 'stand'){
        p.out = true;
        p.score = xdScore(p.hand);
        this.note(`${p.name} dừng ${p.score} điểm`);
      } else return { ok:false, error:'Hành động không hợp lệ!' };

      const next = this.nextXidachSeat(p.seat);
      if(next == null) return this.housePlay();
      this.turn = next;
      this.deadline = Date.now() + TURN_MS;
      this.broadcast();
      return { ok:true };
    }
    nextXidachSeat(from){
      for(let i=1; i<=this.hall.seats; i++){
        const seat = (from+i) % this.hall.seats;
        const p = this.playerAt(seat);
        if(p && !p.out) return seat;
      }
      return null;
    }
    housePlay(){
      this.house = this.house || [];
      this._xdDeck = this._xdDeck || shuffle(newDeck());
      while(xdScore(this.house) < 16 && this.house.length < 5){
        let c = this._xdDeck.pop();
        while((this.house||[]).includes(c) || this.players.some(x => x.hand.includes(c))) c = this._xdDeck.pop();
        this.house.push(c);
      }
      const hs = xdScore(this.house);
      const houseBJ = xdBlackjack(this.house);
      const results = [];
      for(const p of this.players){
        const ps = xdScore(p.hand);
        const pBJ = xdBlackjack(p.hand);
        let outcome = 'lose', payout = 0;
        if(ps > 21) outcome = 'bust';
        else if(houseBJ && !pBJ) outcome = 'lose';
        else if(pBJ && !houseBJ){ outcome = 'win'; payout = Math.round(this.stake*2.5); }
        else if(hs > 21){ outcome = 'win'; payout = this.stake*2; }
        else if(ps > hs){ outcome = 'win'; payout = this.stake*2; }
        else if(ps === hs){ outcome = 'push'; payout = this.stake; }
        if(payout) onBalance(p.token, payout);
        p.score = ps;
        results.push({ seat:p.seat, name:p.name, score:ps, outcome, cards:p.hand.slice().sort((a,b)=>a-b) });
      }
      this.phase = 'ended';
      this.result = { house:this.house.slice().sort((a,b)=>a-b), houseScore:hs, players:results, pot:this.pot };
      this.deadline = 0;
      this.broadcast();
      this.scheduleReset();
      return { ok:true };
    }

    finish(winner){
      this.phase = 'ended';
      const prize = Math.round(this.pot * (1-RAKE));
      onBalance(winner.token, prize);
      this.result = {
        winner:winner.seat, winnerName:winner.name, prize,
        reveal: this.players.map(p => ({ seat:p.seat, name:p.name, cards:p.hand.slice().sort((a,b)=>a-b), count:p.hand.length }))
      };
      this.note(`${winner.name} về nhất — thắng ${prize.toLocaleString('vi-VN')}đ`);
      this.deadline = 0;
      this.broadcast();
      pushRoomList();
      this.scheduleReset();
      return { ok:true };
    }
    scheduleReset(){
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if(this.phase !== 'ended') return;
        this.phase = 'waiting';
        this.players.forEach(p => { p.ready = false; p.hand = []; p.passed = false; p.folded = false; p.out = false; p.paid = 0; });
        this.lastPlay = null; this.pot = 0; this.center = null; this.result = null; this.house = null;
        this.broadcast();
        pushRoomList();
      }, RESULT_MS);
    }
    tick(){
      if(this.phase !== 'playing' || !this.deadline) return;
      if(Date.now() < this.deadline) return;
      const p = this.playerAt(this.turn);
      if(!p){ this.deadline = Date.now() + 3000; return; }
      if(this.hall.id === 'xidach'){ this.act(p.token, 'stand'); return; }
      if(this.hall.id === 'lieng'){
        const need = Math.max(0, (this.center?.currentBet || this.stake) - p.paid);
        const u = getUser(p.token);
        this.act(p.token, (u && u.balance >= need) ? 'call' : 'fold');
        return;
      }
      if(!this.lastPlay){
        const low = p.hand.slice().sort((a,b)=>a-b)[0];
        if(low != null) this.act(p.token, 'play', { cards:[low] });
      } else {
        this.act(p.token, 'pass');
      }
    }
  }

  /* ---------------- tìm / tạo bàn ---------------- */
  function findRoom(hallId, stake){
    const hall = HALL_BY_ID[hallId];
    if(!hall) return null;
    for(const room of rooms.values()){
      if(room.hall.id===hallId && room.stake===stake && room.phase==='waiting' && room.players.length < hall.seats) return room;
    }
    return null;
  }
  function createRoom(hallId, stake){
    const hall = HALL_BY_ID[hallId];
    const room = new Room(hall, stake, ++tableSeq);
    rooms.set(room.key, room);
    return room;
  }

  /* ---------------- SSE ---------------- */
  function pushState(token, state){
    const set = clients.get(token);
    if(!set) return;
    const payload = `data: ${JSON.stringify({ event:'state', state })}\n\n`;
    for(const res of set){ try{ res.write(payload); }catch(e){} }
  }
  function pushRoomList(){
    const data = `data: ${JSON.stringify({ event:'lobby', halls: hallList() })}\n\n`;
    for(const set of clients.values()) for(const res of set){ try{ res.write(data); }catch(e){} }
  }
  function hallList(){
    return HALLS.map(h => ({
      id:h.id, name:h.name, icon:h.icon, seats:h.seats, minSeats:h.minSeats, desc:h.desc, soon:!!h.soon,
      stakes: STAKES.map(stake => {
        const list = [...rooms.values()].filter(r => r.hall.id===h.id && r.stake===stake);
        return {
          stake,
          tables: list.map(r => ({ table:r.no, players:r.players.length, seats:h.seats, phase:r.phase }))
        };
      })
    }));
  }

  /* ---------------- HTTP ---------------- */
  async function handle(req, res, url){
    const p = url.pathname;
    if(!p.startsWith('/api/cards')) return false;

    if(p === '/api/cards/stream'){
      const token = url.searchParams.get('token') || '';
      if(!getUser(token)){ return json(res, 200, { ok:false, error:'Chưa đăng nhập!' }), true; }
      res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-store', Connection:'keep-alive' });
      res.write(`data: ${JSON.stringify({ event:'hello', halls: hallList() })}\n\n`);
      if(!clients.has(token)) clients.set(token, new Set());
      clients.get(token).add(res);
      const room = byToken.get(token);
      if(room) res.write(`data: ${JSON.stringify({ event:'state', state: room.stateFor(token) })}\n\n`);
      const hb = setInterval(() => { try{ res.write(':hb\n\n'); }catch(e){} }, 15000);
      req.on('close', () => { clearInterval(hb); const set = clients.get(token); if(set) set.delete(res); });
      return true;
    }

    if(p === '/api/cards/halls'){
      return json(res, 200, { ok:true, halls: hallList() }), true;
    }

    if(p === '/api/cards/state'){
      const token = url.searchParams.get('token') || '';
      const room = byToken.get(token);
      return json(res, 200, room ? room.stateFor(token) : { ok:true, inRoom:false }), true;
    }

    if(req.method !== 'POST') return json(res, 405, { ok:false, error:'Method not allowed' }), true;
    const b = await body(req);
    const token = b.token || '';
    const user = getUser(token);
    if(!user) return json(res, 200, { ok:false, error:'Chưa đăng nhập!' }), true;

    if(p === '/api/cards/join'){
      const hallId = b.hall, stake = Math.floor(+b.stake || 0);
      const hall = HALL_BY_ID[hallId];
      if(!hall || hall.soon) return json(res, 200, { ok:false, error:'Sảnh không tồn tại!' }), true;
      if(!STAKES.includes(stake)) return json(res, 200, { ok:false, error:'Mức cược không hợp lệ!' }), true;
      const old = byToken.get(token);
      if(old) old.remove(token);
      let room = null;
      const wantTable = Math.floor(+b.table || 0);
      if(wantTable){
        room = rooms.get(roomKey(hallId, stake, wantTable)) || null;
        if(!room) return json(res, 200, { ok:false, error:'Bàn không tồn tại!' }), true;
        if(room.phase !== 'waiting') return json(res, 200, { ok:false, error:'Bàn đang chơi, hãy chọn bàn khác!' }), true;
        if(room.players.length >= room.hall.seats) return json(res, 200, { ok:false, error:'Bàn đã đầy!' }), true;
      } else {
        room = findRoom(hallId, stake);
      }
      if(!room) room = createRoom(hallId, stake);
      const r = room.add(token, user);
      if(!r.ok) return json(res, 200, r), true;
      room.broadcast();
      pushRoomList();
      return json(res, 200, { ok:true, state: room.stateFor(token) }), true;
    }

    if(p === '/api/cards/leave'){
      const room = byToken.get(token);
      if(room){ room.remove(token); pushRoomList(); }
      return json(res, 200, { ok:true }), true;
    }

    if(p === '/api/cards/ready'){
      const room = byToken.get(token);
      if(!room) return json(res, 200, { ok:false, error:'Bạn chưa vào bàn!' }), true;
      if(room.phase === 'playing') return json(res, 200, { ok:false, error:'Ván đang diễn ra!' }), true;
      const me = room.players.find(x => x.token===token);
      me.ready = !me.ready;
      const readyCount = room.players.filter(x => x.ready).length;
      if(room.players.length >= room.hall.minSeats && readyCount === room.players.length){
        const r = room.start();
        if(!r.ok){
          me.ready = false;
          room.broadcast();
          return json(res, 200, r), true;
        }
      } else {
        room.broadcast();
      }
      return json(res, 200, { ok:true, state: room.stateFor(token) }), true;
    }

    if(p === '/api/cards/action'){
      const room = byToken.get(token);
      if(!room) return json(res, 200, { ok:false, error:'Bạn chưa vào bàn!' }), true;
      const r = room.act(token, b.action, b);
      if(!r.ok) return json(res, 200, r), true;
      return json(res, 200, { ok:true, state: room.stateFor(token) }), true;
    }

    return json(res, 404, { ok:false, error:'Not found' }), true;
  }

  /* ---------------- tick toàn cục ---------------- */
  setInterval(() => {
    for(const room of [...rooms.values()]) room.tick();
  }, 1000);

  /* dọn bàn trống */
  setInterval(() => {
    for(const room of [...rooms.values()]){
      if(!room.players.length && Date.now() - room.createdAt > 60000) rooms.delete(room.key);
    }
  }, 60000);

  return { handle, hallList, HALLS, STAKES, rooms };
}

module.exports = { createCards, HALLS, STAKES };

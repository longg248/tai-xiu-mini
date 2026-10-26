/* =====================================================================
   KẾT NỐI SERVER — REST API & SSE REALTIME STREAM
   ===================================================================== */
/* =====================================================================
   KẾT NỐI SERVER — vòng cược 60s chung cho mọi client
   REST: bet/cancel/reward/auth · SSE: tick/round/result (realtime)
   ===================================================================== */
const CFG_PHASES={ betting:50, locked:5, result:5 };
const Net={
  online:false, token:localStorage.getItem('tx_token')||'', es:null,
  phase:'connecting', left:0, roundId:0, players:0, meBal:null, me:null, leaderboard:null,
  durs:{...CFG_PHASES},
  async api(path, body){
    try{
      const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},
        body:body===undefined?'{}':JSON.stringify(body)});
      return await r.json();
    }catch(e){ return {ok:false,error:'Không gọi được máy chủ'}; }
  },
  async sync(){
    try{
      const r=await fetch('/api/state?t='+Date.now()+(this.token?'&token='+encodeURIComponent(this.token):''),{cache:'no-store'});
      const j=await r.json();
      if(!j.ok) throw 0;
      this.setOnline(true);
      if(j.durs) this.durs=j.durs;
      this.leaderboard=j.leaderboard||null;
      this.me=j.me||null;
      this.applyTick(j);
      if(j.me) this.applyMe(j.me);
      this.applyHistory(j.history||[]);
      /* cập nhật BXH lobby nếu đang mở */
      if($('homeScreen').classList.contains('open') && $('lobRank')) renderHome();
      /* phát hiện kết quả mới qua polling (dự phòng khi SSE bị chặn/đứng yên) */
      const newest=j.history&&j.history[0];
      if(newest){
        if(this._lastResultRound===undefined) this._lastResultRound=newest.roundId;
        else if(newest.roundId>this._lastResultRound && newest.serverSeed){
          this._lastResultRound=newest.roundId;
          onRoundResult({roundId:newest.roundId, dice:newest.dice, sum:newest.sum, result:newest.result,
              serverSeed:newest.serverSeed, serverSeedHash:newest.serverSeedHash, hmac:newest.hmac,
              pools:j.pools, me:j.me});
        }
      }
      return true;
    }catch(e){ this.setOnline(false); return false; }
  },
  setOnline(v){
    if(this.online===v) return;
    this.online=v;
    const b=$('netBanner'); if(b) b.classList.toggle('show', !v);
    if(!v){
      this._retry=setInterval(async()=>{ if(await this.sync()){ clearInterval(this._retry); this._retry=null; this.connect(); } },3000);
    } else if(this._retry){ clearInterval(this._retry); this._retry=null; }
    refresh();
  },
  applyMe(me){
    this.meBal=me.balance;
    state.balance=me.balance;
    state.myBet=me.bet?{side:me.bet.side, amount:me.bet.amount}:null;
    if(me.bet){
      state.side=me.bet.side;
      els.cellTai.textContent=me.bet.side==='tai'?fmtDot(me.bet.amount):'0';
      els.cellXiu.textContent=me.bet.side==='xiu'?fmtDot(me.bet.amount):'0';
    }
    refresh();
  },
  applyHistory(list){
    /* Lịch sử bàn (soi cầu) — KHÔNG ghi đè state.history (lịch sử cược cá nhân) */
    state.rounds=list.map(h=>({sum:h.sum,result:h.result,dice:h.dice,roundId:h.roundId}));
    renderRoadmap();
    if($('histOverlay').classList.contains('open')) renderHist();
  },
  applyTick(t){
    const oldPhase = this.phase;
    if(t.durs) this.durs=t.durs;
    this.phase=t.phase; this.roundId=t.roundId; this.players=t.players||0;
    /* mốc nội suy: server gửi msLeft chính xác, client tự vẽ mượt mỗi 100ms */
    this.msLeft = (typeof t.msLeft==='number') ? t.msLeft : (t.left*1000);
    this.left = Math.max(0, Math.ceil(this.msLeft/1000));
    this._tickAt = performance.now();
    if(t.pools){ state.poolTai=t.pools.tai; state.poolXiu=t.pools.xiu; }
    state.rolling = t.phase!=='betting';      /* chốt cược + kết quả = khóa bàn */

    /* Chuyển sang phase locked (Chốt cược) → xóc đĩa suốt giai đoạn chốt cược.
       (bỏ qua khi đang ở sảnh/bàn bài để không nghe tiếng xúc xắc)
       Lưu ý: KHÔNG kiểm tra Dish.opened ở đây — cờ đó còn true từ ván trước (đĩa đã bay đi),
       sẽ khiến ván mới không được xóc. Dish.shake() tự gọi cover() để reset. */
    const inCards = (typeof CardsUI !== 'undefined' && !!CardsUI.active);
    if(!inCards && oldPhase==='betting' && t.phase==='locked' && !Dish.shaking){
      Dish.shake(Math.max(600, Math.min(4800, this.msLeft - 300)));
    }

    const bar=$('roundBar');
    if(bar){
      bar.dataset.phase=t.phase;
      $('rbPhase').textContent = t.phase==='betting'?'MỞ CƯỢC':t.phase==='locked'?'CHỐT CƯỢC — XÓC ĐĨA':'KẾT QUẢ';
      $('rbRound').textContent='#'+t.roundId;
      $('rbPlayers').textContent='👥 '+t.players;
      this.paintClock();
    }
    const fh=$('fairHashShort'); if(fh&&t.serverSeedHash) fh.textContent=t.serverSeedHash.slice(0,10)+'…'+t.serverSeedHash.slice(-6);
    refresh();
  },
  /* vẽ lại đồng hồ từ mốc msLeft — không phụ thuộc nhịp tick mạng */
  paintClock(){
    if(this._tickAt==null) return;
    const bar=$('roundBar'); if(!bar) return;
    const ms=Math.max(0, this.msLeft-(performance.now()-this._tickAt));
    const total=((this.durs&&this.durs[this.phase])||60)*1000;
    const tm=$('rbTime'); if(tm) tm.textContent=Math.ceil(ms/1000)+'s';
    const fill=$('rbFill'); if(fill) fill.style.width=(Math.max(0,Math.min(1,ms/total))*100).toFixed(1)+'%';
  },
  startClock(){
    if(this._ck) return;
    this._ck=setInterval(()=>this.paintClock(),100);
  },
  connect(){
    if(this.es) this.es.close();
    try{
      this.es=new EventSource('/api/stream'+(this.token?'?token='+encodeURIComponent(this.token):''));
      this.es.onopen=()=>this.setOnline(true);
      this.es.onerror=()=>this.setOnline(false);
      this.es.onmessage=ev=>{
        let m; try{ m=JSON.parse(ev.data); }catch(e){ return; }
        if(m.event==='tick'||m.event==='hello') this.applyTick(m);
        else if(m.event==='round') this.applyTick({phase:m.phase,left:m.left,msLeft:m.msLeft,roundId:m.roundId,serverSeedHash:m.serverSeedHash,pools:{tai:0,xiu:0},players:0,durs:this.durs});
        else if(m.event==='result'){ this._lastResultRound=m.roundId; this._sseResults=true; onRoundResult(m); }
      };
    }catch(e){ this.setOnline(false); }
    this.startWatchdog();
  },
  /* watchdog: SSE đứng yên >9s (mất gói/nửa chết) → bắt kết nối lại + sync */
  startWatchdog(){
    if(this._wd) return;
    this._lastSig=''; this._stale=0;
    this.startClock();          /* đồng hồ nội suy 100ms */
    this._wd=setInterval(()=>{
      if(!this.online) return;
      const sig=this.phase+'|'+this.left+'|'+this.roundId;
      if(sig===this._lastSig){
        this._stale+=1;
        if(this._stale>=3){
          this._stale=0;
          this.connect();
          this.sync();
        }
      } else { this._stale=0; this._lastSig=sig; }
    },1000);
    /* polling fallback mỗi 1s để phát hiện kết quả nhanh khi SSE bị chặn */
    this._poll=setInterval(()=>{ if(this.online) this.sync(); },1000);
  }
};
/* cộng/trừ số dư qua server (wheel, khuyến mãi, VIP) — offline thì trừ local */
async function addReward(amount){
  if(Net.online && Net.token){
    const r=await Net.api('reward',{token:Net.token, amount});
    if(r.ok){ state.balance=r.balance; Net.meBal=r.balance; return true; }
    toast(r.error||'Không thực hiện được'); return false;
  }
  state.balance+=amount; return true;
}
function renderHistIfOpen(){ if($('histOverlay').classList.contains('open')) renderHist(); }



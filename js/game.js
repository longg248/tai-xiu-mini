/* =====================================================================
   LOGIC BÀN CHƠI TÀI XỈU, TRẠNG THÁI & CƯỢC
   ===================================================================== */
/* ---------- CÀI ĐẶT + LƯU TIẾN TRÌNH ---------- */
const settings = { sound:true, countdown:true, confetti:true, theme:'gold', rngMode:'fair' };
const stats = { rounds:0, wins:0, losses:0, winAmt:0, loseAmt:0, best:0, worst:0, streak:0, streakType:'' };
let SAVE_KEY='taixiu_save_v1';   /* đổi theo tài khoản sau khi đăng nhập */
function saveKeyFor(u){ return (!u||u.key==='guest') ? 'taixiu_save_v1' : 'taixiu_save_v1::'+u.key; }



/* ===== trạng thái =====*/
const state = { balance:3960000, bet:0, side:null, rolling:false, poolTai:741648460, poolXiu:741648460, history:[], rounds:[],
                promo:{ lastDaily:'', missions:0, cashback:0, notify:{} } };

const $ = id => document.getElementById(id);
const els = {
  d:[$('d1'),$('d2'),$('d3')],
  poolTai:$('poolTai'), poolXiu:$('poolXiu'),
  cellTai:$('cellTai'), cellXiu:$('cellXiu'),
  betBar:$('betBar'), bigNum:$('bigNum'),
  btnTai:$('btnTai'), btnXiu:$('btnXiu'),
  btnBet:$('btnBet'), btnCancel:$('btnCancel'), btnAllIn:$('btnAllIn'),
  chips:[...document.querySelectorAll('.chip')],
  ring:$('ring'), toast:$('toast')
};

const fmtDot   = n => n.toLocaleString('vi-VN');  /* 741.648.460 */
const fmtComma = n => n.toLocaleString('en-US');  /* 2,000,000   */

/* ===== vẽ mặt xúc xắc =====*/
const PIPS = {
  1:[[50,50]],
  2:[[28,28],[72,72]],
  3:[[26,26],[50,50],[74,74]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[26,26],[74,26],[50,50],[26,74],[74,74]],
  6:[[28,22],[72,22],[28,50],[72,50],[28,78],[72,78]]
};
function renderDie(el, v){
  const f = el.querySelector('.face'); f.innerHTML='';
  PIPS[v].forEach(([x,y])=>{
    const p=document.createElement('div'); p.className='pip';
    p.style.left=x+'%'; p.style.top=y+'%'; f.appendChild(p);
  });
}
els.d.forEach(d=>renderDie(d, Math.floor(Math.random()*6)+1));

/* ===== cập nhật UI =====*/
function refresh(){
  els.poolTai.textContent = fmtDot(state.poolTai);
  els.poolXiu.textContent = fmtDot(state.poolXiu);
  els.betBar.textContent  = fmtComma(state.bet);
  /* ô số lớn: đóng băng trong lúc trận chạy để tiền thưởng không "dính" vào kết quả trận */
  const showBal = (state.rolling && typeof state._frozenBal==='number') ? state._frozenBal : state.balance;
  const balTxt = `<span class="plus">+</span>${fmtComma(showBal)}`;
  if(els.bigNum._t !== balTxt){ els.bigNum._t = balTxt; els.bigNum.innerHTML = balTxt; }   /* chỉ ghi DOM khi đổi */
  const pb=$('pageBalance'); if(pb) pb.textContent=fmtComma(state.balance);   /* số dư trên đầu trang riêng */

  els.btnTai.classList.toggle('sel', state.side==='tai');
  els.btnXiu.classList.toggle('sel', state.side==='xiu');

  /* cược chỉ mở trong phase 'betting' của ván 60s (server điều phối) */
  const betting = Net.online && Net.phase==='betting';
  const canBet = betting && state.side && state.bet>0 && state.bet<=state.balance;
  els.btnBet.disabled = !canBet;
  els.btnAllIn.disabled = !betting || state.balance<=0;
  els.btnTai.disabled = els.btnXiu.disabled = !betting;

  els.chips.forEach(c=>{
    c.classList.toggle('sel', +c.dataset.v===state.bet);
    c.classList.toggle('dim', +c.dataset.v>state.balance);
  });
}

/* ===== toast =====*/
let toastTimer;
/* bàn chơi có đang hiển thị? (sảnh chính / trang phụ mở = false) */
function tableVisible(){
  const h=$('homeScreen'), p=$('pageScreen');
  if(typeof CardsUI !== 'undefined' && CardsUI.active) return false;   /* đang ở sảnh/bàn bài → không báo ván tài xỉu */
  return !(h&&h.classList.contains('open')) && !(p&&p.classList.contains('open'));
}
function cardsActive(){
  return typeof CardsUI !== 'undefined' && !!CardsUI.active;
}
function toast(msg, ms=2200, tableOnly){
  if(tableOnly && !tableVisible()) return;   /* không đè thông báo ván lên sảnh chính */
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>els.toast.classList.remove('show'), ms);
}

/* ===== chọn cược / phe =====*/
els.chips.forEach(c=>c.addEventListener('click',()=>{
  if(state.rolling) return;
  const v = +c.dataset.v;
  if(state.bet + v > state.balance){
    if(state.bet < state.balance){
      state.bet = state.balance;
      toast('Đã cộng tối đa theo số dư (' + fmtComma(state.balance) + ')');
    } else {
      toast('Số dư không đủ để cộng thêm ' + fmtComma(v) + '!');
      return;
    }
  } else {
    state.bet += v;
  }
  c.classList.add('pop');
  setTimeout(()=>c.classList.remove('pop'), 180);
  Sound.chip();
  refresh();
}));

/* Bấm vào thanh cược để đặt lại cược về 0 */
els.betBar.addEventListener('click',()=>{
  if(state.rolling || state.myBet) return;
  state.bet = 0;
  Sound.chip();
  refresh();
  toast('Đã đặt lại tiền cược về 0');
});

els.btnTai.addEventListener('click',()=>selectSide('tai'));
els.btnXiu.addEventListener('click',()=>selectSide('xiu'));

els.btnAllIn.addEventListener('click',()=>{
  if(state.rolling || state.balance<=0) return;
  state.bet = state.balance; Sound.chip(); refresh();
  if(!state.side){ toast('Đã chọn ALL-IN — hãy chọn TÀI hoặc XỈU!'); return; }
  doBet(state.side);
});

els.btnCancel.addEventListener('click',()=>{
  /* hủy cược trong cửa MỞ CƯỢC → server hoàn tiền */
  if(Net.online && state.myBet && Net.phase==='betting'){
    Net.api('cancel',{token:Net.token}).then(r=>{
      if(r.ok){
        state.balance=r.balance; state.myBet=null; state.side=null; state.bet=0;
        state.poolTai=r.pools.tai; state.poolXiu=r.pools.xiu;
        els.cellTai.textContent='0'; els.cellXiu.textContent='0';
        toast('Đã hủy cược — hoàn lại tiền'); refresh();
      } else toast(r.error||'Không hủy được!');
    });
    return;
  }
  /* cháy tài khoản → server nạp lại (demo) */
  if(Net.online && state.balance<1000){
    Net.api('refill',{token:Net.token}).then(r=>{
      if(r.ok){
        state.balance=r.balance; state.side=null; state.bet=0;
        els.cellTai.textContent='0'; els.cellXiu.textContent='0';
        toast('Đã nạp lại 3,960,000 — chơi tiếp nào!'); refresh();
      } else toast(r.error||'Không nạp lại được!');
    });
    return;
  }
  state.side=null; state.bet=0;
  els.cellTai.textContent='0'; els.cellXiu.textContent='0';
  toast('Đã đặt lại mức cược về 0');
  refresh();
});

/* ===== đặt cược vào SERVER — ván 60s chung cho mọi client =====*/
async function doBet(side){
  if(!Net.online){ toast('⚠️ Chưa kết nối máy chủ — đang thử lại…'); Net.sync(); return false; }
  if(Net.phase!=='betting'){ toast('Đã chốt cược — đợi ván sau nhé!'); return false; }
  if(!side) return false;
  if(state.bet>state.balance){ toast('Không đủ số dư!'); return false; }
  const r=await Net.api('bet',{token:Net.token, side, amount:state.bet});
  if(!r.ok){
    toast(r.error||'Đặt cược thất bại!');
    if(typeof r.balance==='number'){ state.balance=r.balance; refresh(); }
    return false;
  }
  state.side=side;
  state.balance=r.balance;
  state._frozenBal=r.balance;          /* neo ô số lớn trong suốt ván */
  state.myBet={side, amount:state.bet};
  els.cellTai.textContent = side==='tai' ? fmtDot(state.bet) : '0';
  els.cellXiu.textContent = side==='xiu' ? fmtDot(state.bet) : '0';
  Net.applyTick(r);
  Sound.chip();
  toast((side==='tai'?'🎲 TÀI':'🎲 XỈU')+' — cược '+fmtComma(state.bet)+' · ván #'+r.roundId);
  return true;
}
els.btnBet.addEventListener('click',()=>{
  if(state.rolling) return;
  if(state.bet<=0){ toast('Bấm các phỉnh để chọn số tiền cược!'); return; }
  if(!state.side){ toast('Chọn TÀI hoặc XỈU trước!'); return; }
  doBet(state.side);
});

/* (đã chuyển lên server) — kết quả đến qua SSE 'result' → onRoundResult() */



/* ===== SERVER GỬI KẾT QUẢ → úp dĩa → KÉO lộ từng viên → đủ 3 số mới kết luận ===== */
function onRoundResult(d){
  Net.meBal = (d.me && typeof d.me.balance==='number') ? d.me.balance : null;
  state.poolTai=d.pools.tai; state.poolXiu=d.pools.xiu;
  const fair={mode:'fair', clientSeed:'round', nonce:d.roundId, dice:d.dice, sum:d.sum, result:d.result,
              serverSeed:d.serverSeed, serverSeedHash:d.serverSeedHash, hmac:d.hmac};
  const info={ hadBet:!!state.myBet, myPick:state.myBet?state.myBet.side:null, myAmt:state.myBet?state.myBet.amount:0 };
  state.rolling=true;
  /* soi cầu: ghi kết quả bàn ngay khi server trả về (chấm đen/trắng hiện tức thì) */
  state.rounds=state.rounds||[];
  if(!state.rounds.length || state.rounds[0].roundId!==d.roundId){
    state.rounds.unshift({roundId:d.roundId, dice:d.dice, sum:d.sum, result:d.result});
    state.rounds=state.rounds.slice(0,30);
  }
  renderRoadmap();
  /* KHUYNH HƯỚNG đang mở → cập nhật ngay ván mới */
  if(trendOpen()){
    if(Array.isArray(state.trend)){
      if(!state.trend.some(x=>x.roundId===d.roundId)){
        state.trend.unshift({roundId:d.roundId, dice:d.dice, sum:d.sum, result:d.result});
        state.trend=state.trend.slice(0,120);
      }
    }
    renderTrend();
  }
  els.d.forEach(d=>d.classList.remove('rolling'));
  els.cellTai.textContent='0'; els.cellXiu.textContent='0';
  state.myBet=null;
  revealFair(fair, info);
}
/* ===== SOI CẦU: lịch sử kết quả bàn — TÀI = chấm đen, XỈU = chấm trắng ===== */
function renderRoadmap(){
  const box=$('roadDots'); if(!box) return;
  const list=(state.rounds||[]).slice(0,24).reverse();   /* cũ → mới: kết quả mới nhất nằm bên phải */
  const sig=list.map(h=>h.roundId+':'+h.result).join(',');   /* chỉ vẽ lại khi có kết quả mới */
  if(box._sig===sig) return;
  box._sig=sig;
  box.innerHTML=list.map(h=>{
    const t=h.result==='T';
    const tip=(t?'TÀI':'XỈU')+(h.sum!=null?' · '+h.sum+' điểm':'')+(h.roundId?' · #'+h.roundId:'');
    return `<span class="road-dot ${t?'t':'x'}" title="${tip}"></span>`;
  }).join('');
  const last=box.lastElementChild; if(last) last.classList.add('new');
}

/* ===== KHUYNH HƯỚNG (phím L) — biểu đồ cầu 5×20 + bảng điểm 20×5 ===== */
const TREND_CHART_COLS=20, TREND_CHART_ROWS=5;
const TREND_SCORE_COLS=20, TREND_SCORE_ROWS=5;
const TREND_CHART_CAP=TREND_CHART_COLS*TREND_CHART_ROWS;

function trendOpen(){ const o=$('trendOverlay'); return !!(o && o.classList.contains('open')); }

function openTrend(){
  const o=$('trendOverlay'); if(!o) return;
  o.classList.add('open');
  renderTrend();          /* vẽ ngay từ dữ liệu đang có */
  loadTrend();            /* rồi lấy đủ 120 ván từ server */
}

function closeTrend(){
  const o=$('trendOverlay'); if(o) o.classList.remove('open');
}

function toggleTrend(){ trendOpen() ? closeTrend() : openTrend(); }

async function loadTrend(){
  try{
    const r=await fetch('/api/trend?t='+Date.now(),{cache:'no-store'});
    const j=await r.json();
    if(j && j.ok && Array.isArray(j.history)){
      state.trend=j.history;
      if(trendOpen()) renderTrend();
    }
  }catch(e){ /* offline / server cũ → dùng state.rounds */ }
}

/* state.trend/state.rounds luôn mới → cũ; đảo thành cũ → mới, tối đa 120 ván.
   Không sort theo roundId vì sau khi server restart, roundId có thể reset
   và các ván cũ sẽ chen lên trước các ván mới. */
function trendList(){
  const src=(state.trend && state.trend.length) ? state.trend : (state.rounds||[]);
  return src.slice(0,120).reverse();
}

function trendTip(h){
  return (h.result==='T'?'TÀI':'XỈU')+(h.sum!=null?' · '+h.sum+' điểm':'')+(h.roundId?' · #'+h.roundId:'');
}

function renderTrend(){
  const o=$('trendOverlay'); if(!o) return;
  const list=trendList();                       /* cũ → mới */
  const recent=list.slice(-TREND_CHART_CAP);    /* 100 ván mới nhất */
  const newest=recent.slice().reverse();        /* mới → cũ */
  const nT=recent.filter(h=>h.result==='T').length;
  const nX=recent.length-nT;

  /* 2 bộ đếm: chấm + SỐ VÁN (đúng ảnh, không phải %) */
  const stats=$('trendStats');
  if(stats){
    stats.innerHTML=
      `<div class="trend-stat t" aria-label="Tài ${nT} ván"><i class="trend-dot t"></i><b>${nT}</b></div>`+
      `<div class="trend-stat x" aria-label="Xỉu ${nX} ván"><i class="trend-dot x"></i><b>${nX}</b></div>`;
  }

  /* Biểu đồ: 5 hàng × 20 cột = 100 ván.
     Mới nhất ở hàng 1 cột 20; hàng 1 chạy phải→trái, hàng 2 trái→phải,
     hàng 3 phải→trái, hàng 4 trái→phải, hàng 5 phải→trái. */
  const grid=Array.from({length:TREND_CHART_ROWS},()=>Array(TREND_CHART_COLS).fill(null));
  newest.forEach((h,i)=>{
    if(i>=TREND_CHART_CAP) return;
    const row=Math.floor(i/TREND_CHART_COLS);
    const pos=i%TREND_CHART_COLS;
    const col=(row%2===0) ? (TREND_CHART_COLS-1-pos) : pos;
    grid[row][col]=h;
  });

  /* ô cũ nhất để đặt mũi tên đuôi cầu.
     Hàng đầy đủ: mũi tên hướng ra ngoài theo chiều điền của hàng.
     Hàng cuối còn thiếu: ô cũ nhất nằm giữa hàng nên luôn hướng trái. */
  let tail=null;
  if(newest.length){
    const i=Math.min(newest.length,TREND_CHART_CAP)-1;
    const row=Math.floor(i/TREND_CHART_COLS);
    const pos=i%TREND_CHART_COLS;
    const col=(row%2===0) ? (TREND_CHART_COLS-1-pos) : pos;
    const fullRow=newest.length>=(row+1)*TREND_CHART_COLS;
    const dir=fullRow ? ((row%2===0)?'left':'right') : 'left';
    tail={row,col,dir};
  }

  const chart=$('trendChart');
  if(chart){
    let html='';
    for(let r=0;r<TREND_CHART_ROWS;r++){
      const cells=grid[r];
      let last=-1;
      for(let c=0;c<TREND_CHART_COLS;c++) if(cells[c]) last=c;
      let rowHtml='';
      for(let c=0;c<TREND_CHART_COLS;c++){
        const h=cells[c];
        if(!h){ rowHtml+='<span class="trend-cell empty"></span>'; continue; }
        const t=h.result==='T';
        const cls=['trend-cell',t?'t':'x'];
        if(c<last && cells[c+1]) cls.push('line');
        if(r<TREND_CHART_ROWS-1){
          const turn=(r%2===0)?0:(TREND_CHART_COLS-1);
          if(c===turn && grid[r+1][c]) cls.push('vlink');
        }
        let extra='';
        const isHead=(r===0 && c===TREND_CHART_COLS-1);
        if(isHead){
          cls.push('head');
          extra+='<i class="trend-arrow-line right"></i><i class="trend-arrow right"></i>';
        }
        if(tail && tail.row===r && tail.col===c && !isHead){
          cls.push('tail');
          extra+=`<i class="trend-arrow-line ${tail.dir}"></i><i class="trend-arrow ${tail.dir}"></i>`;
        }
        rowHtml+=`<span class="${cls.join(' ')}" title="${trendTip(h)}"><i class="trend-dot ${t?'t':'x'}"></i>${extra}</span>`;
      }
      html+=`<div class="trend-row">${rowHtml}</div>`;
    }
    chart.innerHTML=html;
  }

  /* Bảng điểm: 20 cột × 5 hàng.
     Quét mới→cũ; mỗi cột là một chuỗi cùng bên (tối đa 5 ô);
     đổi bên hoặc đầy cột thì sang cột mới bên trái.
     Cột mới nhất ngoài cùng bên phải; trong cột, mới nhất ở trên. */
  const scores=$('trendScores');
  if(scores){
    const cols=[];                              /* mới nhất → cũ nhất */
    let cur=[], side=null;
    for(const h of newest){
      if(cols.length>=TREND_SCORE_COLS) break;
      if(cur.length && h.result!==side){
        cols.push(cur); cur=[];
        if(cols.length>=TREND_SCORE_COLS) break;
      }else if(cur.length>=TREND_SCORE_ROWS){
        cols.push(cur); cur=[];
        if(cols.length>=TREND_SCORE_COLS) break;
      }
      side=h.result;
      cur.push(h);
    }
    if(cur.length && cols.length<TREND_SCORE_COLS) cols.push(cur);

    const display=cols.slice(0,TREND_SCORE_COLS).reverse();  /* cũ → mới, trái → phải */
    const pad=TREND_SCORE_COLS-display.length;
    let html='';
    for(let r=0;r<TREND_SCORE_ROWS;r++){
      for(let c=0;c<TREND_SCORE_COLS;c++){
        const col=(c<pad)?null:display[c-pad];
        const h=col?col[r]:null;
        if(!h){ html+='<span class="trend-score empty"></span>'; continue; }
        const t=h.result==='T';
        html+=`<span class="trend-score ${t?'t':'x'}" title="${trendTip(h)}"><i>${h.sum!=null?h.sum:'—'}</i></span>`;
      }
    }
    scores.innerHTML=html;
  }
}
async function revealFair(fair, info){
  els.d.forEach(d=>{ d.querySelector('.face').innerHTML=''; d.classList.remove('pop','reveal'); });
  Dish.peeked=[false,false,false];   /* tránh trạng thái cũ của ván trước khi ván mới không kịp cover() */

  /* Đang ở sảnh bài: bỏ toàn bộ animation/âm thanh xúc xắc, chỉ cập nhật số dư.
     Vẫn úp lại đĩa (không phát âm thanh) để ván sau ở bàn Tài Xỉu hiển thị đúng. */
  if(cardsActive()){
    if(typeof Dish !== 'undefined') Dish.cover();
    settle(fair, info);
    return;
  }
  
  Dish.onPeek=i=>{                                  /* viên thứ i lộ chấm khi kéo lòi viên đó */
    renderDie(els.d[i], fair.dice[i]);
    els.d[i].classList.add('reveal');
    Sound.flip();
  };
  Dish.onUnpeek=()=>{                               /* thả tay về tâm → úp lại, che chấm */
    els.d.forEach(d=>{ d.querySelector('.face').innerHTML=''; d.classList.remove('reveal'); });
  };

  /* Kết quả về → DỪNG xóc ngay (không xóc lại lần 2 — đây là nguyên nhân trễ chính).
     Nếu vì lý do nào đó chưa từng xóc (vào trễ/mất SSE), xóc nhanh 160ms cho có nhịp. */
  if(Dish.shaking){
    Dish.stopShake();
  } else if(!Dish.opened && !(Dish._lastShakeEnd && Date.now()-Dish._lastShakeEnd < 8000)){
    await new Promise(res => Dish.shake(160, res));
  }
  await sleep(60);

  await new Promise(res=>{
    Dish.onOpen=res;
    if(Dish.opened){ Dish.onOpen=null; res(); }
    else if(!info.hadBet) setTimeout(()=>Dish.autoReveal(), 100);   /* không cược → tự mở ngay */
    else if(auto.active) setTimeout(()=>Dish.autoReveal(), 100);     /* AUTO tự mở ngay */
    else setTimeout(()=>Dish.autoReveal(), 1200);                    /* có cược: ưu tiên người chơi nặn, quá 1.2s tự mở */
  });
  await sleep(180);                                 /* dĩa bay phần lớn — không chặn kết quả lâu */
  for(let i=0;i<3;i++) if(!Dish.peeked[i]) Dish.peekAt(i);  /* đảm bảo đủ 3 số */
  els.d.forEach(d=>{
    d.classList.add('pop');
    setTimeout(()=>d.classList.remove('pop','reveal'),450);
  });
  settle(fair, info);                               /* chỉ giờ mới tính thắng/thua */
}

function settle(fair, info){
  const sum=fair.sum, isTai=fair.result==='T';
  info=info||{hadBet:false};
  const won = info.hadBet && ((info.myPick==='tai')===isTai);
  const bet=info.myAmt||0;

  setTimeout(()=>{
    const quiet = cardsActive();
    state.rolling=false; state._frozenBal=undefined; state.myBet=null;
    state.side=null; state.bet=0;
    els.cellTai.textContent='0'; els.cellXiu.textContent='0';
    if(info.hadBet){
      stats.rounds++;
      state.promo.missions++;                    /* tiến độ nhiệm vụ đặt cược (mọi ván đều tính) */
      if(won){
        state.balance += bet;                    /* server đã hoàn stake + thưởng; đồng bộ lại bên dưới */
        stats.wins++; stats.winAmt+=bet; stats.best=Math.max(stats.best,bet);
        if(stats.streakType==='W') stats.streak++; else { stats.streakType='W'; stats.streak=1; }
        if(!quiet){
          els.ring.classList.add('win');
          setTimeout(()=>els.ring.classList.remove('win'),1200);
          flash('flashGold');
          burst(bet>=1000000?220:130);
          Sound.win();
          toast(`${isTai?'TÀI':'XỈU'} • ${sum} điểm — THẮNG +${fmtComma(bet)}!`, 2200, true);
        }
      } else {
        stats.losses++; stats.loseAmt+=bet; stats.worst=Math.max(stats.worst,bet);
        state.promo.cashback += bet*0.02;       /* hoàn trả thua 2% */
        if(stats.streakType==='L') stats.streak++; else { stats.streakType='L'; stats.streak=1; }
        if(!quiet){
          shakeBoard();
          flash('flashRed');
          Sound.lose();
          toast(`${isTai?'TÀI':'XỈU'} • ${sum} điểm — THUA -${fmtComma(bet)}`, 2200, true);
        }
      }
    } else if(!quiet){
      toast(`${isTai?'TÀI':'XỈU'} • ${sum} điểm — ván #${fair.nonce}`, 2200, true);
    }
    if(typeof Net.meBal==='number') state.balance=Net.meBal;   /* server là trọng tài */
    /* chỉ ghi lịch sử các ván ĐÃ cược; ván không cược không để lại vết trong lịch sử */
    if(info.hadBet){
      state.history.unshift({sum, result:isTai?'T':'X',
        pick:info.myPick==='tai'?'T':'X', won, bet, hadBet:true,
        roundId:fair.nonce, fair});
    }
    state.history = state.history.slice(0,40);
    refresh(); saveGame(); refreshDrawer();
    if($('histOverlay').classList.contains('open')) renderHist();
    if(state._resolve){ const r=state._resolve; state._resolve=null; r(won); }
  }, 120);
}



/* ---------- CƯỢC TỰ ĐỘNG ---------- */
const auto={ active:false, total:10, done:0, pick:'tai' };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function autoChipList(){
  return [{v:2000000,t:'2M'}, ...els.chips.map(c=>({v:+c.dataset.v,t:c.textContent}))];
}
function renderAutoOpts(){
  $('optRounds').querySelectorAll('button').forEach(b=>b.classList.toggle('on', +b.dataset.n===auto.total));
  $('optSide').querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.s===auto.pick));
  $('optBetChip').innerHTML = autoChipList().map(c=>
    `<button data-v="${c.v}" class="${c.v===state.bet?'on':''}">${c.t}</button>`).join('');
  $('optBetChip').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    state.bet=+b.dataset.v; Sound.chip(); refresh(); renderAutoOpts();
  });
}
function openAutoModal(){
  if(state.side) auto.pick=state.side;
  renderAutoOpts();
  $('autoModal').classList.add('open');
}
async function startAuto(){
  if(auto.active){ auto.active=false; toast('Đã dừng AUTO'); refresh(); return; }
  if(state.rolling){ toast('Đang chốt cược — đợi ván sau!',1600); return; }
  auto.done=0; auto.active=true; state.side=auto.pick;
  $('autoStatus').innerHTML = 'AUTO chờ cửa <b>MỞ CƯỢC</b> của ván kế tiếp…';
  toast('AUTO: '+(auto.total||'∞')+' ván — '+(auto.pick==='tai'?'TÀI':'XỈU')+' • '+fmtComma(state.bet));
  while(auto.active){
    if(!Net.online){ await sleep(1000); continue; }
    if(Net.phase!=='betting'){ await sleep(600); continue; }        /* đợi cửa mở cược */
    if(state.myBet){ await sleep(500); continue; }                  /* đã cược ván này */
    if(state.bet>state.balance){ toast('Hết tiền — AUTO dừng'); break; }
    const ok=await doBet(auto.pick);
    if(!auto.active) break;
    if(ok){
      auto.done++;
      $('autoStatus').innerHTML = `Đã cược <b>${auto.done}</b>${auto.total?'/'+auto.total:''} ván — số dư <b>${fmtComma(state.balance)}</b>`;
    }
    if(auto.total && auto.done>=auto.total) break;
    await sleep(500);
  }
  auto.active=false; refresh(); saveGame();
  if(auto.total && auto.done>=auto.total) toast('Hoàn thành '+auto.done+' ván AUTO!');
}



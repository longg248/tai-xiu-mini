/* =====================================================================
   LOGIC BÀN CHƠI TÀI XỈU, TRẠNG THÁI & CƯỢC
   ===================================================================== */
/* ---------- CÀI ĐẶT + LƯU TIẾN TRÌNH ---------- */
const settings = { sound:true, countdown:true, confetti:true, theme:'gold', rngMode:'fair' };
const stats = { rounds:0, wins:0, losses:0, winAmt:0, loseAmt:0, best:0, worst:0, streak:0, streakType:'' };
let SAVE_KEY='taixiu_save_v1';   /* đổi theo tài khoản sau khi đăng nhập */
function saveKeyFor(u){ return (!u||u.key==='guest') ? 'taixiu_save_v1' : 'taixiu_save_v1::'+u.key; }



/* ===== trạng thái =====*/
const state = { balance:3960000, bet:0, side:null, rolling:false, poolTai:741648460, poolXiu:741648460, history:[],
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
  els.bigNum.innerHTML    = `<span class="plus">+</span>${fmtComma(showBal)}`;
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
  els.d.forEach(d=>d.classList.remove('rolling'));
  els.cellTai.textContent='0'; els.cellXiu.textContent='0';
  state.myBet=null;
  revealFair(fair, info);
}
async function revealFair(fair, info){
  els.d.forEach(d=>{ d.querySelector('.face').innerHTML=''; d.classList.remove('pop','reveal'); });

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

  /* Xốc đĩa: nếu chưa đang xóc (ví dụ kết nối trễ) thì xóc ngắn 500ms.
     Nếu đã xóc từ giai đoạn chốt cược (applyTick) thì bỏ qua để không trễ hai lần. */
  if(!Dish.shaking){
    await new Promise(res => Dish.shake(500, res));
  }
  await sleep(150);

  await new Promise(res=>{
    Dish.onOpen=res;
    if(Dish.opened){ Dish.onOpen=null; res(); }
    else if(!info.hadBet) setTimeout(()=>Dish.autoReveal(), 300);   /* không cược → tự mở nhanh */
    else if(auto.active) setTimeout(()=>Dish.autoReveal(), 200);     /* AUTO tự mở nhanh */
  });
  await sleep(620);                                 /* chờ animation dĩa bay */
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
  }, 550);
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



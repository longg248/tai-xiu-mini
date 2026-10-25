/* =====================================================================
   KHỞI TẠO ỨNG DỤNG, SỰ KIỆN & RESPONSIVE
   ===================================================================== */
/* =====-fit 16:9 + nhận biết mobile / xoay ngang =====*/
const stage = document.getElementById('stage');
let rotDismissed=false;

/* Tách các MÀN HÌNH GIAO DIỆN (đăng nhập, trang chủ, trang phụ, modal,
   toast) ra khỏi #stage 1600×900 và ghim cố định theo viewport thật.
   Nhờ vậy điện thoại không còn thấy giao diện thu nhỏ tí hon và laptop
   không bị sọc đen 2 bên do khung 16:9 bị co lại. */
(function detachFluidScreens(){
  ['authScreen','homeScreen','pageScreen','rotateHint','autoModal','histOverlay','toast'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.parentElement && el.parentElement.id === 'stage'){
      el.classList.add('fluid-screen');
      document.body.appendChild(el);
    }
  });
})();

function fit(){
  const vw = innerWidth, vh = innerHeight;
  const fitS   = Math.min(vw/1600, vh/900);   /* vừa khung, có thể lộ sọc */
  const coverS = Math.max(vw/1600, vh/900);   /* phủ kín, không lộ sọc */
  const desktop = vw >= 1025;
  /* Laptop/desktop: phủ kín màn hình (cắt bớt phần trang trí 2 bên) để hết sọc đen.
     Điện thoại: giữ tỉ lệ 16:9 + gợi ý xoay ngang. */
  const s = (desktop && coverS <= fitS*1.35) ? coverS : fitS;
  stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  const portrait = innerHeight>innerWidth && innerWidth<900;   /* điện thoại dựng dọc */
  document.body.classList.toggle('mobile', innerWidth<1000);
  document.body.classList.toggle('portrait', portrait);
  const hint=document.getElementById('rotateHint');
  if(hint) hint.classList.toggle('show', portrait && !rotDismissed);
}
addEventListener('resize', fit); fit();

/* ===== nền: thẻ game mờ =====*/
(function(){
  const hues=[190,45,280,150,10,210,330,90];
  for(let r=0;r<3;r++)for(let c=0;c<8;c++){
    const d=document.createElement('div'); d.className='bg-card';
    const w=150+Math.random()*40, h=96+Math.random()*26;
    d.style.cssText=`left:${40+c*194+Math.random()*16}px; top:${66+r*158+Math.random()*18}px; width:${w}px; height:${h}px;
      background:linear-gradient(180deg,hsl(${hues[(r*8+c)%8]},55%,42%),hsl(${hues[(r*8+c)%8]},60%,18%));`;
    stage.insertBefore(d, stage.firstChild);
  }
})();



/* ===== nút tròn nhỏ =====*/
$('ibHelp').onclick = ()=>toast('TÀI: 11–18 · XỈU: 3–10 · Thắng ăn 1:1', 3000);
$('ibInfo').onclick = ()=>toast('Phòng #934042 · Rút nước 2% · Tối thiểu 1K', 3000);
$('ibShare').onclick= ()=>toast('Đã sao chép liên kết phòng!');
$('ibTime').onclick  = ()=>toggleDrawer('hist');
$('ibList').onclick  = ()=>toggleDrawer('rank');
$('ibClose').onclick = ()=>{ if(confirm('Thoát trò chơi?')) location.reload(); };



/* ---------- GẮN SỰ KIỆN ---------- */
$('tbSound').onclick  = toggleSound;
$('tbHistory').onclick= ()=>toggleDrawer('hist');
$('tbStats').onclick  = ()=>toggleDrawer('stats');
$('tbAuto').onclick   = ()=>{ if(auto.active){ auto.active=false; toast('Đã dừng AUTO'); } else openAutoModal(); };
$('tbTheme').onclick  = cycleTheme;
$('tbRank').onclick   = ()=>toggleDrawer('rank');
$('fairBadge').onclick=()=>openDrawer('fair');
$('optRounds').querySelectorAll('button').forEach(b=>b.onclick=()=>{ auto.total=+b.dataset.n; Sound.chip(); renderAutoOpts(); });
$('optSide').querySelectorAll('button').forEach(b=>b.onclick=()=>{ auto.pick=b.dataset.s; Sound.chip(); renderAutoOpts(); });
$('autoClose').onclick = ()=>$('autoModal').classList.remove('open');
$('autoStart').onclick = ()=>{ $('autoModal').classList.remove('open'); startAuto(); };

/* ---------- PHÍM TẮT ---------- */
addEventListener('keydown', e=>{
  if(e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const k=(e.key||'').toLowerCase();
  if(k==='t') selectSide('tai');
  else if(k==='x') selectSide('xiu');
  else if(k===' '){ e.preventDefault(); if(!state.rolling){ if(state.side) doBet(state.side); else toast('Chọn TÀI hoặc XỈU trước!'); } }
  else if(k==='enter'){ e.preventDefault(); els.btnBet.click(); }
  else if(k==='h') els.btnCancel.click();
  else if(k==='a') els.btnAllIn.click();
  else if(k==='m') toggleSound();
  else if(k==='l') toggleDrawer('hist');
  else if(k==='s') toggleDrawer('stats');
  else if(k==='r') toggleDrawer('rank');
  else if(k==='escape'){ closeModal(); $('autoModal').classList.remove('open'); if(auto.active){ auto.active=false; toast('Đã dừng AUTO'); } }
  else if(/^[1-8]$/.test(k)){ const c=els.chips[+k-1]; if(c) c.click(); }
});



/* ---------- KHỞI TẠO ---------- */
function applySettings(){
  Sound.on = settings.sound;
  Fair.mode = settings.rngMode;
  applyTheme(settings.theme);
  $('tbSound').classList.toggle('off', !settings.sound);
}
loadGame();                             /* cài đặt + dữ liệu khách (nếu có) */
applySettings();
Fair.init();                            /* RNG local — dùng cho mini game Vòng quay */
Dish.init();
/* giả lập độ trễ mạng (ping) */
setInterval(()=>{ $('pingVal').textContent=(18+Math.floor(Math.random()*45))+'ms'; }, 2500);
refresh();
/* KẾT NỐI SERVER → ĐĂNG NHẬP → TRANG CHỦ */
(async ()=>{
  const online=await Net.sync();
  if(online) Net.connect();             /* nhận tick 1s + kết quả realtime qua SSE */
  let u=null;
  if(online && Net.me) u={key:Net.me.id, email:Net.me.email, name:Net.me.name, provider:'server'};
  else u=await Auth.init();
  if(u){
    await applyUser(u);
    openHome();
    toast((online?'Đã kết nối server — ':'')+'Xin chào '+u.name+' — chúc may mắn!', 2400);
  } else {
    openAuth();
  }
})();
$('netBanner').onclick=async()=>{ if(await Net.sync()){ location.reload(); } };

/* Sảnh bài multiplayer tự gắn sự kiện trong js/cards.js */



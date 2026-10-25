/* =====================================================================
   GIAO DIỆN, MODAL, SẢNH GAME, KHUYẾN MÃI, VIP & XÁC THỰC
   ===================================================================== */
/* =====================================================================
   ĐĂNG NHẬP / ĐĂNG KÝ — SUPABASE
   ▸ Điền SUPABASE.url + anonKey bên dưới để bật backend thật
     (tab SQL của Supabase chạy:
      create table if not exists game_saves (
        user_id text primary key,
        data jsonb not null,
        updated_at timestamptz default now());
      alter table game_saves enable row level security;
      create policy "own rows" on game_saves
        for all using (auth.uid()::text = user_id)
        with check (auth.uid()::text = user_id);)
   ▸ Chưa điền key → tự chạy CHẾ ĐỘ DEMO: tài khoản lưu trên máy này,
     mật khẩu băm SHA-256 (không lưu chữ rõ).
   ===================================================================== */
// Cấu hình Supabase (nếu có biến môi trường thì tự động kích hoạt)
window.SUPABASE = {
  url: window.SUPABASE_URL || localStorage.getItem('sb_url') || '',
  anonKey: window.SUPABASE_ANON_KEY || localStorage.getItem('sb_key') || ''
};
const SUPABASE = window.SUPABASE;

const Auth={
  user:null, sb:null,
  ACC:'taixiu_accounts_v1', SESS:'taixiu_session_v1',
  init(){
    try{
      if(SUPABASE.url && SUPABASE.anonKey && window.supabase)
        this.sb=window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey);
    }catch(e){ this.sb=null; }
    return this.restore();
  },
  accounts(){ try{ return JSON.parse(localStorage.getItem(this.ACC)||'{}'); }catch(e){ return {}; } },
  saveAccounts(a){ try{ localStorage.setItem(this.ACC, JSON.stringify(a)); }catch(e){} },
  isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
  async register(email,name,pass){
    if(Net.online){                                     /* backend server game */
      const r=await Net.api('register',{email,name,pass});
      if(!r.ok) throw new Error(r.error);
      Net.token=r.token; localStorage.setItem('tx_token',r.token);
      return {key:r.user.id, email, name:r.user.name, provider:'server'};
    }
    if(this.sb){                                        /* backend Supabase */
      const {data,error}=await this.sb.auth.signUp({email,password:pass,options:{data:{name:name||email.split('@')[0]}}});
      if(error) throw new Error(error.message);
      if(data.user && !data.session) throw new Error('OK_CONFIRM');  /* cần xác nhận email */
      const u=data.user;
      return {key:u.id, email, name:name||email.split('@')[0], provider:'supabase'};
    }
    /* demo local */
    const accs=this.accounts();
    if(accs[email]) throw new Error('Email này đã được đăng ký — hãy đăng nhập.');
    accs[email]={ name:name||email.split('@')[0], hash:await sha256Hex('tx:'+pass), created:Date.now() };
    this.saveAccounts(accs);
    localStorage.setItem(this.SESS, JSON.stringify({email}));
    return {key:email, email, name:accs[email].name, provider:'demo'};
  },
  async login(email,pass){
    if(Net.online){
      const r=await Net.api('login',{email,pass});
      if(!r.ok) throw new Error(r.error);
      Net.token=r.token; localStorage.setItem('tx_token',r.token);
      return {key:r.user.id, email, name:r.user.name, provider:'server'};
    }
    if(this.sb){
      const {data,error}=await this.sb.auth.signInWithPassword({email,password:pass});
      if(error) throw new Error(error.message==='Invalid login credentials'?'Email hoặc mật khẩu không đúng!':error.message);
      const u=data.user;
      return {key:u.id, email, name:(u.user_metadata&&u.user_metadata.name)||email.split('@')[0], provider:'supabase'};
    }
    const accs=this.accounts();
    const a=accs[email];
    if(!a) throw new Error('Tài khoản chưa tồn tại — hãy đăng ký trước.');
    if(a.hash!==await sha256Hex('tx:'+pass)) throw new Error('Mật khẩu không đúng!');
    localStorage.setItem(this.SESS, JSON.stringify({email}));
    return {key:email, email, name:a.name, provider:'demo'};
  },
  guest(){
    localStorage.setItem(this.SESS, JSON.stringify({guest:true}));
    return {key:'guest', email:'—', name:'Khách demo', provider:'demo'};
  },
  async guestServer(){
    const r=await Net.api('guest',{});
    if(!r.ok) return null;
    Net.token=r.token; localStorage.setItem('tx_token',r.token);
    return {key:r.user.id, email:'—', name:r.user.name, provider:'server'};
  },
  async logout(){
    saveGame();
    if(this.user && this.user.provider==='server'){
      await Net.api('logout',{token:Net.token});
      localStorage.removeItem('tx_token');
      location.reload(); return;
    }
    try{ if(this.sb) await this.sb.auth.signOut(); }catch(e){}
    localStorage.removeItem(this.SESS);
    location.reload();
  },
  async restore(){
    try{
      if(this.sb){
        const {data}=await this.sb.auth.getSession();
        if(data && data.session && data.session.user){
          const u=data.session.user;
          return {key:u.id, email:u.email||'—',
                  name:(u.user_metadata&&u.user_metadata.name)||((u.email||'player').split('@')[0]),
                  provider:'supabase'};
        }
        return null;
      }
      const s=JSON.parse(localStorage.getItem(this.SESS)||'null');
      if(!s) return null;
      if(s.guest) return {key:'guest', email:'—', name:'Khách demo', provider:'demo'};
      const a=this.accounts()[s.email];
      if(!a) return null;
      return {key:s.email, email:s.email, name:a.name, provider:'demo'};
    }catch(e){ return null; }
  }
};
/* đồng bộ tiến trình lên bảng game_saves (chỉ khi dùng Supabase) */
async function cloudSave(key,payload){
  if(!Auth.sb || !Auth.user || Auth.user.provider!=='supabase') return;
  try{ await Auth.sb.from('game_saves').upsert({user_id:key, data:payload, updated_at:new Date().toISOString()},{onConflict:'user_id'}); }catch(e){}
}
async function cloudLoad(key){
  if(!Auth.sb) return null;
  try{
    const {data,error}=await Auth.sb.from('game_saves').select('data').eq('user_id',key).maybeSingle();
    if(!error && data && data.data) return typeof data.data==='string'?JSON.parse(data.data):data.data;
  }catch(e){}
  return null;
}

function saveGame(){
  const payload={
    b:state.balance, h:state.history.slice(0,40), s:stats, set:settings,
    pt:state.poolTai, px:state.poolXiu, pr:state.promo
  };
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); }catch(e){}
  cloudSave(Auth.user?Auth.user.key:'', payload);   /* đẩy lên Supabase (nếu có) — fire & forget */
}
function loadGame(){
  try{
    const d=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(!d) return false;
    if(typeof d.b==='number') state.balance=d.b;
    if(Array.isArray(d.h)) state.history=d.h;
    Object.assign(stats, d.s||{});
    Object.assign(settings, d.set||{});
    if(typeof d.pt==='number') state.poolTai=d.pt;
    if(typeof d.px==='number') state.poolXiu=d.px;
    if(d.pr) Object.assign(state.promo, d.pr);
    return true;
  }catch(e){ return false; }
}



/* ---------- GIAO DIỆN (THEME) ---------- */
const THEMES = {
  gold:{ name:'Vàng cổ điển', vars:{
    '--b1':'#f0c040','--b2':'#c9971e','--b3':'#5a3a18','--b4':'#8a5a2b','--hl':'#f6d77a','--chip':'#b08d57',
    '--boardBg':'linear-gradient(180deg,#33220f 0%,#1c1208 45%,#261708 100%)',
    '--stageBg':'radial-gradient(ellipse at 50% 38%,#2b1a0c 0%,#180f07 45%,#0b0704 100%)' } },
  ruby:{ name:'Đỏ ruby', vars:{
    '--b1':'#ff5f72','--b2':'#c22b45','--b3':'#4a0f1c','--b4':'#8a1830','--hl':'#ffa8b4','--chip':'#b26472',
    '--boardBg':'linear-gradient(180deg,#3a1018 0%,#1c070d 45%,#2c0c14 100%)',
    '--stageBg':'radial-gradient(ellipse at 50% 38%,#38131a 0%,#1c070c 45%,#0d0405 100%)' } },
  neon:{ name:'Xanh neon', vars:{
    '--b1':'#3ad9ff','--b2':'#1b7fa6','--b3':'#0b2f3f','--b4':'#12566e','--hl':'#a8ecff','--chip':'#3f8fa5',
    '--boardBg':'linear-gradient(180deg,#082a36 0%,#04141c 45%,#062330 100%)',
    '--stageBg':'radial-gradient(ellipse at 50% 38%,#0a3242 0%,#051820 45%,#020a0e 100%)' } },
  rose:{ name:'Tím hồng', vars:{
    '--b1':'#cf72df','--b2':'#8b3fae','--b3':'#331343','--b4':'#5f2879','--hl':'#eeb6f6','--chip':'#a367b8',
    '--boardBg':'linear-gradient(180deg,#2b1039 0%,#160720 45%,#220d2f 100%)',
    '--stageBg':'radial-gradient(ellipse at 50% 38%,#331346 0%,#1a0826 45%,#0b0410 100%)' } }
};
const themeKeys = Object.keys(THEMES);
function applyTheme(key){
  const t=THEMES[key]||THEMES.gold;
  Object.entries(t.vars).forEach(([k,v])=>stage.style.setProperty(k,v));
  settings.theme=key;
}
function cycleTheme(){
  const i=themeKeys.indexOf(settings.theme);
  const next=themeKeys[(i+1)%themeKeys.length];
  applyTheme(next); saveGame(); refreshDrawer(); toast('Giao diện: '+THEMES[next].name);
}
function themeName(){ return (THEMES[settings.theme]||THEMES.gold).name; }

/* ---------- HIỆU ỨNG ---------- */
function flash(id){
  const el=$(id); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
function shakeBoard(){
  const b=document.querySelector('.board');
  b.classList.remove('lose'); void b.offsetWidth; b.classList.add('lose');
}
const fx=$('fx'), fxc=fx.getContext('2d');
let parts=[], fxOn=false, fxTimer=null;
function burst(n=130){
  if(!settings.confetti) return;
  if(document.body.classList.contains('mobile')) n=Math.round(n*.4);   /* mobile: giảm ~60% hạt */
  const colors=['#f0c040','#f6d77a','#ff5f72','#ffffff','#c9971e'];
  for(let i=0;i<n;i++){
    parts.push({
      x:800+Math.random()*220, y:380+Math.random()*70,
      vx:(Math.random()-.5)*10, vy:Math.random()*-10-3,
      rot:Math.random()*Math.PI, vr:(Math.random()-.5)*.34,
      size:5+Math.random()*8, color:colors[(Math.random()*colors.length)|0],
      shape:Math.random()<.5?'rect':'circle', life:160
    });
  }
  if(!fxOn){ fxOn=true; tickFx(); }
}
function tickFx(){
  fxc.clearRect(0,0,1600,900);
  parts=parts.filter(p=>p.life-->0 && p.y<940);
  parts.forEach(p=>{
    p.x+=p.vx; p.y+=p.vy; p.vy+=.22; p.vx*=.995; p.rot+=p.vr;
    fxc.save(); fxc.translate(p.x,p.y); fxc.rotate(p.rot); fxc.fillStyle=p.color;
    if(p.shape==='rect') fxc.fillRect(-p.size/2,-p.size/3,p.size,p.size*.66);
    else { fxc.beginPath(); fxc.arc(0,0,p.size/2,0,7); fxc.fill(); }
    fxc.restore();
  });
  if(parts.length) fxTimer=setTimeout(tickFx,16);
  else { fxOn=false; fxc.clearRect(0,0,1600,900); }
}

/* ---------- ĐẾM NGƯỢC ---------- */
function countdown(n){
  return new Promise(res=>{
    const el=$('countdown'); let i=n;
    const step=()=>{
      if(state._abort){ el.classList.remove('show'); res(false); return; }
      if(i<=0){ el.classList.remove('show'); res(true); return; }
      el.textContent=i; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      Sound.tick(); i--; setTimeout(step,700);
    };
    step();
  });
}

/* ---------- NGĂN KÉO: LỊCH SỬ / THỐNG KÊ / BXH ---------- */
/* drawer cũ đã tách thành trang riêng — xem openDrawer() */
function selectSide(s){
  if(state.rolling) return;
  state.side=s; Sound.click(); refresh();
  if(state.bet<=0){
    toast((s==='tai'?'🎲 Đã chọn TÀI':'🎲 Đã chọn XỈU')+' — bấm các chip bên dưới để cộng tiền cược!', 2200);
  }
}
function toggleSound(){
  settings.sound=!settings.sound; Sound.on=settings.sound;
  $('tbSound').classList.toggle('off', !settings.sound);
  if(settings.sound){ Sound.init(); Sound.chip(); }
  saveGame(); refreshDrawer();
}
const DRAWER_TITLES={hist:'LỊCH SỬ VÁN CƯỢC',stats:'THỐNG KÊ & CÀI ĐẶT',fair:'PROVABLY FAIR — KIỂM CHỨNG',rank:'BẢNG XẾP HẠNG'};
let curDrawerTab=null;

/* ===== LỊCH SỬ TÀI/XỈU: PANEL ĐÈ TRỰC TIẾP LÊN BÀN SÒNG BẠC ===== */
function renderHist(){
  $('histRoad').innerHTML=buildRoad();
  const nT=state.history.filter(h=>h.result==='T').length;
  $('histLegend').innerHTML=
    `<span class="tag t">TÀI ${nT}</span><span class="tag x">XỈU ${state.history.length-nT}</span>`+
    `<span style="margin-left:auto">TỔNG ${state.history.length} VÁN</span>`;
  $('histList').innerHTML = state.history.length ? state.history.slice(0,30).map((h,i)=>`
    <div class="hist-row">
      <span>#${state.history.length-i}</span>
      <span class="tag ${h.result==='T'?'t':'x'}">${h.result}</span>
      <span>${h.sum} đ</span>
      ${h.hadBet ? `<span>Cược ${h.pick==='T'?'TÀI':'XỈU'} · ${fmtDot(h.bet)}</span>
      <span class="${h.won?'res-ok':'res-no'}">${h.won?'THẮNG':'THUA'}</span>` : '<span class="res-no">—</span>'}
    </div>`).join('')
    : '<div style="padding:22px;text-align:center;color:#8a7a58">Chưa có ván nào — đặt cược để xem lịch sử!</div>';
}
function openHist(){ renderHist(); $('histOverlay').classList.add('open'); Sound.click(); }
function closeHist(){ $('histOverlay').classList.remove('open'); }
function toggleHist(){
  if($('histOverlay').classList.contains('open')) closeHist();
  else { if(pageOpen) closeModal(); closeHome(); openHist(); }   /* mở đè lên bàn, đóng trang chủ nếu đang mở */
}
$('histClose').onclick=closeHist;

function openDrawer(tab){
  if(tab==='hist'){ closeModal(); closeHome(); openHist(); return; }   /* lịch sử luôn đè lên bàn cờ */
  const chips=['hist','stats','fair','rank'].map(t=>
    `<button class="dtab ${t===tab?'active':''}" data-tab="${t}">${{hist:'LỊCH SỬ',stats:'THỐNG KÊ',fair:'FAIR',rank:'BXH'}[t]}</button>`).join('');
  openModal(DRAWER_TITLES[tab],
    `<div class="page-tabs">${chips}</div>`+
    `<div id="tabHist" class="dbody"></div><div id="tabStats" class="dbody" style="display:none"></div>`+
    `<div id="tabFair" class="dbody" style="display:none"></div><div id="tabRank" class="dbody" style="display:none"></div>`);
  curDrawerTab=tab;
  $('infoBody').querySelectorAll('.dtab[data-tab]').forEach(b=>b.onclick=()=>{
    if(b.dataset.tab!==curDrawerTab) openDrawer(b.dataset.tab);
  });
  ['hist','stats','fair','rank'].forEach(t=>{
    const box=$('tab'+t.charAt(0).toUpperCase()+t.slice(1));
    box.style.display=(t===tab)?'block':'none';
  });
  refreshDrawer();
}
function toggleDrawer(tab){
  if(tab==='hist'){ toggleHist(); return; }        /* nút trên bàn → panel đè lên bàn */
  if(pageOpen && curDrawerTab===tab){ closeModal(); return; }
  openDrawer(tab);
}
function buildRoad(){
  const cols=[];
  state.history.slice(0,30).reverse().forEach(h=>{
    const k=h.result;
    if(!cols.length || cols[cols.length-1].k!==k) cols.push({k,items:[]});
    cols[cols.length-1].items.push(k);
  });
  return cols.map(c=>`<div class="road-col">${c.items.slice(0,8).map(k=>`<div class="bead ${k==='T'?'t':'x'}"></div>`).join('')}</div>`).join('')
      || '<div style="color:#8a7a58;font-size:12px">Chưa có dữ liệu</div>';
}
function refreshDrawer(){
  if(!curDrawerTab || !$('tabHist')) return;   /* trang drawer không mở → bỏ qua */

  /* --- LỊCH SỬ --- */
  $('tabHist').innerHTML = `
    <div class="road-cap">XU HƯỚNG 30 VÁN GẦN NHẤT (ĐỎ = TÀI • XANH = XỈU)</div>
    <div class="road">${buildRoad()}</div>
    <div class="road-cap">CHI TIẾT CÁC VÁN</div>
    ${ state.history.length ? state.history.slice(0,20).map((h,i)=>`
      <div class="hist-row">
        <span>#${state.history.length-i}</span>
        <span class="tag ${h.result==='T'?'t':'x'}">${h.result}</span>
        <span>${h.sum} đ</span>
        ${h.hadBet ? `<span>Cược ${h.pick==='T'?'TÀI':'XỈU'} · ${fmtDot(h.bet)}</span>
        <span class="${h.won?'res-ok':'res-no'}">${h.won?'THẮNG':'THUA'}</span>` : '<span class="res-no">—</span>'}
      </div>`).join('')
      : '<div style="padding:24px;text-align:center;color:#8a7a58">Chưa có ván nào.<br>Hãy đặt cược để xem lịch sử!</div>'}`;

  /* --- THỐNG KÊ --- */
  const wr = stats.rounds ? Math.round(stats.wins/stats.rounds*100) : 0;
  const net = stats.winAmt-stats.loseAmt;
  $('tabStats').innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="k">Tổng số ván</div><div class="v">${stats.rounds}</div></div>
      <div class="stat"><div class="k">Tỷ lệ thắng</div><div class="v">${wr}%</div></div>
      <div class="stat"><div class="k">Thắng / Thua</div><div class="v">${stats.wins} / ${stats.losses}</div></div>
      <div class="stat"><div class="k">Chuỗi hiện tại</div><div class="v">${stats.streak} ${stats.streakType==='W'?'✔':stats.streakType==='L'?'✖':'—'}</div></div>
      <div class="stat"><div class="k">Lãi / lỗ ròng</div><div class="v" style="color:${net>=0?'#7ee787':'#ff7b7b'}">${net>=0?'+':''}${fmtComma(net)}</div></div>
      <div class="stat"><div class="k">Số dư</div><div class="v">${fmtComma(state.balance)}</div></div>
      <div class="stat"><div class="k">Thắng lớn nhất</div><div class="v">${fmtComma(stats.best)}</div></div>
      <div class="stat"><div class="k">Thua lớn nhất</div><div class="v">${fmtComma(stats.worst)}</div></div>
    </div>
    <div class="road-cap">XÁC SUẤT XÚC XẮC 3 VIÊN</div>
    <div class="stat-grid">
      <div class="stat"><div class="k">TÀI (11–18)</div><div class="v">50.0%</div></div>
      <div class="stat"><div class="k">XỈU (3–10)</div><div class="v">50.0%</div></div>
      <div class="stat"><div class="k">Bộ ba đồng (hòa)</div><div class="v">2.8%</div></div>
      <div class="stat"><div class="k">Tổng phép thử</div><div class="v">216</div></div>
    </div>
    <div class="hint-box" style="margin:0 0 12px">Tổng 216 cách rơi (6³): mỗi phe có đúng 108 cách nên TÀI và XỈU cân bằng 50/50. Nếu áp dụng luật “bộ ba đồng là thua” thì mỗi phe còn 105/216 = 48.6%, nhà cái hưởng 2.8%.</div>
    <div class="road-cap">CÀI ĐẶT</div>
    <div class="setting-row"><span>🔊 Âm thanh hiệu ứng</span><div class="toggle ${settings.sound?'on':''}" data-set="sound"><i></i></div></div>
    <div class="setting-row"><span>⏱ Đếm ngược 3 giây</span><div class="toggle ${settings.countdown?'on':''}" data-set="countdown"><i></i></div></div>
    <div class="setting-row"><span>🎉 Pháo giấy ăn mừng</span><div class="toggle ${settings.confetti?'on':''}" data-set="confetti"><i></i></div></div>
    <div class="setting-row"><span>🎨 Giao diện: <b style="color:#ffe9a8">${themeName()}</b></span><button class="mini-btn" id="btnTheme2" style="flex:0 0 92px;height:30px">Đổi màu</button></div>
    <div class="setting-row"><span>♻️ Đặt lại tài khoản</span><button class="mini-btn danger" id="btnReset" style="flex:0 0 92px;height:30px">Reset</button></div>
    <div class="hint-box">
      <b>PHÍM TẮT</b><br>
      T / X — chọn Tài / Xỉu &nbsp;•&nbsp; SPACE — đặt cược &nbsp;•&nbsp; H — hủy<br>
      A — All-in &nbsp;•&nbsp; 1…8 — chọn múi cược &nbsp;•&nbsp; M — bật/tắt âm<br>
      L — lịch sử &nbsp;•&nbsp; S — thống kê &nbsp;•&nbsp; ESC — đóng
    </div>`;

  $('btnTheme2').onclick = ()=>{ cycleTheme(); refreshDrawer(); };
  $('btnReset').onclick = ()=>{
    if(!confirm('Đặt lại tài khoản về 3.960.000 và xoá lịch sử?')) return;
    state.balance=3960000; state.bet=2000000; state.side=null; state.history=[];
    Object.assign(stats,{rounds:0,wins:0,losses:0,winAmt:0,loseAmt:0,best:0,worst:0,streak:0,streakType:''});
    els.cellTai.textContent='0'; els.cellXiu.textContent='0';
    saveGame(); refresh(); refreshDrawer(); toast('Đã đặt lại tài khoản');
  };
  $('tabStats').querySelectorAll('.toggle').forEach(tg=>{
    tg.onclick=()=>{
      const k=tg.dataset.set;
      settings[k]=!settings[k];
      if(k==='sound'){ Sound.on=settings.sound; $('tbSound').classList.toggle('off',!settings.sound); if(settings.sound){ Sound.init(); Sound.chip(); } }
      saveGame(); refreshDrawer();
    };
  });

  /* --- PROVABLY FAIR --- */
  const lastF = state.history[0] && state.history[0].fair;
  const fairRows = state.history.filter(h=>h.fair).slice(0,10).map((h,i)=>`
    <div class="fair-row">
      <span>#${state.history.length-i}</span>
      <span>${h.fair.dice.join('+')} = ${h.sum} → ${h.result==='T'?'TÀI':'XỈU'}
        <br><span class="mono" style="font-size:10px">${(h.fair.serverSeedHash||'').slice(0,20)}…</span></span>
      <button data-i="${state.history.indexOf(h)}">VERIFY</button>
    </div>`).join('');
  $('tabFair').innerHTML = `
    <div class="road-cap">CHẾ ĐỘ TẠO NGẪU NHIÊN (RNG)</div>
    <div class="opt" style="margin-bottom:12px">
      <button data-mode="fair" class="${settings.rngMode==='fair'?'on':''}">Provably Fair</button>
      <button data-mode="mt" class="${settings.rngMode==='mt'?'on':''}">Mersenne Twister</button>
      <button data-mode="csprng" class="${settings.rngMode==='csprng'?'on':''}">CSPRNG</button>
    </div>
    <div class="fair-box">
      <div class="k">Client seed — do bạn tự đặt</div>
      <input class="seed-input" id="clientSeedInput" value="${Fair.clientSeed}" maxlength="64">
      <div style="display:flex;gap:6px;margin-top:7px">
        <button class="mini-btn" id="btnClientSeed" style="height:30px">Áp dụng</button>
        <button class="mini-btn" id="btnRandSeed" style="height:30px">Ngẫu nhiên</button>
      </div>
    </div>
    <div class="fair-box"><div class="k">Server seed hash — của ván kế tiếp</div><div class="mono">${Fair.serverSeedHash||'—'}</div></div>
    <div class="fair-box"><div class="k">Nonce (số thứ tự ván)</div><div class="mono" style="font-size:16px;color:#ffe9a8">${Fair.nonce}</div></div>
    <div class="fair-box"><div class="k">Server seed — đã mở sau ván</div><div class="mono">${Fair.revealedSeed||'—'}</div></div>
    <div class="fair-box"><div class="k">HMAC ván gần nhất</div><div class="mono">${lastF&&lastF.hmac?lastF.hmac:'—'}</div></div>
    <div class="fair-box"><div class="k">Kết quả ván gần nhất</div><div class="mono" style="font-size:15px;color:#ffe9a8">${lastF?lastF.dice.join(' + ')+' = '+lastF.sum+' → '+(lastF.result==='T'?'TÀI':'XỈU'):'—'}</div></div>
    <button class="mini-btn primary" id="btnVerify" style="width:100%;margin-bottom:8px">KIỂM CHỨNG VÁN GẦN NHẤT</button>
    <button class="mini-btn" id="btnVerifyChain" style="width:100%;margin-bottom:10px">KIỂM CHỨNG CHUỖI HASH</button>
    <div id="verifyOut" style="font-size:12px;line-height:1.7;margin-bottom:12px"></div>
    <div class="road-cap">CÁC VÁN GẦN NHẤT — BẤM ĐỂ KIỂM CHỨNG</div>
    ${fairRows || '<div style="padding:16px;text-align:center;color:#8a7a58">Chưa có dữ liệu</div>'}
    <div class="hint-box">
      <b>CÁCH HOẠT ĐỘNG</b><br>
      1. Server sinh <b>server seed</b> từ entropy cao: crypto.getRandomValues + timestamp + performance.now.<br>
      2. Gửi cho bạn <b>SHA-256(server seed)</b> trước khi cược — bạn không thể biết seed gốc.<br>
      3. Kết quả = <b>HMAC-SHA256(server seed, "round:&lt;nonce&gt;")</b>, chia 4 byte thành số 1–6 bằng rejection sampling (không lệch xác suất).<br>
      4. Sau ván, server <b>mở seed</b> để bạn tự kiểm chứng lại kết quả bằng nút VERIFY.<br>
      5. Ván sau: <b>seed mới = SHA-256(seed cũ + nonce)</b> — chuỗi hash liên tục, không thể can thiệp giữa chừng.<br>
      6. Server roll mỗi 60s — mọi người chơi đặt cược vào cùng 1 ván, kết quả là duy nhất.
    </div>`;
  $('tabFair').querySelectorAll('button[data-mode]').forEach(b=>b.onclick=()=>{
    settings.rngMode=b.dataset.mode; Fair.mode=b.dataset.mode; Fair.mt=null; Fair.mtDraws=0;
    saveGame(); refreshDrawer(); toast('RNG: '+RNG_MODES[b.dataset.mode]);
  });
  $('btnClientSeed').onclick=()=>{
    const v=($('clientSeedInput').value||'').trim()||'taixiu-club';
    Fair.clientSeed=v; saveGame(); refreshDrawer(); toast('Đã áp dụng client seed: '+v);
  };
  $('btnRandSeed').onclick=()=>{ Fair.clientSeed=randomHex(8); saveGame(); refreshDrawer(); };
  $('btnVerify').onclick=async()=>{
    /* lấy data mới nhất từ server (không cache) để verify chính xác */
    let fair=state.history[0]&&state.history[0].fair;
    if(Net.online){
      try{
        const st=await (await fetch('/api/state?token='+(Net.token||'')+'&t='+Date.now(),{cache:'no-store'})).json();
        const h0=st.history&&st.history[0];
        if(h0&&h0.serverSeed){
          fair={mode:'fair',clientSeed:'round',nonce:h0.roundId,dice:h0.dice,sum:h0.sum,
                result:h0.result,serverSeed:h0.serverSeed,serverSeedHash:h0.serverSeedHash,hmac:h0.hmac};
        }
      }catch(e){}
    }
    const r=await verifyRound(fair);
    $('verifyOut').innerHTML = r.ok===null
      ? `<span class="verify-no">${r.msg}</span>`
      : `<span class="${r.ok?'verify-ok':'verify-no'}">${r.msg}</span><br>HMAC: <span class="mono">${r.hmac||'—'}</span><br>Xúc xắc: <span class="mono">${r.dice?r.dice.join(' + '):'—'}</span>`;
  };
  $('btnVerifyChain').onclick=async()=>{
    const r=await verifyChain();
    $('verifyOut').innerHTML = r.ok===null
      ? `<span class="verify-no">${r.msg}</span>`
      : `<span class="${r.ok?'verify-ok':'verify-no'}">${r.msg}</span>`;
  };
  $('tabFair').querySelectorAll('.fair-row button').forEach(b=>b.onclick=async()=>{
    const h=state.history[+b.dataset.i];
    const r=await verifyRound(h&&h.fair);
    $('verifyOut').innerHTML = r.ok===null
      ? `<span class="verify-no">${r.msg}</span>`
      : `<span class="${r.ok?'verify-ok':'verify-no'}">${r.msg}</span><br>Xúc xắc: <span class="mono">${r.dice?r.dice.join(' + '):'—'}</span>`;
  });

  /* --- BXH --- */
  const players=[
    {n:'vipPro_Master',b:128400000},{n:'KimLong_88',b:96320000},{n:'xNganZ',b:74200000},
    {n:'Minh_Pro',b:61150000},{n:'Hung_99',b:44800000},{n:'TrangNT',b:30250000},
    {n:'★ Bạn',b:state.balance,me:true}
  ].sort((a,b)=>b.b-a.b);
  $('tabRank').innerHTML = players.map((p,i)=>`
    <div class="rank-row ${p.me?'me':''}">
      <span class="pos">${i+1}</span><span>${p.n}</span><span class="amt">${fmtComma(p.b)}</span>
    </div>`).join('') +
    `<div class="hint-box">Bảng xếp hạng mô phỏng cho phòng #934042 — số dư của bạn luôn được cập nhật theo thời gian thực.</div>`;
}



/* =====================================================================
   MODAL DÙNG CHUNG · SẢNH GAME · KHUYẾN MÃI · HỖ TRỢ · VIP · SHARE
   · MINI GAME VÒNG QUAY MAY MẮN
   ===================================================================== */
let pageOpen=false;
function openModal(title, body, actions){
  closeHome();
  curDrawerTab=null;
  $('infoTitle').textContent=title;
  $('infoBody').innerHTML=body;
  $('infoActions').innerHTML='<button class="mini-btn" id="infoCloseBtn">Đóng</button>'+(actions||'');
  $('pageScreen').classList.add('open');
  pageOpen=true;
  $('pageBalance').textContent=fmtComma(state.balance);
  $('infoCloseBtn').onclick=()=>{ closeModal(); openHome(); };   /* Đóng → về TRANG CHỦ, không lộ bàn cờ */
}
function closeModal(){ $('pageScreen').classList.remove('open'); pageOpen=false; curDrawerTab=null; }
$('autoModal').addEventListener('click',e=>{ if(e.target===$('autoModal')) $('autoModal').classList.remove('open'); });

async function copyText(txt,msg){
  try{ await navigator.clipboard.writeText(txt); toast(msg); return; }catch(e){}
  try{
    const ta=document.createElement('textarea'); ta.value=txt;
    ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast(msg);
  }catch(e){ toast('Không sao chép được — hãy copy thủ công'); }
}

/* ---------- SẢNH GAME ---------- */
const GAMES=[
  {id:'taixiu', name:'TÀI XỈU', icon:'🎲', desc:'Xúc xắc 3 viên — Tài/Xỉu', status:'live'},
  {id:'wheel',  name:'VÒNG QUAY', icon:'🎯', desc:'Quay bánh may mắn', status:'live'},
  {id:'bacca',  name:'BẮN CÁ', icon:'🐟', desc:'Bắn cá đổi thưởng', status:'soon'},
  {id:'nohu',   name:'NỔ HŨ', icon:'💎', desc:'Nổ hũ 777', status:'soon'},
  {id:'rongho', name:'RỒNG HỔ', icon:'🐉', desc:'Rồng hổ đấu bài', status:'soon'},
  {id:'xixe',   name:'LÔ XIỀN', icon:'🎫', desc:'Lô xiền 3 số', status:'soon'},
  {id:'baccarat',name:'BÀC BẢ', icon:'🃏', desc:'Baccarat trực tiếp', status:'soon'},
  {id:'poker',  name:'POKER', icon:'♠️', desc:'Texas Hold’em', status:'soon'}
];
function openLobby(focus){
  if(typeof CardsUI !== 'undefined') CardsUI.closeAll(true);
  const cards=GAMES.map(g=>{
    const live=g.status==='live';
    const notified=!!state.promo.notify[g.id];
    const status = live ? '<span class="live-dot">● ĐANG CHƠI</span>'
      : (notified ? '<span class="ok">✓ ĐÃ ĐĂNG KÝ</span>'
                  : `<button class="gc-btn" data-notify="${g.id}">Sắp có — nhận thông báo</button>`);
    return `<div class="game-card ${live?'live':''}" data-game="${g.id}">
      <div class="gc-icon">${g.icon}</div>
      <div class="gc-name">${g.name}</div>
      <div class="gc-desc">${g.desc}</div>
      <div class="gc-status">${status}</div></div>`;
  }).join('');
  openModal('SẢNH GAME MINI', `
    <div class="game-grid">${cards}</div>
    <div class="hint-box" style="margin-top:14px">
      <b>PHÒNG HIỆN TẠI</b> · Tài Xỉu #934042 — RNG Provably Fair, kiểm chứng được từng ván.<br>
      Các game còn lại đang trong giai đoạn phát triển; bấm “nhận thông báo” để được báo khi ra mắt.
    </div>`);
  $('infoBody').querySelectorAll('.gc-btn[data-notify]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const id=b.dataset.notify;
    state.promo.notify[id]=!state.promo.notify[id];
    saveGame();
    if(state.promo.notify[id]) toast('Đã đăng ký nhận thông báo cho '+GAMES.find(g=>g.id===id).name);
    openLobby(focus);
  });
  $('infoBody').querySelectorAll('.game-card[data-game]').forEach(c=>c.onclick=()=>{
    const id=c.dataset.game;
    if(id==='taixiu'){ closeModal(); toast('Bạn đang chơi Tài Xỉu — phòng #934042'); return; }
    if(id==='wheel'){ closeModal(); openWheel(); return; }
    const g=GAMES.find(x=>x.id===id);
    closeModal();
    openModal(g.name+' — SẮP RA MẮT', `
      <div style="text-align:center;padding:14px 0">
        <div style="font-size:56px">${g.icon}</div>
        <div style="font-size:18px;font-weight:900;color:#ffe9a8;margin:8px 0">${g.name}</div>
        <div style="font-size:12px;color:#9c8558;line-height:1.8">
          Trò chơi đang trong giai đoạn phát triển.<br>
          Hãy bấm nút bên dưới để nhận thông báo khi game mở cửa.<br><br>
          Trong lúc đó, bạn có thể chơi <b style="color:#ffe9a8">Tài Xỉu</b> hoặc <b style="color:#ffe9a8">Vòng Quay May Mắn</b>.
        </div>
      </div>`,
      state.promo.notify[id]
        ? '<button class="mini-btn" id="btnUnreg" style="flex:1">HỦY ĐĂNG KÝ</button>'
        : '<button class="mini-btn primary" id="btnReg" style="flex:1">NHẬN THÔNG BÁO</button>');
    const reg=$('btnReg'), unreg=$('btnUnreg');
    if(reg) reg.onclick=()=>{ state.promo.notify[id]=true; saveGame(); toast('Đã đăng ký!'); closeModal(); openHome(); };
    if(unreg) unreg.onclick=()=>{ delete state.promo.notify[id]; saveGame(); toast('Đã hủy đăng ký'); closeModal(); openHome(); };
  });
}

/* ---------- KHUYẾN MÃI ---------- */
const DAILY_GIFT=500000, MISSION_TARGET=10, MISSION_REWARD=1000000;
function todayStr(){ return new Date().toDateString(); }
function openPromo(){
  const canDaily=state.promo.lastDaily!==todayStr();
  const prog=state.promo.missions%MISSION_TARGET;
  const canMission=state.promo.missions>=MISSION_TARGET;
  const cashback=Math.floor(state.promo.cashback);
  openModal('KHUYẾN MÃI', `
    <div class="promo-card">
      <div class="pc-icon">🎁</div>
      <div class="pc-body">
        <div class="pc-title">Thưởng đăng nhập hằng ngày</div>
        <div class="pc-desc">Nhận ${fmtComma(DAILY_GIFT)} — 1 lần/ngày. Lần nhận gần nhất: ${state.promo.lastDaily||'chưa nhận'}</div>
      </div>
      <button class="claim-btn" id="claimDaily" ${canDaily?'':'disabled'}>${canDaily?'NHẬN':'ĐÃ NHẬN'}</button>
    </div>
    <div class="promo-card">
      <div class="pc-icon">🎯</div>
      <div class="pc-body">
        <div class="pc-title">Nhiệm vụ: đặt ${MISSION_TARGET} ván Tài Xỉu</div>
        <div class="pc-desc">Thưởng ${fmtComma(MISSION_REWARD)} · Đã hoàn thành ${prog}/${MISSION_TARGET} ván lượt này</div>
        <div class="mission-bar"><div class="mission-fill" style="width:${Math.min(100,prog/MISSION_TARGET*100)}%"></div></div>
      </div>
      <button class="claim-btn" id="claimMission" ${canMission?'':'disabled'}>${canMission?'NHẬN':prog+'/'+MISSION_TARGET}</button>
    </div>
    <div class="promo-card">
      <div class="pc-icon">💸</div>
      <div class="pc-body">
        <div class="pc-title">Hoàn trả thua 2%</div>
        <div class="pc-desc">Hoàn 2% tổng tiền thua trong ngày. Đang có ${fmtComma(cashback)} chờ hoàn.</div>
      </div>
      <button class="claim-btn" id="claimCash" ${cashback>0?'':'disabled'}>${cashback>0?'HOÀN':'RỖNG'}</button>
    </div>
    <div class="promo-card">
      <div class="pc-icon">👑</div>
      <div class="pc-body">
        <div class="pc-title">Quyền lợi VIP</div>
        <div class="pc-desc">Hoàn trả tăng dần theo hạng, quà hằng ngày và hỗ trợ ưu tiên.</div>
      </div>
      <button class="claim-btn" id="btnVipPromo">XEM</button>
    </div>
    <div class="hint-box">
      <b>LƯU Ý</b> — Mọi khoản thưởng được cộng trực tiếp vào số dư của bạn trong bản demo này.<br>
      Phần <b>nạp tiền</b> chưa được hỗ trợ — bạn vẫn có thể nhận thưởng miễn phí ở trên.
    </div>`);
  $('claimDaily').onclick=async()=>{
    if(state.rolling){ toast('⏳ Đang có ván cược — đợi kết quả đã nhé!'); return; }
    if(state.promo.lastDaily===todayStr()) return;
    if(!(await addReward(DAILY_GIFT))) return;
    state.promo.lastDaily=todayStr();
    saveGame(); refresh();
    toast('🎁 Đã nhận '+fmtComma(DAILY_GIFT)+'!', 2600);
    openPromo();
  };
  $('claimMission').onclick=async()=>{
    if(state.rolling){ toast('⏳ Đang có ván cược — đợi kết quả đã nhé!'); return; }
    if(state.promo.missions<MISSION_TARGET) return;
    if(!(await addReward(MISSION_REWARD))) return;
    state.promo.missions-=MISSION_TARGET;
    saveGame(); refresh();
    toast('🎯 Nhiệm vụ hoàn thành — +'+fmtComma(MISSION_REWARD)+'!', 2600);
    openPromo();
  };
  $('claimCash').onclick=async()=>{
    if(state.rolling){ toast('⏳ Đang có ván cược — đợi kết quả đã nhé!'); return; }
    const amount=Math.floor(state.promo.cashback);
    if(amount<=0) return;
    if(!(await addReward(amount))) return;
    state.promo.cashback-=amount;
    saveGame(); refresh();
    toast('💸 Hoàn trả +'+fmtComma(amount)+'!', 2600);
    openPromo();
  };
  $('btnVipPromo').onclick=()=>{ closeModal(); openVip(); };
}

/* ---------- VIP ---------- */
const VIP_TIERS=[
  {name:'ĐỒNG',   min:0,          rake:0,   daily:0,     desc:'Thành viên cơ bản'},
  {name:'BẠC',    min:10000000,   rake:0.5, daily:100000,desc:'Ưu tiên bàn chơi'},
  {name:'VÀNG',   min:50000000,   rake:1,   daily:250000,desc:'Hoàn trả tăng'},
  {name:'BẠCH KIM',min:200000000, rake:1.5, daily:500000,desc:'Rút tiền ưu tiên'},
  {name:'VVIP',   min:1000000000, rake:2,   daily:1000000,desc:'Hỗ trợ riêng 24/7'}
];
function vipInfo(){
  const wagered=stats.winAmt+stats.loseAmt;
  let idx=0;
  for(let i=0;i<VIP_TIERS.length;i++) if(wagered>=VIP_TIERS[i].min) idx=i;
  const cur=VIP_TIERS[idx], next=VIP_TIERS[idx+1]||null;
  const pct = next ? Math.min(100,(wagered-cur.min)/(next.min-cur.min)*100) : 100;
  return {idx,cur,next,wagered,pct};
}
function openVip(){
  const v=vipInfo();
  const list=VIP_TIERS.map((t,i)=>`
    <div class="benefit" style="${i===v.idx?'color:#ffe9a8;font-weight:800':''}">
      <span>${i===v.idx?'★ ':''}${t.name}</span>
      <span>${fmtComma(t.min)} · hoàn ${t.rake}% · quà/ngày ${fmtComma(t.daily)}</span>
    </div>`).join('');
  openModal('THÀNH VIÊN VIP', `
    <div class="vip-card">
      <div style="font-size:12px;color:#9c8558;letter-spacing:2px">HẠNG HIỆN TẠI</div>
      <div class="vip-tier">${v.cur.name}</div>
      <div class="vip-bar"><div class="vip-fill" style="width:${v.pct}%"></div></div>
      <div style="font-size:11px;color:#9c8558">
        ${v.next?`Cần thêm <b style="color:#ffe9a8">${fmtComma(v.next.min-v.wagered)}</b> để lên ${v.next.name}`
                 :'Bạn đã đạt hạng cao nhất — VVIP!'}
      </div>
      <div style="font-size:11px;color:#9c8558;margin-top:4px">Tổng cược: ${fmtComma(v.wagered)}</div>
    </div>
    <div class="road-cap" style="margin-top:14px">BẢNG HẠNG & QUYỀN LỢI</div>
    ${list}
    <button class="mini-btn primary" id="btnClaimVip" style="width:100%;margin-top:12px">NHẬN QUÀ HẠNG ${v.cur.name}</button>
    <div class="hint-box" style="margin-top:10px">Quà hạng VIP là <b>${fmtComma(v.cur.daily)}</b>, nhận 1 lần/ngày. Nâng hạng dựa trên tổng tiền đã cược của bạn.</div>`);
  $('btnClaimVip').onclick=async()=>{
    if(state.rolling){ toast('⏳ Đang có ván cược — đợi kết quả đã nhé!'); return; }
    const key='vip'+todayStr();
    if(state.promo.lastDaily===key){ toast('Bạn đã nhận quà VIP hôm nay'); return; }
    if(v.cur.daily<=0){ toast('Hạng hiện tại chưa có quà — hãy cược để nâng hạng!'); return; }
    if(!(await addReward(v.cur.daily))) return;
    state.promo.lastDaily=key;
    saveGame(); refresh();
    toast('👑 Đã nhận quà VIP +'+fmtComma(v.cur.daily)+'!', 2600);
    openVip();
  };
}

/* ---------- HỖ TRỢ ---------- */
const FAQS=[
  ['Tài Xỉu chơi như thế nào?','Chọn phe TÀI (tổng 11–18) hoặc XỈU (tổng 3–10), chọn múi cược rồi bấm ĐẶT CƯỢC. Ba viên xúc xắc sẽ lăn và kết quả được công bố sau 1 giây.'],
  ['Tỷ lệ thắng là bao nhiêu?','Tỷ lệ 1:1 — thắng nhận lại đúng số tiền cược (tổng 2×). Xác suất mỗi phe là 108/216 = 50%.'],
  ['Bộ ba đồng xử lý thế nào?','Trong bản này bộ ba đồng vẫn tính theo tổng điểm bình thường. Nếu áp dụng luật “bộ ba là thua”, mỗi phe còn 105/216 = 48,6% và nhà cái hưởng 2,8%.'],
  ['Game có minh bạch không?','Có. Đây là bản Provably Fair: server công bố SHA-256(server seed) trước ván cược, sau ván mở seed để bạn tự kiểm chứng bằng HMAC-SHA256 tại tab FAIR.'],
  ['Làm sao để đổi múi cược nhanh?','Bấm vào một múi ở dải 1K…50M, hoặc dùng phím tắt 1–8. Phím T/X chọn phe, SPACE đặt cược, H hủy cược.'],
  ['Tôi có thể hủy cược được không?','Có. Trong lúc đếm ngược 3 giây, bấm HỦY để hoàn lại toàn bộ số tiền cược.'],
  ['Cược tự động hoạt động ra sao?','Bấm biểu tượng ⟳ trên thanh công cụ, chọn số ván (5/10/20/50/∞), chọn phe và múi cược rồi BẮT ĐẦU. Nhấn ESC để dừng.'],
  ['Dữ liệu của tôi có được lưu không?','Có. Số dư, lịch sử và thống kê được lưu trong localStorage của trình duyệt. Bạn có thể đặt lại tài khoản trong tab THỐNG KÊ.'],
  ['Tính năng nạp tiền có chưa?','Chưa — đây là bản demo offline, mọi ván đều dùng số dư ảo. Bạn vẫn nhận được thưởng hằng ngày và hoàn trả thua ở tab Khuyến Mãi.']
];
const BOT_RULES=[
  [['tài','tai'],'TÀI là tổng 3 viên từ 11 đến 18, ăn 1:1 với xác suất 50%.'],
  [['xỉu','xiu'],'XỈU là tổng từ 3 đến 10, cũng ăn 1:1, xác suất 50%.'],
  [['thắng','thang','win'],'Chúc mừng bạn! Mở tab FAIR để tự kiểm chứng kết quả ván vừa rồi nhé.'],
  [['thua','lỗ','lo'],'Rủi ro là bản chất của trò chơi — hãy quản lý ngân sách và chơi có trách nhiệm.'],
  [['cược','cuoc','bet'],'Chọn TÀI/XỈU → chọn múi → bấm ĐẶT CƯỢC. Phím tắt: T/X chọn phe, SPACE đặt cược.'],
  [['auto'],'Cược tự động: bấm ⟳ trên thanh công cụ, chọn số ván rồi BẮT ĐẦU. ESC để dừng giữa chừng.'],
  [['fair','công bằng','cong bang','kiểm chứng','verify','chứng minh'],'Tab FAIR giúp bạn tự tính lại HMAC-SHA256 cho từng ván và kiểm tra chuỗi hash.'],
  [['nạp','nap','tiền','tien','mua'],'Tính năng nạp tiền chưa hỗ trợ trong bản demo. Bạn có thể nhận thưởng miễn phí tại tab Khuyến Mãi nhé.'],
  [['vip'],'Bấm huy hiệu tròn đỏ ở góc trên trái để xem hạng VIP và nhận quyền lợi.'],
  [['vòng quay','vong quay','wheel'],'Vòng Quay May Mắn dùng chung RNG Provably Fair của phòng nên kết quả kiểm chứng được.'],
  [['lỗi','loi','bug','sự cố'],'Bạn hãy ghi lại thông báo lỗi kèm ảnh màn hình, hệ thống ghi nhận và sẽ phản hồi sớm nhất.'],
  [['chào','hello','hi '],'Chào bạn! Mình là trợ lý ảo của phòng #934042. Bạn cần hỏi gì về luật chơi không?']
];
function botReply(text){
  const t=text.toLowerCase();
  for(const [keys,rep] of BOT_RULES) if(keys.some(k=>t.includes(k))) return rep;
  return 'Cảm ơn bạn đã liên hệ! Về câu hỏi này, bạn có thể xem mục “Hỏi đáp” phía trên hoặc nhắn lại sau — trợ lý sẽ phản hồi nhanh hơn nếu câu hỏi liên quan đến Tài/Xỉu, cược, VIP hay Provably Fair.';
}
function openSupport(){
  const faq=FAQS.map((f,i)=>`
    <div class="faq-item" data-faq="${i}">
      <div class="faq-q"><span>${f[0]}</span><span>+</span></div>
      <div class="faq-a">${f[1]}</div>
    </div>`).join('');
  openModal('HỖ TRỢ 24/7', `
    <div class="road-cap">HỎI ĐÁP THƯỜNG GẶP</div>
    ${faq}
    <div class="road-cap" style="margin-top:14px">TRÒ CHUYỆN TRỰC TIẾP</div>
    <div class="chat-box">
      <div class="chat-log" id="chatLog">
        <div class="bot">🤖 Chào bạn! Mình là trợ lý của phòng #934042. Hỏi mình về luật chơi, cược hay Provably Fair nhé.</div>
      </div>
      <div class="chat-input">
        <input id="chatInput" placeholder="Nhắn tin cho hỗ trợ..." maxlength="200">
        <button id="chatSend">Gửi</button>
      </div>
    </div>
    <div class="hint-box" style="margin-top:12px">
      <b>LIÊN HỆ</b> · Hotline 1900 9340 42 · Email: ho-tro@taixiu.demo · Giờ làm việc 24/7<br>
      Phòng hiện tại: <b style="color:#ffe9a8">#934042</b> · Ping: <b style="color:#7ee787" id="supportPing">—</b>
    </div>`);
  $('infoBody').querySelectorAll('.faq-item').forEach(it=>it.onclick=()=>{
    it.classList.toggle('open');
    it.querySelector('.faq-q span:last-child').textContent=it.classList.contains('open')?'−':'+';
  });
  const log=$('chatLog'), inp=$('chatInput');
  $('supportPing').textContent=$('pingVal').textContent;
  const send=()=>{
    const t=inp.value.trim(); if(!t) return;
    log.innerHTML+=`<div class="me">Bạn: ${t.replace(/</g,'<')}</div>`;
    inp.value=''; log.scrollTop=log.scrollHeight;
    setTimeout(()=>{
      log.innerHTML+=`<div class="bot">🤖 ${botReply(t)}</div>`;
      log.scrollTop=log.scrollHeight;
    },600);
  };
  $('chatSend').onclick=send;
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') send(); });
}

/* ---------- LUẬT CHƠI ---------- */
function openRules(){
  openModal('LUẬT CHƠI TÀI XỈU', `
    <div class="fair-box"><div class="k">Cách chơi</div>
      Ba viên xúc xắc được lắc, tổng điểm từ 3 đến 18 quyết định kết quả:
      <b style="color:#ffe9a8">TÀI = 11–18</b> · <b style="color:#ffe9a8">XỈU = 3–10</b>.
      Chọn phe, chọn múi cược rồi bấm ĐẶT CƯỢC. Thắng ăn 1:1.
    </div>
    <div class="fair-box"><div class="k">Bảng xác suất (216 cách rơi)</div>
      <div class="mono">TÀI: 108/216 = 50.0%<br>XỈU: 108/216 = 50.0%<br>Bộ ba đồng: 6/216 = 2.8%</div>
    </div>
    <div class="fair-box"><div class="k">Luật bộ ba đồng</div>
      Trong bản demo, bộ ba đồng vẫn tính theo tổng điểm. Nếu dùng luật “bộ ba là thua” thì mỗi phe còn 48,6%, nhà cái hưởng 2,8% — đây là nguồn RTP của game.
    </div>
    <div class="fair-box"><div class="k">Provably Fair</div>
      <div class="mono">serverHash = SHA256(serverSeed)<br>hmac = HMAC-SHA256(serverSeed, clientSeed:nonce)<br>dice = ánh xạ byte → 1..6 (rejection sampling)</div>
      Chuỗi hash: seed kế tiếp = SHA256(seed hiện tại + nonce). Bạn kiểm chứng tại tab FAIR.
    </div>
    <div class="fair-box"><div class="k">Giới hạn & quy tắc</div>
      Cược tối thiểu 1.000 · tối đa 50.000.000. Trong lúc đếm ngược bấm HỦY để được hoàn cược.
    </div>
    <div class="hint-box"><b>PHÍM TẮT</b> · T/X chọn phe · SPACE đặt cược · H hủy · A all-in · 1–8 chọn múi · M âm thanh · L lịch sử · S thống kê · ESC đóng</div>`);
}

/* ---------- THÔNG TIN PHÒNG ---------- */
function openRoomInfo(){
  const v=vipInfo();
  openModal('THÔNG TIN PHÒNG', `
    <div class="fair-box"><div class="k">Phòng</div><div class="mono">#934042 · Tài Xỉu · Live Table</div></div>
    <div class="fair-box"><div class="k">Nhà cái</div><div class="mono">Dealer Kim · Trực tuyến 24/7</div></div>
    <div class="fair-box"><div class="k">Giới hạn cược</div><div class="mono">Tối thiểu 1.000 · Tối đa 50.000.000</div></div>
    <div class="fair-box"><div class="k">RTP / lợi thế nhà cái</div><div class="mono">97.2% · hoàn trả 2.8% (bộ ba đồng)</div></div>
    <div class="fair-box"><div class="k">Độ trễ mạng</div><div class="mono" id="roomPing">${$('pingVal').textContent}</div></div>
    <div class="fair-box"><div class="k">RNG hiện tại</div><div class="mono">${RNG_MODES[settings.rngMode]} · nonce ${Fair.nonce}</div></div>
    <div class="fair-box"><div class="k">Hạng của bạn</div><div class="mono">${v.cur.name} · hoàn trả ${v.cur.rake}%</div></div>
    <div class="hint-box">Phòng dùng chung tiền thưởng nên biểu đồ “xu hướng” chỉ mang tính tham khảo — mỗi ván là độc lập hoàn toàn.</div>`);
}

/* ---------- CHIA SẺ ---------- */
function openShare(){
  const link='https://taixiu.demo/room/934042?client='+encodeURIComponent(Fair.clientSeed);
  openModal('CHIA SẺ PHÒNG', `
    <div class="fair-box"><div class="k">Mã phòng</div><div class="mono" style="font-size:20px;color:#ffe9a8">#934042</div></div>
    <div class="fair-box"><div class="k">Liên kết mời bạn bè</div><div class="mono">${link}</div></div>
    <div class="fair-box"><div class="k">Client seed của bạn</div><div class="mono">${Fair.clientSeed}</div></div>
    <div class="fair-box"><div class="k">Mã chia sẻ nhanh</div><div class="mono">TX-${Fair.serverSeedHash.slice(0,8).toUpperCase()}</div></div>
    <button class="mini-btn primary" id="btnCopyLink" style="width:100%;margin-top:6px">SAO CHÉP LIÊN KẾT</button>
    <button class="mini-btn" id="btnCopyCode" style="width:100%;margin-top:8px">SAO CHÉP MÃ PHÒNG</button>
    <div class="hint-box" style="margin-top:10px">Người được mời sẽ dùng chung bảng xác minh của phòng — họ có thể tự kiểm chứng từng ván.</div>`);
  $('btnCopyLink').onclick=()=>copyText(link,'Đã sao chép liên kết phòng!');
  $('btnCopyCode').onclick=()=>copyText('#934042','Đã sao chép mã phòng!');
}



/* ---------- ĐIỀU HƯỚNG ---------- */
function openHome(){ if(typeof CardsUI !== 'undefined') CardsUI.closeAll(true); $('homeScreen').classList.add('open'); renderHome(); Sound.click(); }
function closeHome(){ $('homeScreen').classList.remove('open'); }
const LOBBY_GAMES=[
  {id:'taixiu',  icon:'🎲', name:'TÀI XỈU',   cat:'mini', live:true,  bg:'linear-gradient(160deg,#3d1a52,#140a20)'},
  {id:'cards',   icon:'🃏', name:'SẢNH BÀI',  cat:'bai',  live:true,  bg:'linear-gradient(160deg,#175e34,#061d10)'},
  {id:'wheel',   icon:'🎯', name:'VÒNG QUAY', cat:'mini', live:true,  bg:'linear-gradient(160deg,#7a1fa8,#2d0a4d)'},
  {id:'xocxoc',  icon:'🥮', name:'XÓC XÓC',   cat:'mini', live:false, bg:'linear-gradient(160deg,#b3123f,#3d0512)'},
  {id:'nohu',    icon:'💎', name:'NỔ HŨ',     cat:'slot', live:false, bg:'linear-gradient(160deg,#0d3b8f,#071a3d)', jp:12048135},
  {id:'rongho',  icon:'🐉', name:'RỒNG HỔ',   cat:'bai',  live:false, bg:'linear-gradient(160deg,#8f0d2c,#2d0510)'},
  {id:'poke',    icon:'♠️', name:'POKER',     cat:'bai',  live:false, bg:'linear-gradient(160deg,#0d6b8f,#04202d)'},
  {id:'bacca',   icon:'🐟', name:'BẮN CÁ',    cat:'mini', live:false, bg:'linear-gradient(160deg,#0d8f6b,#03291e)'},
  {id:'sicbo',   icon:'🀄', name:'SICBO',     cat:'mini', live:false, bg:'linear-gradient(160deg,#c87a1f,#4d2a0a)', jp:4392400}
];
let lobCat='all';
function renderHome(){
  const v=vipInfo();
  const au=Auth.user;
  const logged=!!au && au.email!=='—' && au.key!=='guest';
  $('homeScreen').classList.toggle('logged', logged);
  $('homeBalance').textContent=fmtComma(state.balance);
  $('homeTier').textContent='Hạng '+v.cur.name;
  $('homeName').textContent=au?au.name:'Player';
  const ln=$('lobName'); if(ln) ln.textContent=au?au.name:'bạn';
  $('homeAvatar').textContent=(au?(au.name[0]||'P'):'V').toUpperCase();
  $('homeName').title=au&&au.email!=='—'?au.email:'';
  $('lobVip').innerHTML='👑 V.I.P: <b>'+v.idx+'</b>';
  $('lobAuth').style.display = logged?'none':'flex';
  $('lobUser').style.display = logged?'flex':'none';
  const lg=$('lobGreet'); if(lg) lg.style.display = logged?'block':'none';
  /* --- lưới game --- */
  $('homeGames').innerHTML=LOBBY_GAMES.filter(g=>lobCat==='all'||g.cat===lobCat).map(g=>{
    const jp = g.id==='taixiu'
      ? (Net.online? fmtComma(state.poolTai+state.poolXiu) : '—')
      : (g.jp? fmtComma(g.jp) : '');
    return `<div class="lob-tile ${g.live?'big':''}" data-lob="${g.id}" style="background:${g.bg}">
      ${g.live?'<span class="live">● LIVE</span>':'<span class="soon">SẮP CÓ</span>'}
      <div class="ic">${g.icon}</div>
      <div class="nm">${g.name}</div>
      ${jp?`<div class="jp">${jp}</div>`:''}
    </div>`;}).join('');
  $('homeGames').querySelectorAll('[data-lob]').forEach(t=>t.onclick=()=>{
    const id=t.dataset.lob; Sound.click();
    if(id==='taixiu'){ closeHome(); toast('Vào bàn #934042 — ván #'+Net.roundId); return; }
    if(id==='wheel'){ closeHome(); openWheel(); return; }
    if(id==='cards'||id==='tienlen'){ closeHome(); CardsUI.openHub('tienlen13'); return; }
    closeHome(); openLobby(id);
  });
  /* --- bảng xếp hạng từ server --- */
  const rank=(Net.leaderboard&&Net.leaderboard.length)?Net.leaderboard:[
    {name:'Kim Cương',balance:12501545},{name:'Siêu xe',balance:8691433},
    {name:'Vampire',balance:6941041},{name:'Trùm TX',balance:5201800},{name:'Player',balance:state.balance}];
  $('lobRank').innerHTML=rank.slice(0,6).map((p,i)=>`
    <div class="lob-rank-row ${au&&p.name===au.name?'me':''}">
      <div class="av">${(p.name[0]||'?').toUpperCase()}</div>
      <div class="nm"><b>${p.name}</b><span>HẠNG #${i+1}</span></div>
      <div class="jp">${fmtComma(p.balance)}</div>
    </div>`).join('');
}
/* tab danh mục + menu dưới đáy lobby */
document.querySelectorAll('#lobTabs [data-cat]').forEach(t=>t.onclick=()=>{
  lobCat=t.dataset.cat; Sound.click();
  document.querySelectorAll('#lobTabs [data-cat]').forEach(x=>x.classList.toggle('on', x===t));
  renderHome();
});
document.querySelectorAll('#homeNav [data-nav2]').forEach(b=>b.onclick=()=>{
  const a=b.dataset.nav2; Sound.click();
  if(a==='games'){ closeHome(); openLobby(); }
  else if(a==='promo'||a==='daily'||a==='mission'){ closeHome(); openPromo(); }
  else if(a==='vip'){ closeHome(); openVip(); }
  else if(a==='wheel'){ closeHome(); openWheel(); }
  else if(a==='support'){ closeHome(); openSupport(); }
  else if(a==='deposit'){ toast('Tính năng chuyển khoản / nạp tiền chưa hỗ trợ trong bản demo'); }
});
$('lobChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{
  $('lobChips').querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b));
  Sound.chip();
});
$('lobLogin').onclick=()=>{ openAuth(); setAuthMode('login'); };
$('lobReg').onclick=()=>{ openAuth(); setAuthMode('reg'); };
$('homeFairLink').onclick=()=>{ closeHome(); openDrawer('fair'); };
/* ESC từ trang chủ → về bàn chơi */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  if(typeof CardsUI !== 'undefined' && CardsUI.active){
    if(CardsUI.inRoom) CardsUI.leave();
    else CardsUI.closeAll(true);
    return;
  }
  if($('pageScreen').classList.contains('open')){ closeModal(); openHome(); return; }   /* ESC = Đóng → Trang chủ */
  if($('histOverlay').classList.contains('open')){ closeHist(); return; }              /* ESC tắt panel lịch sử — ở lại bàn */
  if($('homeScreen').classList.contains('open')){ closeHome(); }
});
$('rotDismiss').onclick=()=>{ rotDismissed=true; document.getElementById('rotateHint').classList.remove('show'); };
$('homeResume').onclick=()=>{ closeHome(); Sound.click(); };
$('homeLogout').onclick=()=>{ if(confirm('Đăng xuất khỏi tài khoản? Tiến trình đã được lưu.')) Auth.logout(); };

/* ===== GIAO DIỆN ĐĂNG NHẬP / ĐĂNG KÝ ===== */
let authMode='login';
function openAuth(){ $('authScreen').classList.add('open'); setAuthMode('login'); authNote(); }
function closeAuth(){ $('authScreen').classList.remove('open'); }
function setAuthMode(m){
  authMode=m;
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.toggle('on', t.dataset.atab===m));
  $('fName').style.display = m==='reg' ? 'block' : 'none';
  $('fPass2').style.display = m==='reg' ? 'block' : 'none';
  $('authSubmit').textContent = m==='reg' ? 'TẠO TÀI KHOẢN' : 'ĐĂNG NHẬP';
  authError('');
}
function authError(msg){ const e=$('authError'); e.textContent=msg; e.classList.toggle('show', !!msg); }
function authNote(){
  $('authNote').innerHTML = Auth.sb
    ? `🔗 Đã kết nối <b>Supabase</b>: ${SUPABASE.url.replace(/^https?:\/\//,'')}<br>Xác thực thật + tiến trình đồng bộ qua bảng <b>game_saves</b>.`
    : `🧪 CHẾ ĐỘ DEMO — chưa cấu hình Supabase. Tài khoản lưu trên máy này, mật khẩu băm <b>SHA-256</b> (không lưu chữ rõ).<br>Điền <b>SUPABASE.url</b> + <b>anonKey</b> trong mã nguồn để bật backend thật.`;
}
document.querySelectorAll('.auth-tab').forEach(t=>t.onclick=()=>{ setAuthMode(t.dataset.atab); Sound.click(); });
$('authForm').addEventListener('submit', async ev=>{
  ev.preventDefault();
  const email=$('authEmail').value.trim().toLowerCase();
  const pass=$('authPass').value;
  const name=$('authName').value.trim();
  const btn=$('authSubmit');
  try{
    if(!Auth.isEmail(email)) throw new Error('Email không hợp lệ!');
    if(pass.length<6) throw new Error('Mật khẩu phải có ít nhất 6 ký tự!');
    if(authMode==='reg' && pass!==$('authPass2').value) throw new Error('Mật khẩu nhập lại không khớp!');
    btn.disabled=true; const old=btn.textContent; btn.textContent='ĐANG XỬ LÝ…';
    let u;
    if(authMode==='reg') u=await Auth.register(email,name,pass);
    else u=await Auth.login(email,pass);
    btn.disabled=false; btn.textContent=old;
    await enterGame(u, authMode==='reg' ? 'Tài khoản đã sẵn sàng — chúc may mắn!' : 'Xin chào trở lại, '+u.name+'!');
  }catch(e){
    btn.disabled=false; btn.textContent = authMode==='reg' ? 'TẠO TÀI KHOẢN' : 'ĐĂNG NHẬP';
    if(e.message==='OK_CONFIRM') authError('✉️ Đã gửi email xác nhận (Supabase) — kiểm tra hộp thư rồi đăng nhập lại nhé.');
    else authError(e.message||'Có lỗi xảy ra!');
  }
});
$('authGuest').onclick=async()=>{
  let u=null;
  if(Net.online) u=await Auth.guestServer();     /* khách có tài khoản tạm trên server */
  if(!u) u=Auth.guest();
  await enterGame(u, 'Chơi thử không cần tài khoản — chúc may mắn!');
};
async function enterGame(u,msg){
  closeAuth();
  await applyUser(u);
  openHome();
  Sound.chip();
  toast(msg, 2600);
  if(typeof CardsUI !== 'undefined' && CardsUI._pendingHall){
    const h = CardsUI._pendingHall;
    CardsUI._pendingHall = null;
    setTimeout(() => CardsUI.openHub(h), 300);
  }
}
async function applyUser(u){
  Auth.user=u;
  SAVE_KEY=saveKeyFor(u);
  loadGame();                                    /* cài đặt cá nhân (theme, âm thanh…) */
  if(u.provider==='supabase' && Auth.sb){
    const cloud=await cloudLoad(u.key);
    if(cloud){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(cloud)); loadGame(); }catch(e){} }
  }
  if(u.provider==='server' || Net.online) await Net.sync();   /* số dư + lịch sử do server quản */
  applySettings();
  refresh();
  return true;
}
/* nút quay về trang chủ + menu điều hướng trên từng trang */
$('pageBack').onclick=()=>{ closeModal(); openHome(); };
document.querySelectorAll('[data-pnav]').forEach(el=>el.onclick=()=>{
  const a=el.dataset.pnav; closeModal();
  if(a==='games') openLobby();
  else if(a==='wheel') openWheel();
  else if(a==='promo') openPromo();
  else if(a==='vip') openVip();
  else if(a==='support') openSupport();
  else if(a==='fair') openDrawer('fair');
});

function handleNav(nav){
  if(typeof CardsUI !== 'undefined' && nav!=='cards') CardsUI.closeAll(true);
  if(nav==='home') openHome();
  else if(nav==='cards') CardsUI.openHub('tienlen13');
  else if(nav==='lobby'||nav==='games') openLobby();
  else if(nav==='wheel') openWheel();
  else if(nav==='bacca') openLobby('bacca');
  else if(nav==='promo') openPromo();
  else if(nav==='support') openSupport();
  else if(nav==='deposit') toast('Tính năng nạp tiền chưa được hỗ trợ trong bản demo');
}
document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>handleNav(el.dataset.nav));
document.querySelectorAll('[data-game]').forEach(el=>el.onclick=()=>{
  const id=el.dataset.game;
  if(id==='wheel'){ openWheel(); return; }
  if(id==='cards'||id==='tienlen'){ closeHome(); CardsUI.openHub('tienlen13'); return; }
  if(id==='taixiu'){ toast('Bạn đang chơi Tài Xỉu — phòng #934042'); return; }
  openLobby(id);
});
$('vipBadge').onclick=()=>openVip();
$('ibHelp').onclick=()=>openRules();
$('ibInfo').onclick=()=>openRoomInfo();
$('ibShare').onclick=()=>openShare();



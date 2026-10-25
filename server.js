/* =====================================================================
   TÀI XỈU MINI — GAME SERVER (client–server, không cần cài package)
   ▸ Mỗi 60s server roll Tài/Xỉu 1 lần: MỞ CƯỢC 50s → CHỐT 5s → KẾT QUẢ 5s
   ▸ Nhiều client cược chung vào cùng một ván qua SSE + REST
   ▸ Provably Fair: công bố SHA-256(serverSeed) đầu ván, mở seed sau ván,
     xúc xắc = HMAC-SHA256(serverSeed, "round:<id>") — cùng thuật toán client
   ▸ Chạy:  node server.js          (chuẩn 60s/ván)
            node server.js --fast   (15s/ván — để test nhanh)
   ===================================================================== */
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const crypto= require('crypto');
const { createCards } = require('./cards-server');

const FAST  = process.argv.includes('--fast');
const CFG = {
  /* PaaS (Render/Railway/Fly) tiêm PORT qua env — local mặc định 8099 */
  port: Number(process.env.PORT) || 8099,
  betPhase:    FAST ? 10 : 50,   /* thời gian mở cược (giây) */
  lockPhase:   FAST ?  2 :  5,   /* chốt cược — xóc đĩa */
  resultPhase: FAST ?  3 :  5,   /* hiển thị kết quả */
  minBet: 1000, maxBet: 50000000,
  startBalance: 3960000
};
/* DATA_DIR cho phép trỏ ra volume persistent (Render Disk, VPS mount...) */
const DATA_FILE = path.join(process.env.DATA_DIR || __dirname, 'tx_data.json');

/* =====================================================================
   SUPABASE BACKEND INTEGRATION (Tự động kích hoạt khi có ENV hoặc fallback file)
   ===================================================================== */
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const USE_SUPABASE = !!(SB_URL && SB_KEY);

const Supabase = {
  enabled: USE_SUPABASE,
  async req(endpoint, method='GET', body=null, headers={}){
    if(!this.enabled) return null;
    try {
      const url = `${SB_URL}/rest/v1/${endpoint}`;
      const opt = {
        method,
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          ...headers
        }
      };
      if(body) opt.body = JSON.stringify(body);
      const res = await fetch(url, opt);
      if(!res.ok) {
        const txt = await res.text();
        console.error(`[Supabase Error ${res.status}] ${endpoint}:`, txt);
        return null;
      }
      const data = await res.json().catch(()=>null);
      return data;
    } catch(e) {
      console.error('[Supabase Fetch Fail]:', e.message);
      return null;
    }
  },
  async loadAll(){
    if(!this.enabled) return false;
    try {
      const users = await this.req('users?select=*');
      if(Array.isArray(users)){
        users.forEach(u => {
          DB.users[u.email] = {
            id: u.id,
            email: u.email,
            name: u.name,
            hash: u.pass_hash,
            balance: +u.balance,
            wagered: +u.wagered,
            rounds: +u.rounds,
            guest: !!u.is_guest,
            history: []
          };
        });
      }
      const sessions = await this.req('sessions?select=*');
      if(Array.isArray(sessions)){
        sessions.forEach(s => {
          const user = Object.values(DB.users).find(u => u.id === s.user_id);
          if(user) DB.sessions[s.token] = user.email;
        });
      }
      log(`[Supabase] Đã đồng bộ ${Object.keys(DB.users).length} người chơi & ${Object.keys(DB.sessions).length} phiên đăng nhập.`);
      return true;
    } catch(e) {
      console.error('[Supabase Init Error]:', e.message);
      return false;
    }
  },
  async syncUser(u){
    if(!this.enabled || !u) return;
    try {
      await this.req('users', 'POST', {
        id: u.id,
        email: u.email,
        name: u.name,
        pass_hash: u.hash || '',
        balance: Math.round(u.balance),
        wagered: Math.round(u.wagered || 0),
        rounds: Math.round(u.rounds || 0),
        is_guest: !!u.guest
      }, { 'Prefer': 'resolution=merge-duplicates' });
    } catch(e){}
  },
  async syncSession(token, email){
    if(!this.enabled) return;
    try {
      const u = DB.users[email];
      if(!u) return;
      await this.req('sessions', 'POST', { token, user_id: u.id }, { 'Prefer': 'resolution=merge-duplicates' });
    } catch(e){}
  },
  async deleteSession(token){
    if(!this.enabled) return;
    try {
      await this.req(`sessions?token=eq.${encodeURIComponent(token)}`, 'DELETE');
    } catch(e){}
  },
  async recordRound(roundData){
    if(!this.enabled) return;
    try {
      await this.req('round_history', 'POST', {
        round_id: roundData.roundId,
        dice: roundData.dice,
        sum: roundData.sum,
        result: roundData.result,
        server_seed: roundData.serverSeed,
        server_seed_hash: roundData.serverSeedHash,
        hmac: roundData.hmac
      }, { 'Prefer': 'resolution=merge-duplicates' });
    } catch(e){}
  }
};

/* ---------- tiện ích ---------- */
const sha256  = s => crypto.createHash('sha256').update(s).digest('hex');
const hmacHex = (k,m)=> crypto.createHmac('sha256',k).update(m).digest('hex');
const rid     = ()=> crypto.randomBytes(24).toString('hex');
/* xúc xắc từ HMAC — GIỐNG HỆT diceFromBytes của client để kiểm chứng khớp */
function diceFromHmac(hmac){
  const BUCKETS=Math.floor(4294967296/6), LIMIT=BUCKETS*6;
  const dice=[]; let buf=Buffer.from(hmac,'hex'), round=0;
  while(dice.length<3){
    for(let i=0;i+4<=buf.length && dice.length<3;i+=4){
      const u=buf.readUInt32BE(i);
      if(u<LIMIT) dice.push(Math.floor(u/BUCKETS)+1);
    }
    if(dice.length<3){ round++; buf=Buffer.from(hmacHex(SEED_CUR, MSG_CUR+':'+round),'hex'); }
  }
  return dice;
}
let SEED_CUR='', MSG_CUR='';

/* ---------- lưu trữ ---------- */
let DB = { users:{}, sessions:{} };
async function loadDB(){
  try{ DB=JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }catch(e){ DB={users:{},sessions:{}}; }
  if(Supabase.enabled){
    await Supabase.loadAll();
  }
}
let saveTimer=null;
function saveDB(now){
  if(now){
    try{
      fs.mkdirSync(path.dirname(DATA_FILE), {recursive:true});
      fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    }catch(e){}
    return;
  }
  clearTimeout(saveTimer); saveTimer=setTimeout(()=>saveDB(true), 1500);
}

/* ---------- trạng thái ván ---------- */
let S = {
  roundId: 0, phase:'betting', left: CFG.betPhase,
  serverSeed:'', serverSeedHash:'', nextSeed:'',
  pools:{tai:0, xiu:0}, bets:{},   /* bets[token]={side,amount} */
  history:[]                        /* 40 ván gần nhất */
};
/* mốc kết thúc phase (ms) — đếm ngược theo đồng hồ thật, không trôi như setInterval */
let phaseEndsAt = Date.now() + CFG.betPhase*1000;
function phaseDur(p){ return p==='betting'?CFG.betPhase : p==='locked'?CFG.lockPhase : CFG.resultPhase; }
function startPhase(p){
  S.phase = p;
  const d = phaseDur(p);
  phaseEndsAt = Date.now() + d*1000;
  S.left = d;
}
function msLeftNow(){ return Math.max(0, phaseEndsAt - Date.now()); }
function newRound(){
  S.roundId++;
  /* chuỗi hash: seed ván sau = SHA256(seed ván trước + ':' + roundId) */
  S.serverSeed = S.nextSeed || crypto.randomBytes(32).toString('hex');
  S.serverSeedHash = sha256(S.serverSeed);
  S.nextSeed = sha256(S.serverSeed+':'+S.roundId);
  startPhase('betting');
  S.pools={tai:0,xiu:0}; S.bets={};
  broadcast('round', {roundId:S.roundId, serverSeedHash:S.serverSeedHash, phase:S.phase, left:S.left, msLeft:msLeftNow()});
}
function roll(){
  MSG_CUR='round:'+S.roundId; SEED_CUR=S.serverSeed;
  const hmac=hmacHex(S.serverSeed, MSG_CUR);
  const dice=diceFromHmac(hmac);
  const sum=dice[0]+dice[1]+dice[2];
  const result= sum>=11 ? 'T':'X';
  /* tổng kết cho từng người cược */
  const winners={tai:0,xiu:0};
  for(const [tok,b] of Object.entries(S.bets)){
    const u=DB.sessions[tok] && DB.users[DB.sessions[tok]];
    if(!u) continue;
    const won=(b.side==='tai')===(result==='T');
    if(won){ u.balance+=b.amount*2; winners[b.side]+=b.amount; }
    u.wagered=(u.wagered||0)+b.amount;
    u.rounds=(u.rounds||0)+1;
    u.history=u.history||[];
    u.history.unshift({roundId:S.roundId, dice, sum, result, pick:b.side==='tai'?'T':'X', won, bet:b.amount,
      fair:{mode:'fair', clientSeed:'round', nonce:S.roundId, dice, sum, result,
            serverSeed:S.serverSeed, serverSeedHash:S.serverSeedHash, hmac}});
    u.history=u.history.slice(0,40);
  }
  startPhase('result');
  const ev={
    roundId:S.roundId, dice, sum, result,
    serverSeed:S.serverSeed, serverSeedHash:S.serverSeedHash, hmac,
    pools:S.pools, winners,
    me:snapshotMe()
  };
  S.history.unshift({roundId:S.roundId, dice, sum, result,
    serverSeed:S.serverSeed, serverSeedHash:S.serverSeedHash, hmac});
  S.history=S.history.slice(0,40);
  saveDB();
  Supabase.recordRound({roundId:S.roundId, dice, sum, result, serverSeed:S.serverSeed, serverSeedHash:S.serverSeedHash, hmac});
  for(const [tok] of Object.entries(S.bets)){
    const u = DB.sessions[tok] && DB.users[DB.sessions[tok]];
    if(u) Supabase.syncUser(u);
  }
  broadcast('result', ev);
  log(`VÁN #${S.roundId}: ${dice.join('+')}=${sum} → ${result==='T'?'TÀI':'XỈU'} · ${Object.keys(S.bets).length} người cược`);
}
function snapshotMe(){
  return null; /* server gửi 'me' riêng theo từng token trong sendTo */
}

/* ---------- vòng lặp 250ms: tính theo mốc thời gian, không trôi ---------- */
setInterval(()=>{
  let ms = phaseEndsAt - Date.now();
  if(ms <= 0){
    if(S.phase==='betting') startPhase('locked');
    else if(S.phase==='locked') roll();
    else if(S.phase==='result') newRound();
    ms = phaseEndsAt - Date.now();
  }
  S.left = Math.max(0, Math.ceil(ms/1000));
  broadcast('tick', tickPayload(ms));
}, 250);

function tickPayload(ms){
  return { phase:S.phase, left:Math.max(0,S.left), msLeft:Math.max(0, Math.round(ms==null?msLeftNow():ms)),
           roundId:S.roundId, serverSeedHash:S.serverSeedHash, pools:S.pools,
           players:Object.keys(S.bets).length,
           durs:{betting:CFG.betPhase, locked:CFG.lockPhase, result:CFG.resultPhase} };
}
function leaderboard(){
  return Object.values(DB.users)
    .sort((a,b)=>b.balance-a.balance).slice(0,10)
    .map(u=>({name:u.name, balance:u.balance}));
}
function fullState(token){
  const u=token && DB.sessions[token] && DB.users[DB.sessions[token]];
  const me = u ? {id:u.id, email:u.email, name:u.name, balance:u.balance,
                  bet:S.bets[token]||null, wagered:u.wagered||0, rounds:u.rounds||0} : null;
  return { ok:true, phase:S.phase, left:Math.max(0,S.left), msLeft:msLeftNow(), roundId:S.roundId,
           serverSeedHash:S.serverSeedHash, pools:S.pools,
           players:Object.keys(S.bets).length,
           durs:{betting:CFG.betPhase, locked:CFG.lockPhase, result:CFG.resultPhase},
           history:S.history.slice(0,30), leaderboard:leaderboard(), me };
}

/* ---------- SSE + HTTP ---------- */
const sseClients=new Set();   /* {res, token} */
function broadcast(event, data){
  const payload=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for(const c of sseClients){
    /* 'me' cá nhân hóa theo token */
    let out=payload;
    if(event==='result' && c.token){
      const u=DB.sessions[c.token]&&DB.users[DB.sessions[c.token]];
      const d=JSON.parse(JSON.stringify(data));
      d.me=u?{balance:u.balance, bet:S.bets[c.token]||null}:null;
      out=`event: result\ndata: ${JSON.stringify(d)}\n\n`;
    }
    try{ c.res.write(out); }catch(e){}
  }
}
function mePayload(token){
  const u=token && DB.sessions[token] && DB.users[DB.sessions[token]];
  return u?{balance:u.balance, bet:S.bets[token]||null}:null;
}

function json(res, code, obj){
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(obj));
}
function body(req){
  return new Promise(r=>{
    let b=''; req.on('data',c=>{ b+=c; if(b.length>1e6) req.destroy(); });
    req.on('end',()=>{ try{ r(JSON.parse(b||'{}')); }catch(e){ r({}); } });
  });
}
function userByToken(token){ return token && DB.sessions[token] && DB.users[DB.sessions[token]] ? DB.users[DB.sessions[token]] : null; }
function publicUser(u){ return {id:u.id, email:u.email, name:u.name, balance:u.balance, wagered:u.wagered||0, rounds:u.rounds||0}; }
function newToken(email){ const t=rid(); DB.sessions[t]=email; return t; }

/* ---------- sảnh game bài multiplayer ---------- */
const Cards = createCards({
  getUser: userByToken,
  onBalance(token, delta){
    const u = userByToken(token);
    if(!u) return;
    u.balance = Math.max(0, Math.round((u.balance || 0) + Number(delta || 0)));
    saveDB();
    Supabase.syncUser(u);
  },
  json,
  body
});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};

const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,'http://x');
  const p=url.pathname;

  /* --- sảnh bài multiplayer (REST + SSE riêng) --- */
  if(p.startsWith('/api/cards')){
    try{
      if(await Cards.handle(req,res,url)) return;
    }catch(e){
      log('CARD API ERROR:', e.message);
      if(!res.headersSent) return json(res,500,{ok:false,error:'Lỗi sảnh bài!'});
      return;
    }
  }

  /* --- SSE stream --- */
  if(p==='/api/stream'){
    const token=url.searchParams.get('token')||'';
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store',Connection:'keep-alive'});
    res.write(`data: ${JSON.stringify({event:'hello', ...tickPayload()})}\n\n`);
    const c={res, token}; sseClients.add(c);
    const hb=setInterval(()=>{ try{res.write(':hb\n\n');}catch(e){} }, 15000);
    req.on('close',()=>{ clearInterval(hb); sseClients.delete(c); });
    return;
  }
  /* --- state --- */
  if(p==='/api/state'){
    return json(res,200, fullState(url.searchParams.get('token')||''));
  }
  /* --- auth --- */
  if(p==='/api/register' && req.method==='POST'){
    const b=await body(req);
    const email=(b.email||'').trim().toLowerCase();
    const pass=b.pass||'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res,200,{ok:false,error:'Email không hợp lệ!'});
    if(pass.length<6) return json(res,200,{ok:false,error:'Mật khẩu phải có ít nhất 6 ký tự!'});
    if(DB.users[email]) return json(res,200,{ok:false,error:'Email này đã được đăng ký — hãy đăng nhập.'});
    const u={id:rid(), email, name:(b.name||'').trim()||email.split('@')[0],
             hash:sha256('tx:'+pass), balance:CFG.startBalance, wagered:0, rounds:0, history:[], created:Date.now()};
    DB.users[email]=u;
    const token=newToken(email); saveDB(true);
    Supabase.syncUser(u);
    Supabase.syncSession(token, email);
    log('Đăng ký: '+email);
    return json(res,200,{ok:true, token, user:publicUser(u)});
  }
  if(p==='/api/login' && req.method==='POST'){
    const b=await body(req);
    const email=(b.email||'').trim().toLowerCase();
    const u=DB.users[email];
    if(!u || u.hash!==sha256('tx:'+(b.pass||''))) return json(res,200,{ok:false,error:'Email hoặc mật khẩu không đúng!'});
    const token=newToken(email); saveDB(true);
    Supabase.syncSession(token, email);
    log('Đăng nhập: '+email);
    return json(res,200,{ok:true, token, user:publicUser(u)});
  }
  if(p==='/api/guest' && req.method==='POST'){
    /* khách: tài khoản tạm theo token, reset khi server restart */
    const email='guest_'+rid().slice(0,8);
    const u={id:email, email:'—', name:'Khách demo', hash:'', balance:CFG.startBalance, wagered:0, rounds:0, history:[], guest:true};
    DB.users[email]=u;
    const token=newToken(email); saveDB(true);
    Supabase.syncUser(u);
    Supabase.syncSession(token, email);
    return json(res,200,{ok:true, token, user:publicUser(u)});
  }
  if(p==='/api/logout' && req.method==='POST'){
    const b=await body(req);
    if(b.token && DB.sessions[b.token]){
      const e=DB.sessions[b.token];
      Supabase.deleteSession(b.token);
      delete DB.sessions[b.token];
      if(DB.users[e]&&DB.users[e].guest) delete DB.users[e];
      saveDB(true);
    }
    return json(res,200,{ok:true});
  }
  /* --- cược --- */
  if(p==='/api/bet' && req.method==='POST'){
    const b=await body(req);
    const u=userByToken(b.token);
    if(!u) return json(res,200,{ok:false,error:'Chưa đăng nhập!'});
    if(S.phase!=='betting') return json(res,200,{ok:false,error:'Đã chốt cược — đợi ván sau!'});
    const side=b.side==='tai'?'tai':b.side==='xiu'?'xiu':null;
    if(!side) return json(res,200,{ok:false,error:'Chọn TÀI hoặc XỈU!'});
    const amount=Math.floor(+b.amount||0);
    if(amount<CFG.minBet) return json(res,200,{ok:false,error:'Cược tối thiểu '+CFG.minBet.toLocaleString('vi-VN')+'!'});
    if(amount>CFG.maxBet) return json(res,200,{ok:false,error:'Cược tối đa '+CFG.maxBet.toLocaleString('vi-VN')+'!'});
    const old=S.bets[b.token];
    const need=amount-(old?old.amount:0);
    if(need>u.balance) return json(res,200,{ok:false,error:'Không đủ số dư!'});
    u.balance-=need;
    if(old){ S.pools[old.side]-=old.amount; }
    S.bets[b.token]={side, amount};
    S.pools[side]+=amount;
    saveDB();
    Supabase.syncUser(u);
    broadcast('tick', tickPayload());
    return json(res,200,{ok:true, roundId:S.roundId, balance:u.balance, pools:S.pools,
                         left:S.left, phase:S.phase, players:Object.keys(S.bets).length,
                         durs:{betting:CFG.betPhase, locked:CFG.lockPhase, result:CFG.resultPhase}});
  }
  if(p==='/api/cancel' && req.method==='POST'){
    const b=await body(req);
    const u=userByToken(b.token);
    if(!u) return json(res,200,{ok:false,error:'Chưa đăng nhập!'});
    if(S.phase!=='betting') return json(res,200,{ok:false,error:'Đã chốt cược, không thể hủy!'});
    const old=S.bets[b.token];
    if(!old) return json(res,200,{ok:false,error:'Bạn chưa cược ván này!'});
    u.balance+=old.amount;
    S.pools[old.side]-=old.amount;
    delete S.bets[b.token];
    saveDB();
    Supabase.syncUser(u);
    broadcast('tick', tickPayload());
    return json(res,200,{ok:true, balance:u.balance, pools:S.pools});
  }
  /* --- nạp lại khi cháy tài khoản (demo) --- */
  if(p==='/api/refill' && req.method==='POST'){
    const b=await body(req);
    const u=userByToken(b.token);
    if(!u) return json(res,200,{ok:false,error:'Chưa đăng nhập!'});
    if(u.balance>=1000) return json(res,200,{ok:false,error:'Còn tiền, không cần nạp lại!'});
    u.balance=CFG.startBalance; saveDB(true);
    Supabase.syncUser(u);
    return json(res,200,{ok:true, balance:u.balance});
  }
  /* --- phần thưởng (wheel / khuyến mãi / VIP) cộng trừ số dư trên server --- */
  if(p==='/api/reward' && req.method==='POST'){
    const b=await body(req);
    const u=userByToken(b.token);
    if(!u) return json(res,200,{ok:false,error:'Chưa đăng nhập!'});
    const amount=Math.round(+b.amount||0);
    if(!amount) return json(res,200,{ok:false,error:'Số tiền không hợp lệ!'});
    if(amount<0 && u.balance+amount<0) return json(res,200,{ok:false,error:'Không đủ số dư!'});
    u.balance+=amount; saveDB();
    Supabase.syncUser(u);
    return json(res,200,{ok:true, balance:u.balance});
  }

  /* --- file tĩnh --- */
  let file=p==='/'?'tai_xiu.html':decodeURIComponent(p);
  file=path.join(__dirname, path.normalize(file).replace(/^(\.\.[\/\\])+/,''));
  if(!file.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(file,(err,data)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  });
});

function log(...a){ console.log(new Date().toLocaleTimeString('vi-VN'), ...a); }

loadDB();
newRound();
server.listen(CFG.port, ()=>{
  log(`════════════════════════════════════════════`);
  log(`  TÀI XỈU SERVER ▶ http://localhost:${CFG.port}`);
  log(`  Chu kỳ ván: ${CFG.betPhase+CFG.lockPhase+CFG.resultPhase}s (mở cược ${CFG.betPhase}s)${FAST?' — CHẾ ĐỘ FAST':''}`);
  log(`  Người chơi đã lưu: ${Object.keys(DB.users).length}`);
  log(`  Cơ sở dữ liệu: ${Supabase.enabled ? '⚡ SUPABASE CLOUD DATABASE' : '📁 TẬP TIN CỤC BỘ (tx_data.json)'}`);
  log(`════════════════════════════════════════════`);
});

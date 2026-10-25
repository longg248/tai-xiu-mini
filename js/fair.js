/* =====================================================================
   MẬT MÃ & XÁC THỰC PROVABLY FAIR
   ===================================================================== */
/* =====================================================================
   THUẬT TOÁN: SHA-256 · HMAC · MERSENNE TWISTER · PROVABLY FAIR
   ===================================================================== */
const enc = new TextEncoder();
function toHex(buf){ return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function hexToBytes(hex){ const a=new Uint8Array(hex.length>>1); for(let i=0;i<a.length;i++) a[i]=parseInt(hex.substr(i*2,2),16); return a; }
function randomHex(bytes=32){ const a=new Uint8Array(bytes); crypto.getRandomValues(a); return toHex(a); }

/* --- SHA-256 dự phòng (dùng khi crypto.subtle không khả dụng) --- */
const K256=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotr=(x,n)=>((x>>>n)|(x<<(32-n)))>>>0;
function sha256Bytes(msg){
  const l=msg.length, buf=new Uint8Array((((l+9)>>6)+1)*64);
  buf.set(msg); buf[l]=0x80;
  const dv=new DataView(buf.buffer);
  dv.setUint32(buf.length-8, Math.floor(l/536870912));
  dv.setUint32(buf.length-4, (l*8)>>>0);
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const w=new Uint32Array(64);
  for(let off=0;off<buf.length;off+=64){
    for(let j=0;j<16;j++) w[j]=dv.getUint32(off+j*4);
    for(let j=16;j<64;j++){
      const x=w[j-15], y=w[j-2];
      const s0=(rotr(x,7)^rotr(x,18)^(x>>>3))>>>0;
      const s1=(rotr(y,17)^rotr(y,19)^(y>>>10))>>>0;
      w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;
    }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let j=0;j<64;j++){
      const S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0;
      const ch=((e&f)^(~e&g))>>>0;
      const t1=(h+S1+ch+K256[j]+w[j])>>>0;
      const S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0;
      const maj=((a&b)^(a&c)^(b&c))>>>0;
      const t2=(S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H=[(H[0]+a)>>>0,(H[1]+b)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,(H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0];
  }
  const out=new Uint8Array(32), odv=new DataView(out.buffer);
  H.forEach((v,i)=>odv.setUint32(i*4,v>>>0));
  return out;
}
function hmacSha256Bytes(keyBytes,msgBytes){
  let key=keyBytes;
  if(key.length>64) key=sha256Bytes(key);
  const k=new Uint8Array(64); k.set(key);
  const o=new Uint8Array(64), i=new Uint8Array(64);
  for(let j=0;j<64;j++){ o[j]=k[j]^0x5c; i[j]=k[j]^0x36; }
  const inner=new Uint8Array(64+msgBytes.length); inner.set(i); inner.set(msgBytes,64);
  const ih=sha256Bytes(inner);
  const outer=new Uint8Array(64+ih.length); outer.set(o); outer.set(ih,64);
  return sha256Bytes(outer);
}
async function sha256Hex(msg){
  const b=enc.encode(msg);
  if(window.crypto && crypto.subtle){ return toHex(await crypto.subtle.digest('SHA-256',b)); }
  return toHex(sha256Bytes(b));
}
async function hmacSha256Hex(keyHex,msg){
  const k=hexToBytes(keyHex), m=enc.encode(msg);
  if(window.crypto && crypto.subtle){
    const key=await crypto.subtle.importKey('raw',k,{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return toHex(await crypto.subtle.sign('HMAC',key,m));
  }
  return toHex(hmacSha256Bytes(k,m));
}
/* server dùng seed hex string làm key trực tiếp (không decode) — giống Node crypto.createHmac */
async function hmacSha256HexStr(keyStr,msg){
  const k=enc.encode(keyStr), m=enc.encode(msg);
  if(window.crypto && crypto.subtle){
    const key=await crypto.subtle.importKey('raw',k,{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return toHex(await crypto.subtle.sign('HMAC',key,m));
  }
  return toHex(hmacSha256Bytes(k,m));
}

/* --- Mersenne Twister MT19937 --- */
function MersenneTwister(seed){
  const N=624,M=397,MATRIX_A=0x9908b0df,UPPER=0x80000000,LOWER=0x7fffffff;
  const mt=new Array(N); let index=N+1;
  (function init(s){
    mt[0]=s>>>0;
    for(index=1;index<N;index++) mt[index]=(Math.imul(mt[index-1]^(mt[index-1]>>>30),1664525)+index)>>>0;
    index=N;
  })(seed);
  function genInt(){
    let y;
    if(index>=N){
      for(let k=0;k<N-M;k++){ y=(mt[k]&UPPER)|(mt[k+1]&LOWER); mt[k]=(mt[k+M]^(y>>>1)^((y&1)?MATRIX_A:0))>>>0; }
      for(let k=N-M;k<N-1;k++){ y=(mt[k]&UPPER)|(mt[k+1]&LOWER); mt[k]=(mt[k+(M-N)]^(y>>>1)^((y&1)?MATRIX_A:0))>>>0; }
      y=(mt[N-1]&UPPER)|(mt[0]&LOWER);
      mt[N-1]=(mt[M-1]^(y>>>1)^((y&1)?MATRIX_A:0))>>>0;
      index=0;
    }
    y=mt[index++];
    y=(y^(y>>>11))>>>0;
    y=(y^((y<<7)&0x9d2c5680))>>>0;
    y=(y^((y<<15)&0xefc60000))>>>0;
    y=(y^(y>>>18))>>>0;
    return y>>>0;
  }
  return {genInt, genFloat:()=>genInt()/4294967296};
}

/* --- Ánh xạ byte → xúc xắc 1..6 (rejection sampling: phân phối đều tuyệt đối) --- */
async function diceFromBytes(bytes, serverSeed, msg, useStrKey){
  const dice=[]; let buf=bytes, round=0;
  const BUCKETS=Math.floor(4294967296/6);
  const LIMIT=BUCKETS*6;
  const hmacFn = useStrKey ? hmacSha256HexStr : hmacSha256Hex;
  while(dice.length<3){
    for(let i=0;i+4<=buf.length && dice.length<3;i+=4){
      const u=((buf[i]<<24)|(buf[i+1]<<16)|(buf[i+2]<<8)|buf[i+3])>>>0;
      if(u<LIMIT) dice.push(Math.floor(u/BUCKETS)+1);
    }
    if(dice.length<3){ round++; buf=hexToBytes(await hmacFn(serverSeed,msg+':'+round)); }
  }
  return dice;
}
function cryptoDice(n){
  const out=[];
  while(out.length<n){
    const a=new Uint8Array(16); crypto.getRandomValues(a);
    for(let i=0;i<a.length && out.length<n;i++) if(a[i]<252) out.push(a[i]%6+1); /* 252 = 6×42 */
  }
  return out;
}

/* --- PROVABLY FAIR --- */
const RNG_MODES={ fair:'Provably Fair (HMAC-SHA256)', mt:'Mersenne Twister MT19937', csprng:'crypto.getRandomValues (CSPRNG)' };
const Fair={
  ready:false, mode:'fair', serverSeed:null, serverSeedHash:null, clientSeed:'taixiu-club',
  nonce:0, firstSeed:null, chain:[], revealedSeed:null, mt:null, mtSeed:0, mtDraws:0,
  async init(){
    /* seed gốc: entropy cao từ CSPRNG + timestamp + performance.now */
    const entropy=randomHex(32)+':'+Date.now()+':'+performance.now().toFixed(6);
    this.serverSeed=await sha256Hex('genesis:'+entropy);
    this.serverSeedHash=await sha256Hex(this.serverSeed);
    this.firstSeed=this.serverSeed;
    this.ready=true; updateFairBadge();
  },
  ensure(){ return this.ready ? Promise.resolve() : this.init(); },
  async rotate(nonce){                   /* hash chaining: seed mới = SHA256(seed cũ + nonce của ván vừa chơi) */
    this.serverSeed=await sha256Hex(this.serverSeed+':'+nonce);
    this.serverSeedHash=await sha256Hex(this.serverSeed);
    updateFairBadge();
  },
  async next(){
    await this.ensure();
    const mode=this.mode, nonce=this.nonce;
    let dice=[], hmac='', off=0;
    if(mode==='fair'){
      const msg=this.clientSeed+':'+nonce;
      hmac=await hmacSha256Hex(this.serverSeed,msg);
      dice=await diceFromBytes(hexToBytes(hmac),this.serverSeed,msg);
    } else if(mode==='mt'){
      if(!this.mt){ this.mtSeed=(Date.now()^Math.floor(performance.now()*1000)^Math.floor(Math.random()*1e9))>>>0; this.mt=MersenneTwister(this.mtSeed); this.mtDraws=0; }
      off=this.mtDraws; this.mtDraws+=3;
      dice=[this.mt.genFloat(),this.mt.genFloat(),this.mt.genFloat()].map(f=>Math.floor(f*6)+1);
    } else {
      dice=cryptoDice(3);
    }
    const sum=dice[0]+dice[1]+dice[2];
    const entry={dice,sum,result:sum>=11?'T':'X',nonce,mode,hmac,clientSeed:this.clientSeed,
                 serverSeed:this.serverSeed,serverSeedHash:this.serverSeedHash,mtSeed:this.mtSeed,mtOffset:off};
    if(mode==='fair'){
      this.revealedSeed=this.serverSeed;
      this.chain.push({nonce,seed:this.serverSeed,hash:this.serverSeedHash});
      await this.rotate(nonce);                     /* seed ván sau gắn vào chuỗi hash */
      this.nonce++;
    } else {
      this.nonce++;
    }
    return entry;
  }
};
function updateFairBadge(){
  const h=Fair.serverSeedHash||'';
  const el=$('fairHashShort');
  if(el) el.textContent = h ? h.slice(0,10)+'…'+h.slice(-6) : '—';
}
/* --- Kiểm chứng --- */
async function verifyRound(fair){
  if(!fair) return {ok:null,msg:'Chưa có ván nào để kiểm chứng'};
  if(fair.mode==='fair'){
    /* server dùng seed hex string làm HMAC key trực tiếp (giống Node crypto.createHmac) */
    const msg = fair.clientSeed==='round' ? 'round:'+fair.nonce : fair.clientSeed+':'+fair.nonce;
    const hmac = fair.clientSeed==='round'
      ? await hmacSha256HexStr(fair.serverSeed, msg)   /* server mode: key = string */
      : await hmacSha256Hex(fair.serverSeed, msg);      /* local mode: key = hex bytes */
    const useStrKey = fair.clientSeed==='round';
    const dice=await diceFromBytes(hexToBytes(hmac),fair.serverSeed,msg,useStrKey);
    const ok=dice.join(',')===fair.dice.join(',');
    return {ok, msg:ok?'KẾT QUẢ KHỚP ✓':'SAI LỆCH ✗', hmac, dice};
  }
  if(fair.mode==='mt'){
    const mt=MersenneTwister(fair.mtSeed);
    for(let i=0;i<(fair.mtOffset||0);i++) mt.genInt();
    const dice=[mt.genFloat(),mt.genFloat(),mt.genFloat()].map(f=>Math.floor(f*6)+1);
    const ok=dice.join(',')===fair.dice.join(',');
    return {ok, msg:ok?'TÁI LẬP THÀNH CÔNG ✓':'SAI LỆCH ✗', dice};
  }
  return {ok:null,msg:'CSPRNG không thể tái lập (đúng theo thiết kế)'};
}
async function verifyChain(){
  if(Fair.chain.length<2) return {ok:null,msg:'Cần ít nhất 2 ván để kiểm chứng chuỗi hash'};
  let seed=Fair.chain[0].seed, ok=true, bad=[];
  for(let i=1;i<Fair.chain.length;i++){
    const exp=await sha256Hex(seed+':'+Fair.chain[i-1].nonce);
    if(exp!==Fair.chain[i].seed){ ok=false; bad.push('#'+(Fair.chain[i].nonce+1)); }
    seed=Fair.chain[i].seed;
  }
  return {ok, msg:ok?('Chuỗi '+Fair.chain.length+' ván HỢP LỆ ✓'):('Sai lệch tại ván '+bad.join(', '))};
}



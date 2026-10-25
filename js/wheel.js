/* =====================================================================
   MINI GAME: VÒNG QUAY MAY MẮN (LUCKY WHEEL)
   ===================================================================== */
/* ---------- MINI GAME: VÒNG QUAY MAY MẮN ---------- */
const Wheel={
  segs:[
    {n:1,color:'#c0392b',mult:3,label:'ĐỎ', weight:25},
    {n:2,color:'#1e1e1e',mult:3,label:'ĐEN',weight:25},
    {n:3,color:'#c0392b',mult:5,label:'ĐỎ', weight:15},
    {n:4,color:'#1e1e1e',mult:5,label:'ĐEN',weight:15},
    {n:5,color:'#c0392b',mult:8,label:'ĐỎ', weight:10},
    {n:6,color:'#1e1e1e',mult:10,label:'ĐEN',weight:10}
  ],
  angleDeg:0, spinning:false, pick:null, bet:100000, raf:null, log:[], inited:false,
  init(){
    this.ctx=$('wheelCanvas').getContext('2d');   /* canvas mới mỗi lần mở modal → lấy lại */
    this.renderPicks(); this.renderChips(); this.draw(); this.sync();
  },
  draw(){
    const c=this.ctx;
    if(!c) return;
    const S=360, R=S/2-8, step=Math.PI*2/this.segs.length;
    c.clearRect(0,0,S,S);
    c.save();
    c.translate(S/2,S/2);
    /* chuyển đổi chính xác từ ĐỘ sang RADIAN cho Canvas 2D */
    c.rotate(this.angleDeg * Math.PI / 180);

    this.segs.forEach((s,i)=>{
      /* Ô 1 (i=0) có tâm ở đỉnh 12h (-PI/2) lúc angleDeg = 0 */
      const a0 = -Math.PI/2 - step/2 + i*step;
      const a1 = a0 + step;
      c.beginPath(); c.moveTo(0,0); c.arc(0,0,R,a0,a1); c.closePath();
      c.fillStyle=s.color; c.fill();
      c.strokeStyle='#d4af37'; c.lineWidth=2.5; c.stroke();

      /* Nhãn ô & hệ số thưởng */
      c.save();
      c.rotate(-Math.PI/2 + i*step);
      c.translate(R*0.66,0);
      c.rotate(Math.PI/2);
      c.fillStyle=s.color==='#1e1e1e'?'#ffd97a':'#fff';
      c.font='bold 16px "Segoe UI", sans-serif';
      c.textAlign='center'; c.textBaseline='middle';
      c.fillText(s.n+' · ×'+s.mult,0,0);
      c.restore();
    });

    /* Trục trung tâm */
    c.beginPath(); c.arc(0,0,44,0,Math.PI*2); c.fillStyle='#1a1006'; c.fill();
    c.strokeStyle='#f0c040'; c.lineWidth=3; c.stroke();
    c.fillStyle='#ffd97a'; c.font='bold 14px "Segoe UI", sans-serif';
    c.textAlign='center'; c.textBaseline='middle';
    c.fillText('LUCKY',0,-6);
    c.fillText('WHEEL',0,12);
    c.restore();
  },
  renderPicks(){
    const el=$('wheelPicks');
    if(!el) return;
    const colorBtns=`<button class="wp red ${this.pick&&this.pick.type==='color'&&this.pick.value==='ĐỎ'?'on':''}" data-type="color" data-value="ĐỎ">ĐỎ · 1:1</button>
                     <button class="wp black ${this.pick&&this.pick.type==='color'&&this.pick.value==='ĐEN'?'on':''}" data-type="color" data-value="ĐEN">ĐEN · 1:1</button>`;
    const numBtns=this.segs.map(s=>`<button class="wp ${this.pick&&this.pick.type==='number'&&this.pick.value===s.n?'on':''}" data-type="number" data-value="${s.n}">Ô ${s.n} · ×${s.mult}</button>`).join('');
    el.innerHTML=colorBtns+numBtns;
    el.querySelectorAll('.wp').forEach(b=>b.onclick=()=>{
      if(this.spinning) return;
      this.pick={type:b.dataset.type, value:b.dataset.type==='number'?+b.dataset.value:b.dataset.value};
      Sound.chip(); this.renderPicks(); this.sync();
    });
  },
  renderChips(){
    const el=$('wheelChips');
    if(!el) return;
    const chips=[
      {v:20000,t:'20K'},{v:50000,t:'50K'},{v:100000,t:'100K'},
      {v:200000,t:'200K'},{v:500000,t:'500K'},{v:1000000,t:'1M'}
    ];
    el.innerHTML=chips.map(c=>`<button data-v="${c.v}">+${c.t}</button>`).join('') +
      `<button id="wheelResetBet" style="background:#4a2810;color:#ffb088" title="Đặt lại về 100K">↺ 100K</button>`;
    el.querySelectorAll('button[data-v]').forEach(b=>b.onclick=()=>{
      if(this.spinning) return;
      const v=+b.dataset.v;
      if(this.bet+v>state.balance){
        this.bet=Math.max(10000, state.balance);
        toast('Đã cộng tối đa theo số dư ('+fmtComma(this.bet)+')');
      } else {
        this.bet += v;
      }
      Sound.chip(); this.sync();
    });
    const rst=$('wheelResetBet');
    if(rst) rst.onclick=()=>{
      if(this.spinning) return;
      this.bet=Math.min(100000, state.balance);
      Sound.chip(); this.sync();
      toast('Đã đặt lại mức cược về 100K');
    };
  },
  sync(){
    const wb=$('wheelBalance'), wt=$('wheelBet'), ws=$('wheelSpin');
    if(wb) wb.textContent=fmtComma(state.balance);
    if(wt) wt.textContent=fmtComma(this.bet);
    if(ws){
      ws.disabled=this.spinning;
      ws.textContent=this.spinning?'ĐANG QUAY...':'QUAY BÁNH';
    }
  },
  renderLog(){
    const wl=$('wheelLog');
    if(!wl) return;
    wl.innerHTML=this.log.length
      ? this.log.map(l=>`<div>${l}</div>`).join('')
      : '<div style="color:#7a6a50">Chưa có lượt quay nào.</div>';
  },
  async spin(){
    if(this.spinning) return;
    if(!this.pick){ toast('Hãy chọn MÀU hoặc Ô trước khi quay!'); return; }
    if(this.bet>state.balance){ toast('Không đủ số dư!'); return; }
    if(this.bet<=0){ toast('Mức cược phải lớn hơn 0!'); return; }
    this.spinning=true; this.sync();
    const okPay=await addReward(-this.bet);         /* trừ cược qua server */
    if(!okPay){ this.spinning=false; this.sync(); return; }
    refresh();

    /* --- TÍNH KẾT QUẢ THEO TRỌNG SỐ XÁC SUẤT CÔNG BẰNG (ĐỎ: 50%, ĐEN: 50%) --- */
    const randBuf = new Uint32Array(2);
    crypto.getRandomValues(randBuf);
    const rndVal = randBuf[0] % 100;
    let acc=0, idx=0;
    for(let i=0; i<this.segs.length; i++){
      acc += this.segs[i].weight;
      if(rndVal < acc){ idx=i; break; }
    }
    const entropy = `wheel:${randBuf[0]}:${randBuf[1]}:${Date.now()}`;
    const hmacHash = await sha256Hex(entropy);

    /* --- TÍNH GÓC QUAY CHÍNH XÁC 100% ĐẾN TÂM Ô IDX ---
       Kim chỉ cố định ở đỉnh 12h (-90°).
       Tâm ô idx ban đầu ở: -90° + idx * 60°.
       Sau khi quay A° theo chiều kim đồng hồ, vị trí mới là: (-90° + idx * 60°) + A.
       Để tâm ô idx dừng đúng ngay kim chỉ (-90°):
       A ≡ -idx * 60° (mod 360°) = (360 - idx * 60°) mod 360°.
    */
    const targetMod = (360 - (idx * 60) % 360) % 360;
    const start = this.angleDeg;
    const currMod = ((start % 360) + 360) % 360;
    let diff = (targetMod - currMod + 360) % 360;
    if(diff < 60) diff += 360;   /* đảm bảo quay tối thiểu 1 vòng */
    const end = start + diff + 360 * 6;   /* quay thêm 6 vòng đầy đủ */

    const dur = 4200, t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3.5);
    let lastTickAngle = start;

    const frame = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      this.angleDeg = start + (end - start) * ease(p);
      this.draw();

      /* Âm thanh tick khi kim lướt qua chốt từng ô */
      if(Math.abs(this.angleDeg - lastTickAngle) >= 60){
        Sound.tick();
        lastTickAngle = this.angleDeg;
      }

      if(p < 1){
        this.timer = setTimeout(frame, 16);
      } else {
        this.angleDeg = end;
        this.draw();
        this.finish(idx, hmacHash);
      }
    };
    this.timer = setTimeout(frame, 16);
  },
  finish(idx, hmacHash){
    this.spinning=false;
    const seg=this.segs[idx];
    let win=0, msg='', isWin=false;
    if(this.pick.type==='number'){
      if(this.pick.value===seg.n){
        win=this.bet*seg.mult;
        isWin=true;
        msg=`🎯 Trúng Ô ${seg.n} (${seg.label}) ×${seg.mult}!`;
      } else {
        msg=`Rơi vào Ô ${seg.n} (${seg.label}) ×${seg.mult}`;
      }
    } else {
      if(this.pick.value===seg.label){
        win=this.bet*2;
        isWin=true;
        msg=`🎯 Trúng màu ${seg.label}! (Ô ${seg.n})`;
      } else {
        msg=`Rơi vào màu ${seg.label} (Ô ${seg.n})`;
      }
    }

    if(win>0){
      addReward(win);
      msg += ` — THẮNG +${fmtComma(win - this.bet)}`;
      Sound.win();
      burst(180);
    } else {
      msg += ` — THUA -${fmtComma(this.bet)}`;
      state.promo.cashback += this.bet * 0.02;
      Sound.lose();
    }

    this.log.unshift(msg);
    this.log=this.log.slice(0,8);
    $('wheelHash').textContent='HASH: ' + hmacHash.slice(0,32) + '…';
    toast(msg, 2800);
    this.renderLog(); this.sync(); refresh(); saveGame();
  }
};
const WHEEL_HTML=`
  <div class="wheel-body">
    <div class="wheel-left">
      <div style="position:relative;display:inline-block">
        <canvas id="wheelCanvas" width="360" height="360"></canvas>
        <div class="wheel-pointer"></div>
      </div>
      <div class="wheel-hash mono" id="wheelHash">Chưa quay — hash sẽ hiện sau khi quay</div>
    </div>
    <div class="wheel-right">
      <div class="wheel-info">
        <div><span>SỐ DƯ</span><b id="wheelBalance">0</b></div>
        <div><span>CƯỢC</span><b id="wheelBet">100,000</b></div>
      </div>
      <div class="road-cap">CHỌN MÀU (1:1) HOẶC Ô (1–6)</div>
      <div class="wheel-picks" id="wheelPicks"></div>
      <div class="road-cap">MÚI CƯỢC (BẤM ĐỂ CỘNG DỒN)</div>
      <div class="opt" id="wheelChips"></div>
      <button class="mini-btn primary" id="wheelSpin" style="width:100%;margin-top:14px">QUAY BÁNH</button>
      <div class="wheel-log" id="wheelLog"></div>
    </div>
  </div>`;
function openWheel(){
  if(typeof CardsUI !== 'undefined') CardsUI.closeAll(true);
  openModal('VÒNG QUAY MAY MẮN', WHEEL_HTML);
  Wheel.init(); Wheel.sync(); Wheel.renderLog();
  $('wheelSpin').onclick=()=>Wheel.spin();
}



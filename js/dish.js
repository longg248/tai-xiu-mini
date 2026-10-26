/* =====================================================================
   BÁT / ĐĨA ÚP — CƠ CHẾ KÉO MỞ ĐĨA & HÉ LỘ TỪNG XÚC XẮC THEO HƯỚNG KÉO
   ===================================================================== */
const Dish={
  el:null, dragging:false, sx:0, sy:0, dx:0, dy:0,
  busy:false, opened:false, shaking:false, _raf:null,
  onOpen:null, onPeek:null, onUnpeek:null,
  THRESHOLD:130, lift:0, peeked:[false,false,false],

  /* Tọa độ tâm 3 viên xúc xắc so với tâm đĩa úp (đường kính 300px):
     - Viên 0 (d1): Nằm trên đỉnh (Top)
     - Viên 1 (d2): Nằm dưới bên trái (Bottom-Left)
     - Viên 2 (d3): Nằm dưới bên phải (Bottom-Right) */
  dicePos:[
    { x:0,   y:-92 },
    { x:-80, y:42 },
    { x:74,  y:42 }
  ],
  REVEAL_DIST:114, /* Khoảng cách mép bát rời khỏi để viên xúc xắc lộ ra */

  init(){
    this.el=$('dishCover');
    this.el.addEventListener('pointerdown',e=>this.start(e));
    this.el.addEventListener('pointermove',e=>this.move(e));
    this.el.addEventListener('pointerup',e=>this.end(e));
    this.el.addEventListener('pointercancel',e=>this.end(e));
    this.el.addEventListener('lostpointercapture',()=>{ if(this.dragging) this.end(); });
  },

  /* Animation XỐC ĐĨA chân thật */
  shake(durationMs=2400, onDone){
    this.cover();
    clearTimeout(this._shakeT);
    this.shaking=true;
    this._shakeDone=onDone||null;
    this.el.classList.add('shaking');
    const ring=$('ring');
    if(ring) ring.classList.add('shaking');

    /* Không phát tiếng xúc xắc khi đang ở sảnh/bàn bài.
       Giới hạn âm thanh ~1.6s để không tạo quá nhiều oscillator (nguyên nhân delay âm thanh). */
    if(!(typeof CardsUI !== 'undefined' && CardsUI.active)) Sound.shakeDice(Math.min(durationMs, 1600));
    const hint=this.el.querySelector('.dish-hint');
    if(hint) hint.textContent='🎲 ĐANG XỐC ĐĨA…';

    this._shakeT=setTimeout(()=>{
      this._shakeT=null; this._shakeDone=null;
      this.shaking=false; this._lastShakeEnd=Date.now();
      this.el.classList.remove('shaking');
      if(ring) ring.classList.remove('shaking');
      if(!(typeof CardsUI !== 'undefined' && CardsUI.active)) Sound.thud();
      if(hint) hint.textContent='🖱 Giữ & KÉO dĩa theo hướng bạn muốn để nặn!';
      if(onDone) onDone();
    }, durationMs);
  },

  /* Dừng xóc ngay lập tức (khi kết quả về sớm hơn dự kiến) — tránh treo chờ autoReveal */
  stopShake(){
    if(!this.shaking) return;
    clearTimeout(this._shakeT); this._shakeT=null;
    this.shaking=false; this._lastShakeEnd=Date.now();
    this.el.classList.remove('shaking');
    const ring=$('ring'); if(ring) ring.classList.remove('shaking');
    const hint=this.el.querySelector('.dish-hint');
    if(hint) hint.textContent='🖱 Giữ & KÉO dĩa theo hướng bạn muốn để nặn!';
    const cb=this._shakeDone; this._shakeDone=null;
    if(cb) cb();
  },

  cover(){
    this.dx=this.dy=0; this.lift=0; this.opened=false; this.onOpen=null;
    this.peeked=[false,false,false];
    this.el.classList.remove('show','dropping','flying','dragging','shaking');
    const ring=$('ring');
    if(ring) ring.classList.remove('shaking');

    void this.el.offsetWidth;
    this.el.style.transform=''; this.el.style.opacity='';
    this.el.style.setProperty('--lift',0);
    this.setProgress(0);
    this.el.classList.add('show','dropping');
    setTimeout(()=>this.el.classList.remove('dropping'), 600);
    this.busy=true;
  },

  start(e){
    if(!this.busy || this.shaking) return;
    e.preventDefault();
    this.dragging=true;
    this.sx=e.clientX; this.sy=e.clientY;
    this.el.classList.add('dragging');
    try{ this.el.setPointerCapture(e.pointerId); }catch(err){}
    Sound.chip();
  },

  move(e){
    if(!this.dragging || this.shaking) return;
    this._lastE = e;
    if(this._raf) return;   /* đã có khung hâte đang chờ → bỏ qua, tránh cập nhật quá nhiều */
    this._raf = requestAnimationFrame(()=>{
      this._raf = null;
      const e = this._lastE;
      this.dx=e.clientX-this.sx;
      this.dy=e.clientY-this.sy;
      const distHypot=Math.hypot(this.dx,this.dy);
      this.lift=Math.min(1,distHypot/this.THRESHOLD);
      const rot=Math.max(-22,Math.min(22,this.dx*0.05));

      this.el.style.transform=`translate(${this.dx}px,${this.dy}px) rotate(${rot}deg) scale(${1+this.lift*0.07})`;
      this.el.style.setProperty('--lift',this.lift.toFixed(3));
      this.setProgress(this.lift);

      /* CƠ CHẾ NẶN THEO HƯỚNG: Kiểm tra viên nào bị lòi ra theo vị trí kéo */
      this.updatePeeksDirectional();
    });
  },

  /* Kiểm tra viên nào bị lòi ra ngoài mép bát dựa trên vector kéo (dx, dy) */
  updatePeeksDirectional(){
    for(let i=0; i<3; i++){
      if(this.peeked[i]) continue;
      // Khoảng cách từ tâm bát hiện tại (dx, dy) đến tâm viên thứ i
      const distFromBowl=Math.hypot(this.dicePos[i].x - this.dx, this.dicePos[i].y - this.dy);
      // Nếu mép bát đã trượt qua vị trí của viên xúc xắc i:
      if(distFromBowl>=this.REVEAL_DIST){
        this.peekAt(i);
      }
    }
  },

  peekAt(i){
    this.peeked[i]=true;
    if(this.onPeek) this.onPeek(i);
  },

  setProgress(p){
    const f=this.el.querySelector('.dish-progress-fill');
    if(f) f.style.width=(p*100).toFixed(1)+'%';
    const h=this.el.querySelector('.dish-hint');
    if(h){
      const count=this.peeked.filter(Boolean).length;
      if(this.dragging){
        h.textContent=count===0
          ? `Đang kéo nặn… (chưa lòi viên nào)`
          : count<3
            ? `🔥 Đã lòi ${count}/3 viên xúc xắc!`
            : `🎯 Đã lòi cả 3 viên! Thả tay để mở`;
      } else {
        h.textContent='🖱 Giữ & KÉO dĩa theo hướng bạn muốn để nặn!';
      }
    }
  },

  end(){
    if(!this.dragging) return;
    cancelAnimationFrame(this._raf); this._raf=null;
    this.dragging=false;
    this.el.classList.remove('dragging');
    this.setProgress(this.lift);
    if(this.lift>=0.95 || this.peeked.every(Boolean)) this.fly();
    else this.snapBack();
  },

  snapBack(){
    this.el.style.transform=''; this.el.style.opacity='';
    this.el.style.setProperty('--lift',0);
    this.setProgress(0);
    this.dx=this.dy=0; this.lift=0;
    this.peeked=[false,false,false];
    if(this.onUnpeek) this.onUnpeek();
    Sound.thud();
  },

  fly(){
    if(!this.busy) return;
    this.busy=false; this.opened=true;
    const ang=Math.atan2(this.dy||-0.2, this.dx||0.1);
    this.el.style.setProperty('--fly-x',Math.cos(ang)*580+'px');
    this.el.style.setProperty('--fly-y',Math.sin(ang)*580+'px');
    this.el.classList.remove('dropping','shaking');
    this.el.classList.add('flying');
    Sound.swoosh();
    setTimeout(()=>{
      this.el.classList.remove('show','flying','dragging','shaking');
      this.el.style.transform=''; this.el.style.opacity='';
      this.el.style.setProperty('--lift',0);
    }, 700);
    if(this.onOpen){ const f=this.onOpen; this.onOpen=null; f(); }
  },

  autoReveal(){
    if(this.opened) return;
    /* Nếu đang xóc hoặc người chơi đang kéo dở → thử lại sau, không bỏ rơi kết quả */
    if(this.shaking){ setTimeout(()=>this.autoReveal(), 300); return; }
    if(this.dragging){ setTimeout(()=>this.autoReveal(), 500); return; }
    if(!this.busy) return;
    /* Tự động kéo nặn xéo xuống trái để lộ dần từng viên — nhanh (tổng 480ms) để kết quả hiện tức thì */
    const steps=[
      { dx:0,   dy:45,  ms:0 },
      { dx:-45, dy:75,  ms:160 },
      { dx:-90, dy:110, ms:320 },
      { dx:-140,dy:140, ms:480 }
    ];
    steps.forEach(({dx,dy,ms},idx)=>setTimeout(()=>{
      if(!this.busy || this.dragging || this.opened) return;
      this.dx=dx; this.dy=dy;
      this.lift=Math.min(1,Math.hypot(dx,dy)/this.THRESHOLD);
      this.el.style.transform=`translate(${dx}px,${dy}px) scale(${1+this.lift*0.07})`;
      this.el.style.setProperty('--lift',this.lift);
      this.setProgress(this.lift);
      this.updatePeeksDirectional();
      if(idx===steps.length-1) this.fly();
    },ms));
  }
};



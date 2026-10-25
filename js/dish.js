/* =====================================================================
   BÁT / ĐĨA ÚP — CƠ CHẾ KÉO MỞ ĐĨA & HÉ LỘ TỪNG XÚC XẮC
   ===================================================================== */
/* ===== CHÉN / ĐĨA ÚP — GIỮ CHUỘT KÉO: KÉO TỚI ĐÂU SỐ LỘ TỚI ĐÓ ===== */
const Dish={
  el:null, dragging:false, sx:0, sy:0, dx:0, dy:0,
  busy:false, opened:false, onOpen:null, onPeek:null, onUnpeek:null,
  THRESHOLD:135, lift:0, peeked:[false,false,false],
  init(){
    this.el=$('dishCover');
    this.el.addEventListener('pointerdown',e=>this.start(e));
    this.el.addEventListener('pointermove',e=>this.move(e));
    this.el.addEventListener('pointerup',e=>this.end(e));
    this.el.addEventListener('pointercancel',e=>this.end(e));
    this.el.addEventListener('lostpointercapture',()=>{ if(this.dragging) this.end(); });
  },
  cover(){
    this.dx=this.dy=0; this.lift=0; this.opened=false; this.onOpen=null;
    this.peeked=[false,false,false];
    this.el.classList.remove('show','dropping','flying','dragging');
    void this.el.offsetWidth;
    this.el.style.transform=''; this.el.style.opacity='';
    this.el.style.setProperty('--lift',0);
    this.setProgress(0);
    this.el.classList.add('show','dropping');
    setTimeout(()=>this.el.classList.remove('dropping'), 700);  /* rơi xong → gỡ keyframes */
    this.busy=true;
  },
  start(e){
    if(!this.busy) return;
    e.preventDefault();
    this.dragging=true;
    this.sx=e.clientX; this.sy=e.clientY;
    this.el.classList.add('dragging');
    try{ this.el.setPointerCapture(e.pointerId); }catch(err){}
    Sound.chip();
  },
  move(e){
    if(!this.dragging) return;
    this.dx=e.clientX-this.sx; this.dy=e.clientY-this.sy;
    this.lift=Math.min(1,Math.hypot(this.dx,this.dy)/this.THRESHOLD);
    const rot=Math.max(-22,Math.min(22,this.dx*0.05));
    this.el.style.transform=`translate(${this.dx}px,${this.dy}px) rotate(${rot}deg) scale(${1+this.lift*.08})`;
    this.el.style.setProperty('--lift',this.lift.toFixed(3));
    this.setProgress(this.lift);
    this.updatePeeks();
  },
  updatePeeks(){
    const th=[.30,.60,.90];            /* viên 1 → 2 → 3 lần lượt lộ chấm */
    for(let i=0;i<3;i++) if(!this.peeked[i] && this.lift>=th[i]) this.peekAt(i);
  },
  peekAt(i){
    this.peeked[i]=true;
    if(this.onPeek) this.onPeek(i);
  },
  setProgress(p){
    const f=this.el.querySelector('.dish-progress-fill');
    if(f) f.style.width=(p*100).toFixed(1)+'%';
    const h=this.el.querySelector('.dish-hint');
    if(h) h.textContent = this.dragging
      ? `Đang lật số… ${Math.round(p*100)}%`
      : '🖱 Giữ và KÉO dĩa để lật số';
  },
  end(){
    if(!this.dragging) return;
    this.dragging=false;
    this.el.classList.remove('dragging');
    this.setProgress(this.lift);
    if(this.lift>=1) this.fly();
    else this.snapBack();
  },
  snapBack(){                       /* thả tay giữa chừng → chén úp lại, số biến mất */
    this.el.style.transform=''; this.el.style.opacity='';
    this.el.style.setProperty('--lift',0);
    this.setProgress(0);
    this.dx=this.dy=0; this.lift=0;
    this.peeked=[false,false,false];
    if(this.onUnpeek) this.onUnpeek();
    Sound.thud();
  },
  fly(){                            /* kéo đủ → chén nhấc hẳn, chốt kết quả */
    if(!this.busy) return;
    this.busy=false; this.opened=true;
    const ang=Math.atan2(this.dy||0.01,this.dx||0.01);
    this.el.style.setProperty('--fly-x',Math.cos(ang)*560+'px');
    this.el.style.setProperty('--fly-y',Math.sin(ang)*560+'px');
    this.el.classList.remove('dropping');
    this.el.classList.add('flying');
    Sound.swoosh();
    setTimeout(()=>{
      this.el.classList.remove('show','flying','dragging');
      this.el.style.transform=''; this.el.style.opacity='';
      this.el.style.setProperty('--lift',0);
    },700);
    if(this.onOpen){ const f=this.onOpen; this.onOpen=null; f(); }
  },
  autoReveal(){                     /* chế độ AUTO: tự kéo dần rồi nhấc chén */
    if(!this.busy) return;
    [[.34,0],[.62,380],[.9,760],[1,1150]].forEach(([lv,ms])=>setTimeout(()=>{
      if(!this.busy || this.dragging || this.opened) return;
      this.lift=lv;
      this.el.style.transform=`translate(0,${(-lv*26).toFixed(1)}px) scale(${(1+lv*.08).toFixed(3)})`;
      this.el.style.setProperty('--lift',lv);
      this.setProgress(lv);
      this.updatePeeks();
      if(lv>=1) this.fly();
    },ms));
  }
};



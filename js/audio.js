/* =====================================================================
   HỆ THỐNG ÂM THANH (WEB AUDIO API)
   ===================================================================== */
/* ---------- ÂM THANH (Web Audio API) ---------- */
const Sound = {
  on:true, ctx:null,
  init(){
    if(!this.ctx){ try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; } }
    if(this.ctx && this.ctx.state==='suspended') this.ctx.resume();
  },
  tone(f,dur=.09,type='sine',vol=.07,delay=0){
    if(!this.on || !this.ctx) return;
    const t0=this.ctx.currentTime+delay;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(f,t0);
    g.gain.setValueAtTime(.0001,t0);
    g.gain.linearRampToValueAtTime(vol,t0+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t0); o.stop(t0+dur+.03);
  },
  click(){ this.tone(720,.05,'square',.045); },
  chip(){ this.tone(1180,.045,'triangle',.05); this.tone(1560,.05,'triangle',.035,.04); },
  tick(){ this.tone(880,.05,'square',.05); },
  cover(){ this.tone(170,.2,'sine',.12); this.tone(95,.28,'triangle',.08,.05); },  /* tiếng chén đặt xuống */
  swoosh(){ this.tone(340,.2,'sine',.06); this.tone(560,.14,'triangle',.04,.05); }, /* tiếng đĩa bay đi */
  flip(){ this.tone(430,.05,'square',.05); this.tone(760,.04,'triangle',.03,.03); },  /* tiếng lật xúc xắc */
  thud(){ this.tone(110,.14,'sine',.1); this.tone(70,.18,'triangle',.07,.03); },      /* tiếng chén úp lại */
  dice(){ for(let i=0;i<16;i++) this.tone(110+Math.random()*260,.028,'square',.035,i*.055); },
  shakeDice(dur=2200){
    if(!this.on) return;
    this.init();
    const count = Math.floor(dur / 65);
    for(let i=0; i<count; i++){
      const delay = (i * 0.065) + (Math.random() * 0.015);
      const freq = 130 + Math.random() * 320;
      const vol = 0.045 + Math.random() * 0.045;
      const type = Math.random() > 0.5 ? 'triangle' : 'square';
      this.tone(freq, 0.038, type, vol, delay);
    }
  },
  win(){ [523,659,784,1046].forEach((f,i)=>this.tone(f,.22,'triangle',.08,i*.085)); },
  lose(){ [392,330,247,165].forEach((f,i)=>this.tone(f,.26,'sawtooth',.05,i*.11)); }
};
document.addEventListener('pointerdown', ()=>Sound.init(), {once:true});



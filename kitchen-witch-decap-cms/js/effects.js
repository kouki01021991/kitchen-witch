/**
 * effects.js — 森の魔女の台所 / Kitchen Witch
 * 全ページ共通エフェクト
 * スマホ軽量化: パーティクル削減・セクションCanvas省略・Ripple無効・parallax無効
 */
(function () {
  'use strict';

  var isMobile  = window.innerWidth <= 768;
  var isLowPower = isMobile || !window.matchMedia('(pointer: fine)').matches;
  window.addEventListener('resize', function () {
    isMobile   = window.innerWidth <= 768;
    isLowPower = isMobile || !window.matchMedia('(pointer: fine)').matches;
  }, { passive: true });

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }
  function hexA(hex, a) {
    var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+a.toFixed(3)+')';
  }

  /* ── Canvas 汎用ファクトリ ── */
  function makeParticleCanvas(canvas, hostEl, opts) {
    if (!canvas || !hostEl) return;
    var ctx=canvas.getContext('2d'), W, H, rafId;
    var cnt=opts.count||60, cols=opts.cols||['#ffffff','#f0ffe0','#d8f8a0','#e8ffc8'];
    var leafs=opts.leaves||0;
    var leafCols=['#4a7830','#3a6820','#5a8840','#2a5818','#508040'];
    var pts=[], lvs=[];

    function resize(){ W=canvas.width=hostEl.offsetWidth; H=canvas.height=hostEl.offsetHeight; }

    function mkP(bot){
      return {x:rand(0,W||800), y:bot?H+rand(10,50):rand(0,H||500),
        rx:rand(.9,2.8), vx:rand(-.12,.12), vy:rand(-.60,-.14),
        a:rand(.20,.60), ad:(Math.random()>.5?1:-1)*rand(.003,.012),
        drift:rand(-.004,.004), tick:randi(0,360), col:cols[randi(0,cols.length-1)]};
    }
    function mkL(top){
      return {x:rand(0,W||800), y:top?rand(-60,-8):rand(0,H||500),
        sz:rand(8,22), vx:rand(-.55,.55), vy:rand(.25,.95),
        rot:rand(0,Math.PI*2), rv:rand(-.020,.020),
        a:rand(.16,.42), ad:(Math.random()>.5?1:-1)*rand(.002,.006),
        drift:rand(-.004,.004), tick:randi(0,360), col:leafCols[randi(0,leafCols.length-1)]};
    }
    function drawP(p){
      var r=p.rx*3.2;
      var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      g.addColorStop(0,hexA(p.col,p.a)); g.addColorStop(.4,hexA(p.col,p.a*.45)); g.addColorStop(1,hexA(p.col,0));
      ctx.save(); ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,p.rx*.55,0,Math.PI*2);
      ctx.globalAlpha=p.a*.95; ctx.fillStyle=p.col; ctx.fill(); ctx.restore();
    }
    function drawL(l){
      ctx.save(); ctx.translate(l.x,l.y); ctx.rotate(l.rot); ctx.globalAlpha=l.a;
      var w=l.sz*.44,h=l.sz;
      ctx.beginPath(); ctx.moveTo(0,-h);
      ctx.bezierCurveTo(w,-h*.18,w,h*.42,0,h); ctx.bezierCurveTo(-w,h*.42,-w,-h*.18,0,-h);
      ctx.fillStyle=l.col; ctx.fill();
      ctx.globalAlpha=l.a*.38; ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=.38;
      ctx.beginPath(); ctx.moveTo(0,-h); ctx.lineTo(0,h); ctx.stroke(); ctx.restore();
    }
    function loop(){
      ctx.clearRect(0,0,W,H);
      for(var i=0;i<pts.length;i++){
        var p=pts[i]; p.tick++;
        p.vx+=p.drift*Math.sin(p.tick*.028); p.x+=p.vx; p.y+=p.vy;
        p.a+=p.ad; if(p.a>.65||p.a<.05) p.ad*=-1;
        if(p.y<-18||p.x<-32||p.x>W+32){var n=mkP(true);for(var k in n)p[k]=n[k];continue;}
        drawP(p);
      }
      for(var j=0;j<lvs.length;j++){
        var l=lvs[j]; l.tick++;
        l.vx+=l.drift*Math.sin(l.tick*.022); l.x+=l.vx; l.y+=l.vy; l.rot+=l.rv;
        l.a+=l.ad; if(l.a>.44||l.a<.06) l.ad*=-1;
        if(l.y>H+30||l.x<-34||l.x>W+34){var m=mkL(true);for(var q in m)l[q]=m[q];continue;}
        drawL(l);
      }
      rafId=requestAnimationFrame(loop);
    }
    resize();
    window.addEventListener('resize',resize,{passive:true});
    pts=Array.from({length:cnt},function(){return mkP(false);});
    lvs=Array.from({length:leafs},function(){return mkL(false);});
    loop();
    document.addEventListener('visibilitychange',function(){
      if(document.hidden) cancelAnimationFrame(rafId); else loop();
    });
  }

  /* ── kw-reveal ── */
  function initReveal() {
    var els=document.querySelectorAll('.kw-reveal');
    if(!els.length) return;
    if(!('IntersectionObserver' in window)){
      els.forEach(function(e){e.classList.add('kw-reveal--on');}); return;
    }
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var idx=parseInt(en.target.style.getPropertyValue('--kw-i')||'0',10);
        var stagger = isMobile ? 0.05 : 0.11;   /* スマホはstagger短縮 */
        en.target.style.transitionDelay=(idx*stagger)+'s';
        en.target.classList.add('kw-reveal--on');
        obs.unobserve(en.target);
      });
    },{threshold:.06,rootMargin:'0px 0px -24px 0px'});
    els.forEach(function(e){obs.observe(e);});
  }

  /* ── Ripple（PC / マウス端末のみ） ── */
  function initRipple() {
    if(isLowPower) return;   /* スマホ・タッチはスキップ */
    var sel='.btn,.btn--glow,.btn--forest,.btn--ghost,.site-header__cta-btn';
    document.querySelectorAll(sel).forEach(function(btn){
      if(btn.dataset.ripple) return;
      btn.dataset.ripple='1';
      if(getComputedStyle(btn).position==='static') btn.style.position='relative';
      btn.style.overflow='hidden';
      btn.addEventListener('mouseenter',function(e){
        var rc=btn.getBoundingClientRect();
        var r=document.createElement('span'); r.className='kw-ripple-el';
        r.style.left=(e.clientX-rc.left)+'px'; r.style.top=(e.clientY-rc.top)+'px';
        btn.appendChild(r); r.addEventListener('animationend',function(){r.remove();});
      });
    });
  }

  /* ── パララックス（Hero のみ・PC） ── */
  function initParallax() {
    var heroEl=document.querySelector('.hero'); if(!heroEl) return;
    var layF=heroEl.querySelector('.hero__layer--forest');
    var layFig=heroEl.querySelector('.hero__layer--figure');
    var m1=heroEl.querySelector('.hero__mist--1');
    var m2=heroEl.querySelector('.hero__mist--2');
    var m3=heroEl.querySelector('.hero__mist--3');
    var con=heroEl.querySelector('.hero__content');
    var pending=false,sY=0;
    function upd(){
      var hh=heroEl.offsetHeight;
      if(sY<hh){
        var y=sY;
        if(layF)   layF.style.transform='scale(1.06) translateY('+(y*.34)+'px)';
        if(layFig) layFig.style.transform='translateY('+(y*.22)+'px)';
        if(m1)     m1.style.transform='translateY('+(y*.18)+'px)';
        if(m2)     m2.style.transform='translateY('+(y*.10)+'px)';
        if(m3)     m3.style.transform='translateY('+(y*.14)+'px)';
        if(con)    con.style.transform='translateY('+(y*.12)+'px)';
      }
      pending=false;
    }
    window.addEventListener('scroll',function(){
      sY=window.scrollY||window.pageYOffset;
      if(!pending){pending=true;requestAnimationFrame(upd);}
    },{passive:true});
  }

  /* ── Hero アニメ ── */
  function initHeroAnim(){
    document.querySelectorAll('[data-hero-anim]').forEach(function(el){
      var d=parseInt(el.getAttribute('data-hero-anim'),10)*160+300;
      setTimeout(function(){el.classList.add('hero-anim--visible');},d);
    });
  }

  /* ── ヘッダー スクロール ── */
  function initHeader(){
    var hdr=document.getElementById('siteHeader'); if(!hdr) return;
    if(hdr.classList.contains('header--page')) return;
    window.addEventListener('scroll',function(){
      hdr.classList.toggle('is-scrolled',window.scrollY>40);
    },{passive:true});
  }

  /* ── ハンバーガー ── */
  function initHamburger(){
    var ham=document.getElementById('hamburger');
    var mob=document.getElementById('mobileMenu');
    if(!ham||!mob) return;
    ham.addEventListener('click',function(){
      var open=ham.classList.toggle('is-open');
      mob.classList.toggle('is-open',open);
      ham.setAttribute('aria-expanded',String(open));
      mob.setAttribute('aria-hidden',String(!open));
      document.body.style.overflow = open ? 'hidden' : '';   /* スクロール制御 */
    });
  }

  /* ── スムーススクロール ── */
  function initSmooth(){
    document.querySelectorAll('a[href^="#"]').forEach(function(a){
      a.addEventListener('click',function(e){
        var id=a.getAttribute('href').slice(1);
        var el=document.getElementById(id);
        if(el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth',block:'start'}); }
      });
    });
  }

  /* ── グローバル（HTML onclick 用） ── */
  window.closeMobileMenu=function(){
    var ham=document.getElementById('hamburger');
    var mob=document.getElementById('mobileMenu');
    if(ham){ham.classList.remove('is-open');ham.setAttribute('aria-expanded','false');}
    if(mob){mob.classList.remove('is-open');mob.setAttribute('aria-hidden','true');}
    document.body.style.overflow='';
  };

  /* ── 起動 ── */
  function boot(){
    initHeader();
    initHamburger();
    initSmooth();
    initReveal();
    initRipple();
    initHeroAnim();
    if(!isLowPower) initParallax();

    /* ─── Canvas ─────────────────────────────────
       スマホ: Hero / PageHero のみ軽量起動
               セクション背景Canvas はスキップ（CSS で display:none 済）
       PC:     全Canvas 通常品質
    ────────────────────────────────────────────── */

    /* Hero（index.html） */
    var heroCanvas=document.getElementById('heroCanvas');
    var heroEl=document.querySelector('.hero');
    if(heroCanvas && heroEl){
      makeParticleCanvas(heroCanvas, heroEl, {
        count:  isMobile ? 55  : 220,
        leaves: isMobile ? 4   : 20,
        cols:['#ffffff','#f8ffe8','#e8ffd0','#d4f898','#f0ffd8','#e0ffb8','#ccf898','#fdfff0']
      });
    }

    /* ページヒーロー（サブページ） */
    var pgCanvas=document.getElementById('pageHeroCanvas');
    var pgHero=document.querySelector('.page-hero');
    if(pgCanvas && pgHero){
      makeParticleCanvas(pgCanvas, pgHero, {
        count: isMobile ? 28 : 100,
        cols:['#ffffff','#f0ffe0','#d8f8a0','#e8ffc8','#ccf898']
      });
    }

    /* セクション背景 Canvas（スマホはスキップ） */
    if(!isMobile){
      [
        ['ctaCanvas',      '#cta-mid'],
        ['storyCanvas',    '#story'],
        ['finalCanvas',    '.cta-final'],
        ['registerCanvas', '.register-card']
      ].forEach(function(pair){
        var c=document.getElementById(pair[0]);
        var h=document.querySelector(pair[1]);
        if(c && h) makeParticleCanvas(c, h, {count:55});
      });
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
}());

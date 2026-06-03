
/* ════ HAVAYOlU RENK HARİTASI ════ */
var AIRLINE_CLR = {
  TK:'#C8102E',PC:'#FF6200',XQ:'#0057A8',SU:'#003893',W6:'#C60C30',
  XC:'#CC2200',U2:'#FF6600',FR:'#073590',VY:'#F9C900',ZF:'#00AEEF',
  UT:'#005BAA',EK:'#C60C30',QR:'#5C0632',LH:'#05164D',AJ:'#1B3D6F',
  DY:'#D81939',KL:'#009BDE',BA:'#075AAA',AF:'#002157',IB:'#CC0000'
};
function airlineColor(ucusKod){
  var code=(ucusKod||'').replace(/\s/g,'').substring(0,2).toUpperCase();
  return AIRLINE_CLR[code]||null;
}

/* ════ MOBİL YARDIMCI ════ */
function haptic(t){
  if(!('vibrate' in navigator)) return;
  if(t==='light') navigator.vibrate(8);
  else if(t==='medium') navigator.vibrate(22);
  else if(t==='success') navigator.vibrate([8,40,8]);
}
function mnavToday(){ haptic('light'); var t=getToday(); if(document.startViewTransition) document.startViewTransition(function(){showDate(t);}); else showDate(t); $('.mnav-btn').removeClass('active'); $('#mnav-today').addClass('active'); }
function mnavRefresh(){ haptic('light'); _lastDataStr=''; yukle(); }
function mnavPrint(){ haptic('light'); printList(selectedDate||getToday()); }

function initPullToRefresh(){
  if(!('ontouchstart' in window)) return;
  var sy0=0,pulling=false,$ind=$('#ptr-ind');
  document.addEventListener('touchstart',function(e){sy0=e.touches[0].clientY;},{passive:true});
  document.addEventListener('touchmove',function(e){
    if(window.scrollY!==0) return;
    var dy=e.touches[0].clientY-sy0;
    if(dy>10){pulling=true;var p=Math.min(dy/90,1);$ind.css({opacity:p,top:(dy*.38-42)+'px'});$ind.text(dy>80?'🔄 Bırak':'↓ Yenilemek için çek');}
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(!pulling) return;
    var dy=e.changedTouches[0].clientY-sy0;
    $ind.css({top:'-50px',opacity:0});
    if(dy>80){haptic('success');_lastDataStr='';yukle();}
    pulling=false;sy0=0;
  });
}

function initLongPress(){
  if(!('ontouchstart' in window)) return;
  var timer,$menu=$('#lp-menu');
  function closeMenu(){$menu.removeClass('open');}
  $('#lp-bg,#lp-cancel').on('click',closeMenu);
  $(document).on('touchstart','.trow',function(e){
    var $r=$(this);
    timer=setTimeout(function(){
      haptic('medium');
      var tr=$r.data('tarih'),sa=$r.data('saat'),d=null;
      for(var i=0;i<allData.length;i++){if(allData[i].tarih===tr&&allData[i].saat===sa){d=allData[i];break;}}
      if(!d) return;
      $('#lp-title').text(d.musteri||'Transfer');
      var items=[];
      if(d.surucuTel) items.push({i:'💬',t:'WhatsApp — Şoför',fn:function(){window.open('https://wa.me/'+d.surucuTel.replace(/\D/g,''));closeMenu();}});
      if(d.musteriTel&&isYonetici()) items.push({i:'📞',t:'Müşteriyi Ara',fn:function(){window.open('tel:+'+d.musteriTel.replace(/\D/g,''));closeMenu();}});
      items.push({i:'🎫',t:'Voucher Göster',fn:function(){var idx=null;window.__voucherRows&&window.__voucherRows.forEach(function(x,n){if(x.musteri===d.musteri&&x.saat===d.saat)idx=n;});if(idx!==null)showVoucher(idx);closeMenu();}});
      items.push({i:'📋',t:'Bilgileri Kopyala',fn:function(){var txt=(d.musteri||'')+' · '+d.saat+' · ✈'+(d.ucus||'')+' · '+(d.nereden||'')+' → '+(d.nereye||'');if(navigator.clipboard)navigator.clipboard.writeText(txt);haptic('success');closeMenu();}});
      $('#lp-items').html(items.map(function(x,n){return '<button class="lp-item" data-n="'+n+'"><span class="li">'+x.i+'</span>'+x.t+'</button>';}).join(''));
      $('#lp-items .lp-item').each(function(n){$(this).on('click',function(){items[n].fn();});});
      $menu.addClass('open');
    },600);
  }).on('touchmove touchend touchcancel','.trow',function(){clearTimeout(timer);});
}

function initMobileNav(){
  if(!('ontouchstart' in window)) return;
  if(isYonetici()) $('#mnav-add').show();
}

/* ════ CUSTOM CURSOR ════ */
function initCustomCursor(){
  if('ontouchstart' in window) return;
  var $d=$('#cur-dot'),$r=$('#cur-ring'),$sl=$('#spotlight');
  var rx=0,ry=0,tx=0,ty=0;
  $d.css('opacity',1); $r.css('opacity',1);
  $(document).on('mousemove',function(e){
    tx=e.clientX; ty=e.clientY;
    $d.css('transform','translate('+tx+'px,'+ty+'px) translate(-50%,-50%)');
    $sl.css({transform:'translate('+tx+'px,'+ty+'px) translate(-50%,-50%)',opacity:1});
  }).on('mouseenter','button,.trow,.dc,a,.vchr-btn,.st-step',function(){
    $d.addClass('hov'); $r.addClass('hov');
  }).on('mouseleave','button,.trow,.dc,a,.vchr-btn,.st-step',function(){
    $d.removeClass('hov'); $r.removeClass('hov');
  }).on('mousedown',function(){$d.addClass('clk');}).on('mouseup',function(){$d.removeClass('clk');});
  (function loop(){
    rx+=(tx-rx)*.12; ry+=(ty-ry)*.12;
    $r.css('transform','translate('+rx+'px,'+ry+'px) translate(-50%,-50%)');
    requestAnimationFrame(loop);
  })();
}

/* ════ MAGNETİK BUTONLAR ════ */
function initMagnetic(){
  if('ontouchstart' in window) return;
  var MAX=75,STR=.38,tick=false;
  $(document).on('mousemove',function(e){
    if(tick) return; tick=true;
    requestAnimationFrame(function(){
      $('.mag').each(function(){
        var r=this.getBoundingClientRect();
        var cx=r.left+r.width/2,cy=r.top+r.height/2;
        var dx=e.clientX-cx,dy=e.clientY-cy,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<MAX){ var s=(MAX-dist)/MAX;
          $(this).css({transform:'translate('+(dx*s*STR)+'px,'+(dy*s*STR)+'px)',transition:'transform .12s ease'});
        } else { $(this).css({transform:'',transition:'transform .4s cubic-bezier(.16,1,.3,1)'}); }
      });
      tick=false;
    });
  });
}

/* ════ PARALLAX ════ */
function initParallax(){
  /* kaldırıldı — layout thrash yapıyordu */
}

/* ════ WEBGL THREE.JS ════ */
function initWebGL(){
  if(typeof THREE==='undefined'||'ontouchstart' in window) return;
  var old=document.querySelector('canvas[style*="fixed"]'); if(old) old.remove();
  var canvas=document.createElement('canvas');
  canvas.style.cssText='position:fixed;inset:0;z-index:0;pointer-events:none';
  document.body.insertBefore(canvas,document.body.firstChild);
  var W=innerWidth,H=innerHeight;
  var scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(60,W/H,.1,100);
  cam.position.z=6;
  var ren=new THREE.WebGLRenderer({canvas:canvas,alpha:true,antialias:false});
  ren.setSize(W,H); ren.setPixelRatio(Math.min(devicePixelRatio,2)); ren.setClearColor(0,0);
  var N=80,pos=new Float32Array(N*3),vel=[];
  for(var i=0;i<N;i++){
    pos[i*3]=(Math.random()-.5)*22; pos[i*3+1]=(Math.random()-.5)*14; pos[i*3+2]=(Math.random()-.5)*4;
    vel.push(Math.random()*.012+.003);
  }
  var geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(geo,new THREE.PointsMaterial({size:.038,color:0xc9a227,transparent:true,opacity:.48,sizeAttenuation:true})));
  var aMat=new THREE.ShaderMaterial({uniforms:{t:{value:0}},
    vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float t;varying vec2 v;void main(){'
      +'float w=sin(v.x*5.+t*.35)*.5+.5,w2=sin(v.x*7.-t*.2+1.8)*.5+.5;'
      +'float m=sin(v.y*3.14159)*pow(v.y*(1.-v.y)*4.,.6);'
      +'vec3 g=vec3(.79,.635,.155),b=vec3(.1,.18,.45),p=vec3(.28,.14,.52);'
      +'vec3 c=mix(b,g,w*.5)*m*.09+mix(p,b,w2)*m*.05;gl_FragColor=vec4(c,m*.14);}',
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  var am=new THREE.Mesh(new THREE.PlaneGeometry(32,16,32,32),aMat);
  am.position.z=-2; scene.add(am);
  addEventListener('resize',function(){W=innerWidth;H=innerHeight;cam.aspect=W/H;cam.updateProjectionMatrix();ren.setSize(W,H);});
  var clk=new THREE.Clock();
  (function anim(){requestAnimationFrame(anim);
    aMat.uniforms.t.value=clk.getElapsedTime();
    var p=geo.attributes.position.array;
    for(var i=0;i<N;i++){p[i*3+1]+=vel[i];if(p[i*3+1]>7)p[i*3+1]=-7;}
    geo.attributes.position.needsUpdate=true; ren.render(scene,cam);
  })();
}

/* ════ CURSOR GLOW ════ */
function initCursorGlow(){
  if('ontouchstart' in window) return;
  var $g=$('#cursor-glow'), gx=0, gy=0, tx=0, ty=0;
  $(document).on('mousemove',function(e){ tx=e.clientX; ty=e.clientY; $g.css('opacity',1); })
             .on('mouseleave',function(){ $g.css('opacity',0); });
  (function loop(){
    gx+=(tx-gx)*.1; gy+=(ty-gy)*.1;
    $g.css('transform','translate('+gx+'px,'+gy+'px) translate(-50%,-50%) translateZ(0)');
    requestAnimationFrame(loop);
  })();
}

/* ════ 3D KART TILT ════ */
function init3DTilt(){
  if('ontouchstart' in window) return;
  $(document).on('mousemove','.trow',function(e){
    var r=this.getBoundingClientRect();
    var x=(e.clientX-r.left)/r.width-.5;
    var y=(e.clientY-r.top)/r.height-.5;
    $(this).css({transform:'perspective(900px) rotateX('+(-y*4)+'deg) rotateY('+x*7+'deg) translateY(-2px)',transition:'transform .07s ease'});
  }).on('mouseleave','.trow',function(){
    $(this).css({transform:'',transition:'transform .35s ease, box-shadow .22s ease'});
  });
}

/* ════ ZENGİN TOOLTIP ════ */
function initRichTooltip(){
  if('ontouchstart' in window) return;
  var $t=$('#rich-tip');
  $(document).on('mouseenter','.cust-name',function(e){
    var $r=$(this).closest('.trow');
    var tr=$r.data('tarih'), sa=$r.data('saat'), d=null;
    for(var i=0;i<allData.length;i++){ if(allData[i].tarih===tr&&allData[i].saat===sa){d=allData[i];break;} }
    if(!d) return;
    var h='<div class="rt-head">'+esc(d.musteri||'')+'</div>';
    if(d.ucus)       h+='<div class="rt-row"><span>✈</span>'+esc(d.ucus)+'</div>';
    if(d.musteriTel&&isYonetici()) h+='<div class="rt-row"><span>📞</span>+'+esc(d.musteriTel)+'</div>';
    if(d.arac)       h+='<div class="rt-row"><span>🚗</span>'+esc(d.arac)+'</div>';
    if(d.kisi)       h+='<div class="rt-row"><span>👤</span>'+esc(d.kisi)+' kişi</div>';
    if(d.nereden)    h+='<div class="rt-row rf"><span>↑</span>'+esc(d.nereden)+'</div>';
    if(d.nereye)     h+='<div class="rt-row rt"><span>↓</span>'+esc(d.nereye)+'</div>';
    if(d.surucu)     h+='<div class="rt-row"><span>🚘</span>'+esc(d.surucu)+'</div>';
    $t.html(h).show();
  }).on('mousemove','.cust-name',function(e){
    var x=e.clientX+18, y=e.clientY-8;
    if(x+250>innerWidth) x=e.clientX-268;
    if(y+220>innerHeight) y=e.clientY-230;
    $t.css({left:x,top:y});
  }).on('mouseleave','.cust-name',function(){ $t.hide(); });
}

/* ════ SAAT BAZLI TEMA ════ */
function applyTimeTheme(){
  var h=new Date().getHours();
  $('body').removeClass('theme-morning theme-noon theme-night');
  if(h>=5&&h<11)       $('body').addClass('theme-morning');
  else if(h>=11&&h<18) $('body').addClass('theme-noon');
  else                  $('body').addClass('theme-night');
}

/* ════ STATUS FEEDBACK ════ */
function showStatusFeedback(btn){
  var $r=$(btn).closest('.trow');
  if(!$r.length) return;
  var rect=$r[0].getBoundingClientRect();
  var $fb=$('<div class="st-feedback">✓</div>').css({top:rect.top+rect.height/2-18,left:rect.right-56});
  $('body').append($fb);
  setTimeout(function(){ $fb.addClass('show'); },10);
  setTimeout(function(){ $fb.removeClass('show').addClass('out'); },900);
  setTimeout(function(){ $fb.remove(); },1250);
}

/* ════ PARTİKÜLLER ════ */
function initParticles(){
  var c=document.createElement('canvas');
  c.style.cssText='position:fixed;inset:0;z-index:0;pointer-events:none';
  document.body.insertBefore(c,document.body.firstChild);
  var ctx=c.getContext('2d'), W, H, pts=[], _paused=true;
  function resize(){ W=c.width=innerWidth; H=c.height=innerHeight; }
  resize(); addEventListener('resize',resize);
  for(var i=0;i<28;i++) pts.push({
    x:Math.random()*innerWidth, y:Math.random()*innerHeight,
    r:Math.random()*1.1+0.3, sp:Math.random()*.28+.06, op:Math.random()*.28+.04
  });
  window._ptPause=function(v){_paused=v;};
  (function draw(){
    if(!_paused){
      ctx.clearRect(0,0,W,H);
      pts.forEach(function(p){
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(201,162,39,'+p.op+')'; ctx.fill();
        p.y-=p.sp; if(p.y<-4){p.y=H+4;p.x=Math.random()*W;}
      });
    }
    requestAnimationFrame(draw);
  })();
}

/* ════ SONRAKI TRANSFER VURGULA ════ */
function highlightNextTransfer(){
  $('.trow').removeClass('next-up');
  if(!allData.length) return;
  var now=new Date(), todayStr=fmtK(now);
  var nowM=now.getHours()*60+now.getMinutes();
  var upcoming=allData.filter(function(d){
    if(d.tarih!==todayStr) return false;
    var p=(d.saat||'00:00').split(':');
    return (+p[0])*60+(+p[1])>=nowM;
  }).sort(function(a,b){ return a.saat.localeCompare(b.saat); });
  if(upcoming.length){
    var n=upcoming[0];
    $('.trow[data-tarih="'+n.tarih+'"][data-saat="'+n.saat+'"]').first().addClass('next-up');
  }
}

/* ════ CANLI SAAT ════ */
function tickClock(){
  var n=new Date();
  var s=('0'+n.getHours()).slice(-2)+':'+('0'+n.getMinutes()).slice(-2)+':'+('0'+n.getSeconds()).slice(-2);
  var el=document.getElementById('live-clock');
  if(el) el.textContent=s;
}
setInterval(tickClock,1000); tickClock();

/* ════ SAYAÇ ANİMASYONU ════ */
function animateCount(el,to,suffix){
  to=parseInt(to)||0;
  if(to===0){ $(el).text('0 '+suffix); return; }
  var cur=0, step=Math.ceil(to/18);
  var t=setInterval(function(){
    cur=Math.min(cur+step,to);
    $(el).text(cur+' '+suffix);
    if(cur>=to) clearInterval(t);
  },28);
}

/* ════ AUTH ════ */
/* Şifreler burada YOK — GAS Script Properties'te SHA-256 hash olarak saklanır.
   Kaynak kodu görüntüleyen kimse şifreyi bulamaz. */
var _loginBusy = false;
function getRole(){ return localStorage.getItem('ramos_rol')||'karsilama'; }
function isYonetici(){ return getRole()==='yonetici'; }

/* ════ API ════ */
var API = 'https://script.google.com/macros/s/AKfycbzJflnLJr_9C6ppfFMNNb8WlfJljsQl74C7ro9iICPm_COHGI32zKFMG5N-1K-OPKsFEg/exec';
var MO  = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
var GUN = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
var GUN_K = ['Paz','Pts','Sal','Çar','Per','Cum','Cmt'];

var allData = [];
var selectedDate = null;
var isLoading    = false;
var _lastDataStr = ''; /* akıllı polling — gereksiz re-render önle */

function pad(n){ return ('0'+n).slice(-2); }
function fmtK(d){ return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear(); }
function fmtU(d){ return d.getDate()+' '+MO[d.getMonth()]+' '+d.getFullYear()+', '+GUN[d.getDay()]; }
function esc(s){ return $('<span>').text(String(s||'')).html(); }

function parseTarih(s){
  var p=s.split('.');
  if(p.length!==3) return null;
  return new Date(+p[2], +p[1]-1, +p[0]);
}

function getToday()    { return fmtK(new Date()); }
function getTomorrow() { var d=new Date(); d.setDate(d.getDate()+1); return fmtK(d); }

function telLink(v){
  if(!v||v.trim()===''||v.indexOf('ERROR')>-1) return '';
  return '<a href="tel:+'+v.replace(/\s/g,'')+'" class="phn">📞 +'+esc(v)+'</a>';
}

/* ════ BUILD ROW ════ */
function buildRow(d){
  /* Voucher için satırı kaydet */
  if(!window.__voucherRows) window.__voucherRows = [];
  var vIdx = window.__voucherRows.length;
  window.__voucherRows.push(d);

  var saat=esc(d.saat||'-'), isim=esc(d.musteri||'-');
  /* Avatar */
  var _nm=(d.musteri||'').trim();
  var _ini=_nm.split(/\s+/).map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();
  var _hue=0; for(var _ic=0;_ic<_nm.length;_ic++) _hue=(_hue+_nm.charCodeAt(_ic)*37)%360;
  var _avBg='hsl('+_hue+',42%,28%)';
  var nereden=esc(d.nereden||'-'), nereye=esc(d.nereye||'-');
  var ucus=esc(d.ucus||''), kisi=esc(d.kisi||''), arac=esc(d.arac||'');
  var ucusUrl = encodeURIComponent((d.ucus||'').replace(/\s/g,''));
  var surucu=esc(d.surucu||''), plaka=esc(d.surucuPlaka||'');

  var tripHtml='';
  if(ucus&&ucus!=='-'){
    var aClr=airlineColor(d.ucus||'');
    var chipStyle=aClr?'background:'+aClr+'22;border-color:'+aClr+'55;color:'+aClr+'':'';
    tripHtml+='<a class="fl-chip" style="'+chipStyle+'" href="https://www.google.com/search?q='+ucusUrl+'+flight" target="_blank" rel="noopener">✈ '+ucus+'</a>';
  }
  var parts=[];
  if(kisi) parts.push('👤 '+kisi);
  if(arac&&arac!=='-') parts.push(arac);
  if(parts.length) tripHtml+='<div class="td-meta">'+parts.join(' &nbsp;·&nbsp; ')+'</div>';

  /* Karşılamacıda müşteri telefonu gizlenir */
  var mustTel = isYonetici() ? (telLink(d.musteriTel)||'<span class="no-phone">—</span>') : '';

  /* Operasyon stepper */
  var yd    = d.yerel_durum || '';
  var ydLvl = yd==='Karşılandı'?1:yd==='Araçta'?2:yd==='Teslim Edildi'?3:0;
  var sc1=ydLvl>1?' done':ydLvl===1?' active':'';
  var sc2=ydLvl>2?' done':ydLvl===2?' active':'';
  var sc3=ydLvl===3?' active':'';
  var lc1=ydLvl>=2?' done':'', lc2=ydLvl>=3?' done':'';
  var te=esc(d.tarih), se=esc(d.saat), me=esc(d.musteri);
  var stHtml='<div class="st-track">'
    +'<div class="st-step s1'+sc1+'" data-t="'+te+'" data-s="'+se+'" data-m="'+me+'" data-d="Karşılandı">'
      +'<div class="st-dot"></div><div class="st-label">Karşılandı</div></div>'
    +'<div class="st-line'+lc1+'"></div>'
    +'<div class="st-step s2'+sc2+'" data-t="'+te+'" data-s="'+se+'" data-m="'+me+'" data-d="Araçta">'
      +'<div class="st-dot"></div><div class="st-label">Araçta</div></div>'
    +'<div class="st-line'+lc2+'"></div>'
    +'<div class="st-step s3'+sc3+'" data-t="'+te+'" data-s="'+se+'" data-m="'+me+'" data-d="Teslim Edildi">'
      +'<div class="st-dot"></div><div class="st-label">Teslim</div></div>'
    +'</div>';

  var drvHtml;
  if(surucu){
    var dbot=(plaka?'<span class="plaka">'+plaka+'</span>':'')+(telLink(d.surucuTel)||'');
    drvHtml='<div class="drv-name" title="'+surucu+'">'+surucu+'</div>'+(dbot?'<div class="drv-bottom">'+dbot+'</div>':'')+stHtml;
  } else {
    drvHtml='<span class="badge-un">⚠ Atanmadı</span>'+stHtml;
  }

  /* Saatin altına küçük tarih: "29 May" */
  var dateObj = parseTarih(d.tarih||'');
  var tarihKisa = dateObj ? '<div class="td-tarih">'+dateObj.getDate()+' '+MO[dateObj.getMonth()]+'</div>' : '';

  var trowClass = 'trow'+(yd==='Karşılandı'?' yd-karsila':yd==='Araçta'?' yd-aracta':yd==='Teslim Edildi'?' yd-teslim':'');
  return '<tr class="'+trowClass+'" data-tarih="'+esc(d.tarih)+'" data-saat="'+esc(d.saat)+'">'
    +'<td class="td-time"  data-label="SAAT">'+saat+tarihKisa+'</td>'
    +'<td class="td-cust"  data-label="MÜŞTERİ"><div class="cust-inner"><div class="cust-avatar" style="background:'+_avBg+'">'+_ini+'</div><div><div class="cust-name" title="'+isim+'">'+isim+'</div>'+mustTel+'<button class="vchr-btn" data-idx="'+vIdx+'">🎫 Voucher</button></div></div></td>'
    +'<td class="td-trip"  data-label="UÇUŞ / ARAÇ">'+tripHtml+'</td>'
    +'<td class="td-route" data-label="GÜZERGAH">'
      +'<div class="route-vis">'
        +'<div class="rv-row"><span class="rv-dot rv-from-dot"></span><span class="rv-text route-from">'+nereden+'</span></div>'
        +'<div class="rv-dashes"></div>'
        +'<div class="rv-row"><span class="rv-dot rv-to-dot"></span><span class="rv-text route-to">'+nereye+'</span></div>'
      +'</div>'
    +'</td>'
    +'<td class="td-drv"   data-label="ŞOFÖR">'+drvHtml+'</td>'
    +'</tr>';
}

/* ════ TEK TARİH BÖLÜMÜ HTML ════ */
/* afterDt: isteğe bağlı Date — sadece bu andan sonraki transferleri göster (DÜN filtresi için) */
function buildOneSec(tarih, afterDt){
  var dateObj0 = parseTarih(tarih);
  var liste = allData.filter(function(d){
    if(d.tarih !== tarih) return false;
    if(afterDt && dateObj0){
      var tp = (d.saat||'00:00').split(':');
      var dt = new Date(dateObj0.getFullYear(), dateObj0.getMonth(), dateObj0.getDate(),
                        +tp[0]||0, +tp[1]||0, 0);
      if(dt < afterDt) return false;
    }
    return true;
  });
  if(!liste.length) return '';
  liste.sort(function(a,b){ return String(a.saat||'').localeCompare(String(b.saat||'')); });

  var today=getToday(), tomorrow=getTomorrow();
  var dateObj=parseTarih(tarih);
  var emoji, gun, shClass='';

  if(tarih===today){
    emoji='📅'; gun='BUGÜN'; shClass='sh-today';
  } else if(tarih===tomorrow){
    emoji='🌙'; gun='YARIN'; shClass='sh-tmrw';
  } else {
    var dun = fmtK((function(){ var d=new Date(); d.setDate(d.getDate()-1); return d; })());
    emoji = tarih===dun ? '🌙' : '📆';
    gun   = tarih===dun ? 'DÜN' : GUN[dateObj.getDay()].toUpperCase();
  }

  return '<div class="sec">'
    +'<div class="sec-head '+shClass+'">'
      +'<span class="sec-label">'+emoji+' '+gun+'</span>'
      +'<span class="sec-date">'+fmtU(dateObj)+'</span>'
      +(tarih===getToday()
        ? '<span class="sec-today-cnt">'+liste.length+' Transfer</span>'
          +'<button class="print-btn" onclick="printList(\''+tarih+'\')">🖨 Yazdır</button>'
        : '')
    +'</div>'
    +'<div class="tbl-wrap"><table>'
      +'<colgroup><col class="c-time"><col class="c-cust"><col class="c-trip"><col class="c-route"><col class="c-drv"></colgroup>'
      +'<thead><tr>'
        +'<th><span class="th-ico">🕐</span>Saat</th>'
        +'<th><span class="th-ico">👤</span>Müşteri</th>'
        +'<th><span class="th-ico">✈</span>Uçuş / Araç</th>'
        +'<th><span class="th-ico">📍</span>Güzergah</th>'
        +'<th><span class="th-ico">🚗</span>Şoför</th>'
      +'</tr></thead>'
      +'<tbody>'+liste.map(buildRow).join('')+'</tbody>'
    +'</table></div></div>';
}

/* ════ SHOW DATE (tek tarih — yönetici) ════ */
function showDate(tarih){
  window.__voucherRows = [];
  $('#search-input').val(''); $('#srch-clear').hide(); /* tarih değişince arama sıfırla */
  selectedDate = tarih;
  $('.dc').removeClass('active');
  $('.dc[data-date="'+tarih+'"]').addClass('active');

  var html = buildOneSec(tarih);
  var count = allData.filter(function(d){ return d.tarih===tarih; }).length;
  animateCount('#cnt', count, 'Transfer');

  if(!html){
    if(isLoading){
      $('#page').html(buildSkeleton(5));
    } else {
      $('#page').html(emptyState('Bu tarih için transfer bulunamadı','Shadowtransfer\'de bu tarihe ait arrival kaydı yok veya tüm transferler iptal edildi.'));
    }
    return;
  }

  $('#page').css('opacity',0).html(html).animate({opacity:1},180);
  $('.trow').each(function(i){ $(this).css('animation-delay',(i*24)+'ms'); });
  setTimeout(highlightNextTransfer, 200);
}

/* ════ SHOW DATES (çoklu tarih — karşılamacı gece modu) ════ */
function showDates(tarihler){
  window.__voucherRows = [];
  /* DÜN bölümü için: sadece son 2 saat içindeki transferleri göster.
     Eğer hiç transfer yoksa DÜN başlığı da çıkmaz. */
  var now = new Date();
  var twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  var visibleCount = 0;
  var html = tarihler.map(function(tarih, i){
    var cutoff = (i === 0 && tarihler.length > 1) ? twoHoursAgo : null;
    /* Görünen transfer sayısını aynı filtreden geçirerek say */
    var dateObjC = parseTarih(tarih);
    allData.forEach(function(d){
      if(d.tarih !== tarih) return;
      if(cutoff && dateObjC){
        var tp = (d.saat||'00:00').split(':');
        var dt = new Date(dateObjC.getFullYear(), dateObjC.getMonth(), dateObjC.getDate(), +tp[0]||0, +tp[1]||0, 0);
        if(dt < cutoff) return;
      }
      visibleCount++;
    });
    return buildOneSec(tarih, cutoff);
  }).join('');

  animateCount('#cnt', visibleCount, 'Transfer');

  if(!html){
    if(isLoading){
      $('#page').html(buildSkeleton(4));
    } else {
      $('#page').html(emptyState('Bugün için transfer bulunamadı','Bugüne ait arrival transfer kaydı bulunamadı.'));
    }
    return;
  }

  $('#page').css('opacity',0).html(html).animate({opacity:1},180);
  $('.trow').each(function(i){ $(this).css('animation-delay',(i*24)+'ms'); });
  setTimeout(highlightNextTransfer, 200);
}

/* ════ BUILD DATE BAR ════ */
function buildDateBar(data){
  var today=getToday(), tomorrow=getTomorrow();

  /* Count by date */
  var counts={};
  data.forEach(function(d){ counts[d.tarih]=(counts[d.tarih]||0)+1; });

  /* Sort dates ascending */
  var dates=Object.keys(counts).sort(function(a,b){
    var pa=a.split('.'), pb=b.split('.');
    return new Date(+pa[2],+pa[1]-1,+pa[0]) - new Date(+pb[2],+pb[1]-1,+pb[0]);
  });

  if(!dates.length){
    $('#date-chips').html('<span style="font-size:12px;color:#1e3456">Veri yok</span>');
    return;
  }

  /* Seçili tarih görünür olsun: ilk 5'e dahil et */
  var MAX = 5;
  var visible = dates.slice(0, MAX);
  if(selectedDate && visible.indexOf(selectedDate) === -1){
    visible = dates.slice(0, MAX - 1);
    visible.push(selectedDate);
  }
  var hidden = dates.length - visible.length;

  var html='';
  dates.forEach(function(tarih){
    if(visible.indexOf(tarih) === -1) return; /* max 5 */
    var cnt=counts[tarih]||0;
    var cls='dc', label='', extra='';

    if(tarih===today){
      cls+=' dc-today';
      label='📅 Bugün';
    } else if(tarih===tomorrow){
      cls+=' dc-tmrw';
      label='🌙 Yarın';
    } else {
      var d=parseTarih(tarih);
      label=GUN_K[d.getDay()]+' '+d.getDate()+' '+MO[d.getMonth()].slice(0,3);
    }

    if(tarih===selectedDate) cls+=' active';
    html+='<button class="'+cls+'" data-date="'+tarih+'">'+label+'<span class="dc-count">'+cnt+'</span></button>';
  });

  /* "+ N daha" chip'i */
  if(hidden > 0){
    html+='<span class="dc-more">+'+hidden+' daha</span>';
  }

  $('#date-chips').html(html);

  $('#date-chips').off('click').on('click','.dc',function(){
    var t=$(this).data('date'); if(!t) return;
    if(document.startViewTransition){
      document.startViewTransition(function(){showDate(t);});
    } else { showDate(t); }
  });
}

/* ════ ROL UYGULA ════ */
function applyRole(){
  $('.date-bar').show();
  if(isYonetici()){
    $('#add-btn').show();
    $('.date-label, #date-chips').show();
    $('.srch-wrap').css({'flex':'0 1 340px','max-width':'340px'});
  } else {
    $('#add-btn').hide();
    /* karşılamacı: tarih seçimi yok, sadece arama */
    $('.date-label, #date-chips').hide();
    $('.srch-wrap').css({'flex':'1','max-width':'100%','margin-left':'0'});
  }
  $('#logout-btn').text('Çıkış');
}

/* ════ RENDER ════ */
function render(veriler){
  /* Tüm tarihleri trim'le — boşluk/karakter farkı olmasın */
  allData = (veriler||[]).map(function(d){
    return $.extend({}, d, { tarih: String(d.tarih||'').trim() });
  });

  var today    = getToday();
  var tomorrow = getTomorrow();
  var counts   = {};
  allData.forEach(function(d){ if(d.tarih) counts[d.tarih]=(counts[d.tarih]||0)+1; });

  var saat=new Date().toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  $('#upd').text('Son güncelleme: '+saat);

  if(isYonetici()){
    if(!selectedDate){
      selectedDate = today;
    } else if(!counts[selectedDate]){
      selectedDate = counts[today] ? today
        : (counts[tomorrow] ? tomorrow
        : (Object.keys(counts).sort(function(a,b){
            var pa=a.split('.'),pb=b.split('.');
            return new Date(+pa[2],+pa[1]-1,+pa[0])-new Date(+pb[2],+pb[1]-1,+pb[0]);
           })[0] || today));
    }
    buildDateBar(allData);
    showDate(selectedDate);
  } else {
    /* Karşılamacı:
       00:00 - 02:00 → dün + bugün (geç inen uçaklar için)
       02:00 - 23:59 → sadece bugün */
    var _now = new Date();
    if(_now.getHours() < 2){
      var _prev = new Date(_now);
      _prev.setDate(_now.getDate()-1);
      showDates([fmtK(_prev), fmtK(_now)]);
    } else {
      showDate(today);
    }
  }
}

/* ════ VOUCHER ════ */
function showVoucher(idx){
  var d = window.__voucherRows && window.__voucherRows[idx];
  if(!d) return;
  var name = (d.musteri||'').trim().toUpperCase() || 'MİSAFİR';
  $('#v-cust-name').text(name);
  $('#voucher-overlay').addClass('open');
}

/* ════ TRANSFER EKLE ════ */
function openAddModal(){
  $('#add-err').text('');
  $('#add-submit-btn').prop('disabled',false).text('Kaydet →');
  /* Bugünün tarihini varsayılan yap */
  if(!$('#f-tarih').val()) $('#f-tarih').val(getToday());
  $('#add-modal').addClass('open');
  setTimeout(function(){ $('#f-musteri').focus(); },200);
}
function closeAddModal(){ $('#add-modal').removeClass('open'); }

function submitAddTransfer(){
  var tarih   = $('#f-tarih').val().trim();
  var saat    = $('#f-saat').val().trim();
  var musteri = $('#f-musteri').val().trim();
  var nereden = $('#f-nereden').val().trim();
  var nereye  = $('#f-nereye').val().trim();
  if(!tarih||!saat||!musteri||!nereye){
    $('#add-err').text('❌ Tarih, Saat, Müşteri ve Nereye zorunludur');
    return;
  }
  $('#add-submit-btn').prop('disabled',true).text('Kaydediliyor…');
  var tok = localStorage.getItem('ramos_token')||'';
  var cb  = '__add'+Date.now();
  var s   = document.createElement('script');
  s.src   = API
    +'?action=add&tok='+encodeURIComponent(tok)
    +'&tarih='+encodeURIComponent(tarih)
    +'&saat='+encodeURIComponent(saat)
    +'&musteri='+encodeURIComponent(musteri)
    +'&musteriTel='+encodeURIComponent($('#f-tel').val().trim())
    +'&ucus='+encodeURIComponent($('#f-ucus').val().trim())
    +'&kisi='+encodeURIComponent($('#f-kisi').val().trim())
    +'&arac='+encodeURIComponent($('#f-arac').val().trim())
    +'&nereden='+encodeURIComponent(nereden)
    +'&nereye='+encodeURIComponent(nereye)
    +'&surucu='+encodeURIComponent($('#f-surucu').val().trim())
    +'&surucuPlaka='+encodeURIComponent($('#f-plaka').val().trim())
    +'&surucuTel='+encodeURIComponent($('#f-stel').val().trim())
    +'&cb='+cb;
  var timer = setTimeout(function(){
    delete window[cb]; $(s).remove();
    $('#add-err').text('❌ Sunucu yanıt vermedi, tekrar dene');
    $('#add-submit-btn').prop('disabled',false).text('Kaydet →');
  }, 20000);
  window[cb] = function(res){
    clearTimeout(timer); delete window[cb]; $(s).remove();
    if(res && res.ok){
      closeAddModal();
      /* Formu temizle */
      $('#f-tarih,#f-saat,#f-musteri,#f-tel,#f-ucus,#f-kisi,#f-arac,#f-nereye,#f-surucu,#f-plaka,#f-stel').val('');
      _lastDataStr = ''; /* cache'i iptal et — yeni veri çekilsin */
      yukle();
    } else {
      $('#add-err').text('❌ Kayıt başarısız, tekrar dene');
      $('#add-submit-btn').prop('disabled',false).text('Kaydet →');
    }
  };
  $('head').append(s);
}

/* ════ OPERASYON DURUMU GÜNCELLE ════ */
function updateStatus(tarih, saat, musteri, durum, btn){
  var tok    = localStorage.getItem('ramos_token')||'';
  var cb     = '__st'+Date.now();
  var s      = document.createElement('script');
  var $track = $(btn).closest('.st-track');
  s.src = API
    +'?action=status&tok='+encodeURIComponent(tok)
    +'&tarih='+encodeURIComponent(tarih)
    +'&saat='+encodeURIComponent(saat)
    +'&musteri='+encodeURIComponent(musteri)
    +'&durum='+encodeURIComponent(durum)
    +'&cb='+cb;
  $track.addClass('loading');
  var timer = setTimeout(function(){
    $track.removeClass('loading'); delete window[cb]; $(s).remove();
  }, 15000);
  window[cb] = function(res){
    clearTimeout(timer); delete window[cb]; $(s).remove();
    $track.removeClass('loading');
    if(res && res.ok){
      _lastDataStr = '';
      haptic('success');
      showStatusFeedback(btn);
      /* Stepper optimistik güncelleme */
      var lvl = durum==='Karşılandı'?1:durum==='Araçta'?2:durum==='Teslim Edildi'?3:0;
      $track.find('.st-step').each(function(i){
        var n=i+1;
        $(this).removeClass('done active').addClass(n<lvl?'done':n===lvl?'active':'');
      });
      $track.find('.st-line').each(function(i){
        $(this).toggleClass('done', i+1 < lvl);
      });
      var $row = $track.closest('.trow');
      $row.removeClass('yd-karsila yd-aracta yd-teslim');
      if(durum==='Karşılandı')      $row.addClass('yd-karsila');
      else if(durum==='Araçta')     $row.addClass('yd-aracta');
      else if(durum==='Teslim Edildi') $row.addClass('yd-teslim');
    }
  };
  $('head').append(s);
}

/* ════ SKELETON ════ */
function buildSkeleton(rows){
  rows = rows || 4;
  var r = '';
  for(var i=0; i<rows; i++){
    r += '<tr class="sk-row">'
      +'<td><span class="sk-line" style="width:68px;height:36px;margin-bottom:7px"></span>'
          +'<span class="sk-line" style="width:44px;height:12px"></span></td>'
      +'<td><span class="sk-line" style="width:150px;height:15px;margin-bottom:9px"></span>'
          +'<span class="sk-line" style="width:100px;height:11px"></span></td>'
      +'<td><span class="sk-line" style="width:84px;height:22px;border-radius:20px;margin-bottom:9px"></span>'
          +'<span class="sk-line" style="width:96px;height:11px"></span></td>'
      +'<td><span class="sk-line" style="width:130px;height:13px;margin-bottom:9px"></span>'
          +'<span class="sk-line" style="width:110px;height:13px"></span></td>'
      +'<td><span class="sk-line" style="width:120px;height:14px;margin-bottom:9px"></span>'
          +'<span class="sk-line" style="width:72px;height:11px"></span></td>'
      +'</tr>';
  }
  return '<div class="sec"><div class="sk-head">'
    +'<span class="sk-line" style="width:100px;height:20px"></span>'
    +'<span class="sk-line" style="width:170px;height:12px;margin-left:6px"></span>'
    +'</div>'
    +'<div class="tbl-wrap"><table>'
    +'<colgroup><col class="c-time"><col class="c-cust"><col class="c-trip"><col class="c-route"><col class="c-drv"></colgroup>'
    +'<tbody>'+r+'</tbody></table></div></div>';
}

function emptyState(title, sub){
  return '<div class="ep">'
    +'<div class="ep-ico">✈</div>'
    +'<div class="ep-title">'+title+'</div>'
    +(sub ? '<div class="ep-sub">'+sub+'</div>' : '')
    +'</div>';
}

/* ════ YAZDIR — PRINT EXCELLENCE ════ */
function printList(tarih){
  var liste=allData.filter(function(d){return d.tarih===tarih;});
  liste.sort(function(a,b){return String(a.saat||'').localeCompare(String(b.saat||''));});
  var dateObj=parseTarih(tarih), tarihStr=dateObj?fmtU(dateObj):tarih;
  var showTel=isYonetici();
  var totalPax=liste.reduce(function(s,d){return s+(+d.kisi||0);},0);
  var assigned=liste.filter(function(d){return d.surucu;}).length;

  var shield='<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" width="48" height="58">'
    +'<defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%">'
    +'<stop offset="0%" stop-color="#f0d060"/><stop offset="50%" stop-color="#c9a227"/><stop offset="100%" stop-color="#8a6010"/>'
    +'</linearGradient></defs>'
    +'<path d="M50 4 L96 22 L96 60 Q96 91 50 117 Q4 91 4 60 L4 22 Z" fill="url(#pg)"/>'
    +'<path d="M50 13 L88 29 L88 60 Q88 87 50 109 Q12 87 12 60 L12 29 Z" fill="#07091a"/>'
    +'<text x="50" y="78" text-anchor="middle" font-family="Georgia,serif" font-size="54" font-weight="bold" fill="url(#pg)">R</text>'
    +'</svg>';

  var rows=liste.map(function(d,i){
    var even=i%2===1;
    var hasDriver=!!d.surucu;
    return '<tr style="background:'+(even?'#f8fafc':'#fff')+'">'
      +'<td class="td-time">'+esc(d.saat||'')+'</td>'
      +'<td><strong>'+esc(d.musteri||'')+'</strong>'
        +(showTel&&d.musteriTel?'<br><small>📞 +'+esc(d.musteriTel)+'</small>':'')+'</td>'
      +'<td>'+(d.ucus?'<span class="chip-ucus">✈ '+esc(d.ucus)+'</span>':'<span class="nd">—</span>')+'</td>'
      +'<td class="ctr">'+esc(d.kisi||'—')+'</td>'
      +'<td class="sm">'+esc(d.arac||'—')+'</td>'
      +'<td><span class="from">↑</span> '+esc(d.nereden||'')+'<br><span class="to">↓</span> '+esc(d.nereye||'')+'</td>'
      +'<td><strong>'+esc(d.surucu||'—')+'</strong>'
        +(d.surucuPlaka?'<br><span class="plaka">'+esc(d.surucuPlaka)+'</span>':'')
        +(d.surucuTel?'<br><small>📞 +'+esc(d.surucuTel)+'</small>':'')+'</td>'
      +'<td><span class="badge-'+(hasDriver?'ok':'no')+'">'+(hasDriver?(d.durum||'Onaylandı'):'⚠ Atanmadı')+'</span></td>'
      +'</tr>';
  }).join('');

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<title>RAMOS NJT — '+tarih+'</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:"Inter",sans-serif;background:#fff;color:#111;padding:22px 26px;font-size:12px}'
    +'.lh{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;margin-bottom:20px;border-bottom:3px solid #c9a227}'
    +'.brand{display:flex;align-items:center;gap:16px}'
    +'.co-name{font-family:"Cormorant Garamond",serif;font-size:26px;font-weight:700;color:#07091a;letter-spacing:.5px;line-height:1.1}'
    +'.co-sub{font-size:9px;font-weight:700;color:#c9a227;letter-spacing:3.5px;text-transform:uppercase;margin-top:4px}'
    +'.doc-r{text-align:right;font-size:11px;color:#666}'
    +'.doc-r strong{font-size:14px;color:#111;display:block;font-family:"Cormorant Garamond",serif;font-weight:700;letter-spacing:.3px}'
    +'.summary{display:flex;gap:0;margin-bottom:20px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}'
    +'.si{flex:1;padding:12px 18px;border-right:1px solid #e5e7eb}'
    +'.si:last-child{border-right:none}'
    +'.si label{font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px}'
    +'.si strong{font-size:22px;font-weight:900;color:#07091a;font-family:"Cormorant Garamond",serif}'
    +'table{width:100%;border-collapse:collapse}'
    +'thead{background:#07091a}'
    +'th{padding:9px 12px;text-align:left;font-size:9px;font-weight:700;color:#c9a227;text-transform:uppercase;letter-spacing:1.2px;white-space:nowrap}'
    +'td{padding:9px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:11px}'
    +'.td-time{font-size:18px;font-weight:900;color:#07091a;letter-spacing:-1px;white-space:nowrap;font-family:"Cormorant Garamond",serif}'
    +'.chip-ucus{background:#1e1b4b;color:#a5b4fc;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap}'
    +'.ctr{text-align:center;font-weight:700}'
    +'.sm{color:#666}'
    +'.from{color:#059669;font-weight:700}'
    +'.to{color:#7c3aed;font-weight:700}'
    +'.plaka{font-family:monospace;font-size:10px;background:#f3f4f6;padding:1px 6px;border-radius:3px;color:#666}'
    +'.nd{color:#ccc}'
    +'small{color:#888;font-size:10px}'
    +'.badge-ok{background:#dcfce7;color:#166534;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap}'
    +'.badge-no{background:#fee2e2;color:#991b1b;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap}'
    +'.footer{margin-top:18px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#bbb}'
    +'@media print{@page{margin:8mm;size:A4 landscape}body{padding:0}}</style>'
    +'</head><body>'
    +'<div class="lh"><div class="brand">'+shield+'<div><div class="co-name">RAMOS NJT</div><div class="co-sub">VIP Transfer</div></div></div>'
    +'<div class="doc-r"><strong>Arrival Transfer Listesi</strong>'+tarihStr+'<br>Basım: '+new Date().toLocaleString('tr-TR')+'</div></div>'
    +'<div class="summary">'
    +'<div class="si"><label>Transfer</label><strong>'+liste.length+'</strong></div>'
    +'<div class="si"><label>Toplam Kişi</label><strong>'+totalPax+'</strong></div>'
    +'<div class="si"><label>Atandı</label><strong>'+assigned+'</strong></div>'
    +'<div class="si"><label>Bekliyor</label><strong>'+(liste.length-assigned)+'</strong></div>'
    +'</div>'
    +'<table><thead><tr><th>Saat</th><th>Müşteri'+(showTel?' / Tel':'')+'</th><th>Uçuş</th><th>Kişi</th><th>Araç</th><th>Güzergah</th><th>Şoför / Plaka / Tel</th><th>Durum</th></tr></thead>'
    +'<tbody>'+rows+'</tbody></table>'
    +'<div class="footer"><span>shadowtransfer.com · RAMOS NJT VIP Transfer · Gizli — Yalnızca dahili kullanım</span>'
    +'<span>'+tarihStr+' · '+new Date().toLocaleTimeString('tr-TR')+'</span></div>'
    +'<script>window.onload=function(){window.print()}<\/script>'
    +'</body></html>';

  var w=window.open('','_blank','width=1350,height=800');
  w.document.write(html); w.document.close();
}

/* ════ FETCH ════ */
/* Cache: 3 saatlik VE aynı gün içinde — gece yarısı geçişinde kendiliğinden iptal olur */
function isCacheValid(ts){
  if(!ts) return false;
  if((Date.now()-ts) > 3*60*60*1000) return false;
  var cd=new Date(ts), nd=new Date();
  return cd.getDate()===nd.getDate() &&
         cd.getMonth()===nd.getMonth() &&
         cd.getFullYear()===nd.getFullYear();
}
function yukle(){
  if(localStorage.getItem('ramos_auth')!=='ok') return;
  if(isLoading) return;                        /* çakışan istek engelle */

  /* 1) Cache: max 3 saat geçerli */
  var cacheRaw = localStorage.getItem('ramos_cache');
  var cacheTs  = parseInt(localStorage.getItem('ramos_cache_ts')||'0');
  var cacheOk  = cacheRaw && isCacheValid(cacheTs);

  /* isLoading ÖNCE true yapılıyor — cache render sırasında da
     "transfer bulunamadı" yerine "yükleniyor" göstermek için */
  isLoading = true;

  if(cacheOk){
    try {
      render(JSON.parse(cacheRaw));
      $('#upd').text('Önbellek · güncelleniyor…');
    } catch(e){ cacheOk = false; }
  }

  /* 2) Taze veri çek */
  if(!cacheOk){
    $('#page').html(buildSkeleton(5));
    $('#cnt').text('— Transfer');
  }

  var cb   = '__r' + Date.now();
  var s    = document.createElement('script');
  var _tok = localStorage.getItem('ramos_token') || '';
  s.src    = API + '?tok=' + encodeURIComponent(_tok) + '&cb=' + cb + '&t=' + Date.now();

  /* 55 sn içinde cevap gelmezse sıfırla ve yeniden dene */
  var timer = setTimeout(function(){
    isLoading = false; 
    delete window[cb]; $(s).remove();
    if(allData.length === 0){
      $('#upd').text('⚠ Sunucu uyandırılıyor…');
      $('#page').html(buildSkeleton(4));
      setTimeout(yukle, 10000);
    } else {
      $('#upd').text('⚠ Zaman aşımı — yenileniyor…');
    }
  }, 55000);

  s.onerror = function(){
    clearTimeout(timer);
    isLoading = false; 
    delete window[cb]; $(s).remove();
    if(allData.length === 0){
      $('#upd').text('⚠ Bağlantı hatası — yeniden deneniyor…');
      setTimeout(yukle, 10000);
    } else {
      $('#upd').text('⚠ Bağlantı hatası');
    }
  };

  window[cb] = function(data){
    clearTimeout(timer);
    isLoading = false;

    /* Token geçersiz → çıkış */
    if(data && data.error === 'unauthorized'){
      
      localStorage.removeItem('ramos_auth'); localStorage.removeItem('ramos_token');
      localStorage.removeItem('ramos_rol');  localStorage.removeItem('ramos_login_ts');
      location.reload(); return;
    }

    /* API boş döndürdüyse ve elimizde veri varsa → ekranı bozma, geçici hata */
    if(!data || !data.length){
      if(allData.length > 0){
        
        $('#upd').text('⚠ Sunucu boş döndü — önbellek korunuyor');
        delete window[cb]; $(s).remove(); return;
      }
    }

    /* Kısmi okuma koruması */
    if(data && data.length && selectedDate && allData.length > 0){
      var _eski = allData.filter(function(d){ return (d.tarih||'').trim()===selectedDate; }).length;
      var _yeni = data.filter(function(d){ return (d.tarih||'').trim()===selectedDate; }).length;
      if(_eski > 0 && _yeni === 0){
        
        $('#upd').text('⚠ Geçici okuma hatası — veriler korunuyor');
        delete window[cb]; $(s).remove(); return;
      }
    }

    /* Akıllı polling: veri değişmediyse ekranı yeniden çizme */
    var newStr = JSON.stringify(data);
    if(newStr === _lastDataStr && allData.length > 0){
      
      var st = new Date().toLocaleString('tr-TR',{hour:'2-digit',minute:'2-digit'});
      $('#upd').text('Son güncelleme: '+st);
      delete window[cb]; $(s).remove(); return;
    }
    _lastDataStr = newStr;
    

    try {
      localStorage.setItem('ramos_cache',    JSON.stringify(data));
      localStorage.setItem('ramos_cache_ts', String(Date.now()));
    } catch(e){}
    render(data);
    delete window[cb];
    $(s).remove();
  };

  $('head').append(s);
}

/* ════ SESSION ════ */
var SESSION_MS = 2 * 60 * 60 * 1000; /* 2 saat */

function checkSession(){
  if(localStorage.getItem('ramos_auth')!=='ok') return false;
  var ts = parseInt(localStorage.getItem('ramos_login_ts')||'0');
  if(ts && (Date.now() - ts) > SESSION_MS){
    localStorage.removeItem('ramos_auth');
    localStorage.removeItem('ramos_token');
    localStorage.removeItem('ramos_rol');
    localStorage.removeItem('ramos_login_ts');
    location.reload();
    return false;
  }
  return true;
}

/* ════ LOGIN / AUTH ════ */
async function doLogin(){
  if(_loginBusy) return;
  var u = $('#l-user').val().trim().toLowerCase();
  var p = $('#l-pass').val();
  if(!u || !p) return;

  _loginBusy = true;
  $('#l-btn').prop('disabled', true).text('Giriş yapılıyor…');

  /* Şifreyi SHA-256 ile hashle — düz metin hiçbir yerde saklanmaz/gönderilmez */
  var hashHex;
  try {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
    hashHex = Array.from(new Uint8Array(buf)).map(function(b){
      var h = b.toString(16); return h.length < 2 ? '0'+h : h;
    }).join('');
  } catch(ex) {
    _loginBusy = false;
    $('#l-btn').prop('disabled', false).text('Giriş Yap →');
    $('#l-err').text('❌ Tarayıcı hatası');
    return;
  }

  /* JSONP ile GAS'a gönder */
  var cb = '__lg' + Date.now();
  var s  = document.createElement('script');
  s.src  = API + '?action=login&user=' + encodeURIComponent(u)
         + '&h=' + hashHex + '&cb=' + cb;

  var timer = setTimeout(function(){
    _loginBusy = false;
    delete window[cb]; $(s).remove();
    $('#l-btn').prop('disabled', false).text('Giriş Yap →');
    $('#l-err').text('❌ Sunucu yanıt vermedi, tekrar dene');
    setTimeout(function(){ $('#l-err').text(''); }, 3000);
  }, 20000);

  window[cb] = function(result){
    clearTimeout(timer);
    delete window[cb]; $(s).remove();
    if(result && result.ok){
      localStorage.setItem('ramos_auth',     'ok');
      localStorage.setItem('ramos_token',    result.token);
      localStorage.setItem('ramos_rol',      result.rol);
      localStorage.setItem('ramos_login_ts', String(Date.now()));
      $('#login-screen').fadeOut(280, function(){
        window._ptPause && window._ptPause(false); /* particle animasyonu başlat */
        $('#app').fadeIn(220);
        applyRole();
        yukle();
        setInterval(yukle, 30000);
        setInterval(checkSession, 60000);
      });
    } else {
      _loginBusy = false;
      $('#l-btn').prop('disabled', false).text('Giriş Yap →');
      $('#l-err').text('❌ Kullanıcı adı veya şifre hatalı');
      $('#l-pass').val('').focus();
      setTimeout(function(){ $('#l-err').text(''); }, 3000);
    }
  };

  $('head').append(s);
}

$(function(){
  initMagnetic();
  initParallax();
  initPullToRefresh();
  initLongPress();
  initMobileNav();
  initCursorGlow();
  init3DTilt();
  initRichTooltip();
  applyTimeTheme();
  setInterval(highlightNextTransfer, 60000);
  setInterval(applyTimeTheme, 60*60*1000);
  /* Three.js kaldırıldı — performans. CSS aurora + canvas particles yeterli */
  initParticles();

  $('#l-btn').on('click', doLogin);
  $('#l-user, #l-pass').on('keydown', function(e){ if(e.key==='Enter') doLogin(); });

  /* ── ARAMA ── */
  $('#search-input').on('input', function(){
    var q = $(this).val().trim().toLowerCase();
    $('.trow').each(function(){
      var hay = $(this).find('.cust-name').text().toLowerCase()
               +' '+ $(this).find('.fl-chip').text().toLowerCase()
               +' '+ $(this).find('.drv-name').text().toLowerCase();
      $(this).toggleClass('s-hide', q.length > 0 && hay.indexOf(q) === -1);
    });
    var vis = $('.trow:not(.s-hide)').length;
    $('#cnt').text(vis + ' Transfer');
    $('#srch-clear').toggle(q.length > 0);
  });
  $('#srch-clear').on('click', function(){
    $('#search-input').val('').trigger('input').focus();
  });

  /* Modal — ESC ve dışa tıklama */
  $('#add-modal').on('click', function(e){ if(e.target===this) closeAddModal(); });
  $(document).on('keydown', function(e){ if(e.key==='Escape') closeAddModal(); });

  /* Operasyon stepper */
  $(document).on('click', '.st-step', function(){
    var $b = $(this);
    updateStatus($b.data('t'), $b.data('s'), $b.data('m'), $b.data('d'), this);
  });

  /* Voucher butonları */
  $(document).on('click', '.vchr-btn', function(e){
    e.stopPropagation();
    showVoucher(+$(this).data('idx'));
  });
  $('#v-close-btn').on('click', function(){ $('#voucher-overlay').removeClass('open'); });
  $('#v-print-btn').on('click', function(){ window.print(); });
  /* Overlay dışına tıklayınca kapat */
  $('#voucher-overlay').on('click', function(e){ if(e.target===this) $(this).removeClass('open'); });
  /* ESC ile kapat */
  $(document).on('keydown', function(e){ if(e.key==='Escape') $('#voucher-overlay').removeClass('open'); });

  /* ── MOBİL SWIPE → sonraki durum ── */
  var _sw={};
  var _NEXT={'':'Karşılandı','Karşılandı':'Araçta','Araçta':'Teslim Edildi','Teslim Edildi':''};
  $(document).on('touchstart','.trow',function(e){
    var t=e.originalEvent.touches[0];
    _sw={el:this,x:t.clientX,y:t.clientY,ok:false};
  }).on('touchmove','.trow',function(e){
    if(!_sw.el||_sw.el!==this) return;
    var dx=e.originalEvent.touches[0].clientX-_sw.x;
    var dy=e.originalEvent.touches[0].clientY-_sw.y;
    if(!_sw.ok&&Math.abs(dy)>Math.abs(dx)){_sw.el=null;return;}
    if(dx<-8){
      _sw.ok=true; e.preventDefault();
      $(this).css({transform:'translateX('+Math.max(dx,-100)+'px)',transition:'none'});
    }
  }).on('touchend','.trow',function(e){
    if(!_sw.el||_sw.el!==this) return;
    var dx=e.originalEvent.changedTouches[0].clientX-_sw.x;
    var $r=$(this);
    $r.css('transition','transform .35s cubic-bezier(.16,1,.3,1)').css('transform','');
    if(dx<-65&&_sw.ok){
      var $track=$r.find('.st-track');
      var curStatus=($track.find('.st-step.active').data('d')||'');
      var nextStatus=_NEXT[curStatus];
      if(nextStatus){
        var $ns=$track.find('.st-step[data-d="'+nextStatus+'"]');
        if($ns.length) setTimeout(function(){
          updateStatus($ns.data('t'),$ns.data('s'),$ns.data('m'),nextStatus,$ns[0]);
        },180);
      }
    }
    _sw={};
  });

  $('#logout-btn').on('click', function(){
    localStorage.removeItem('ramos_auth');
    localStorage.removeItem('ramos_token');
    localStorage.removeItem('ramos_rol');
    localStorage.removeItem('ramos_login_ts');
    location.reload();
  });

  if(localStorage.getItem('ramos_auth')==='ok'){
    window._ptPause && window._ptPause(false);
    if(!checkSession()){ return; } /* süresi dolmuşsa giriş ekranına */
    $('#login-screen').hide();
    $('#app').show();
    applyRole();
    yukle();
    setInterval(yukle, 30000);
    setInterval(checkSession, 60000); /* her dakika oturum süresi kontrol */
  } else {
    setTimeout(function(){ $('#l-user').focus(); },200);
  }
});

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const ui = window.ArenaIcons;
  const icon = name => ui.icon(name);
  const fighters = [
    {name:'烬刃', call:'EMBER', color:'#c7ff61'},
    {name:'青岚', call:'GALE', color:'#66edf4'},
    {name:'紫电', call:'VOLT', color:'#be8cff'},
    {name:'赤影', call:'SHADE', color:'#ff766b'}
  ];
  const stages = ['日落天台','雨夜街区','深空轨道'];
  const weaponList = [['katana','光刃'],['staff','脉冲棍'],['twin','双刃']];
  const skillList = [['dash','冲刺'],['step','疾步']];
  const panes = ['menu','lobby','roster','loadout','fight'];
  const pageNames = {menu:'主菜单',lobby:'联机大厅',roster:'角色选择',loadout:'备战',fight:'对战中'};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let page = 'menu', seat = 0, state = {
    online:false,running:false,paused:false,role:'local',ready:false,inRoom:false,
    chars:[0,1],skills:['dash','step'],gear:['katana','katana'],arena:0,phase:'countdown'
  };
  let confirmExit = false;
  const game = () => window.ArcadeGame;
  const apply = (method,...args) => game()?.[method]?.(...args);
  const fx = () => window.ArenaAudio?.play('select');
  const body = document.body;
  const shell = document.createElement('main');
  shell.id='ak-shell';
  shell.innerHTML = `
    <div class="ak-stage" id="ak-stage" data-page="menu">
      <canvas class="ak-backdrop" id="ak-art" aria-hidden="true"></canvas><div class="ak-vignette" aria-hidden="true"></div>
      <section class="ak-page ak-menu" data-pane="menu" aria-label="主菜单">
        <div class="ak-menu-logo"><div class="ak-mode-tag"><i></i>STICKMAN FIGHTING<i></i></div><h1 id="ak-title"><span class="sr-only">NEON CLASH 霓虹对决</span></h1><p><i></i>霓虹对决<i></i></p></div>
        <div class="ak-modes"><button class="ak-mode featured" id="ak-online"><span class="ak-spear">▶</span><span class="ak-mode-icon">${icon('wireless')}</span><span class="ak-mode-text"><b>好友联机</b><small>ONLINE VERSUS</small></span><span class="ak-ek">${icon('arrow')}</span></button><button class="ak-mode" id="ak-local"><span class="ak-spear">▶</span><span class="ak-mode-icon">${icon('pad')}</span><span class="ak-mode-text"><b>同屏对战</b><small>LOCAL VERSUS</small></span><span class="ak-ek">${icon('arrow')}</span></button></div>
        <div class="ak-menu-rules"><span>${icon('trophy')} 三局两胜</span><b>/</b>每局 60 秒</div>
      </section>
      <section class="ak-page ak-lobby" data-pane="lobby" aria-label="联机大厅" hidden>
        <div class="ak-lobby-card"><span class="ak-kicker">ONLINE VERSUS</span><h2>联机大厅</h2><div id="ak-lobby-controls"></div><button class="ak-text-btn" data-back>‹ 返回主菜单</button></div>
      </section>
      <section class="ak-page ak-pick" data-pane="roster" aria-label="角色选择" hidden>
        <header class="ak-scene-title"><span class="ak-kicker">FIGHTER SELECT</span><h2>选择斗士</h2></header>
        <div class="ak-roster-body"><div class="ak-portrait-slot" id="ak-fighter-0"></div><div class="ak-draft"><div id="ak-seats" class="ak-seats"></div><div id="ak-cast" class="ak-cast"></div><button class="ak-confirm" id="ak-roster-next"></button><button class="ak-text-btn" data-back>‹ 返回</button></div><div class="ak-portrait-slot right" id="ak-fighter-1"></div></div>
      </section>
      <section class="ak-page ak-load" data-pane="loadout" aria-label="对战备战" hidden>
        <header class="ak-scene-title"><span class="ak-kicker">BATTLE SETUP</span><h2>对战备战</h2></header>
        <div class="ak-kit-layout"><div id="ak-kits" class="ak-kits"></div><div class="ak-arena-pick"><div class="ak-field-head"><h3>选择竞技场</h3><small id="ak-stage-ownership"></small></div><div id="ak-stage-tiles"></div></div>
          <div class="ak-go"><button class="ak-text-btn" data-back>‹ 重选斗士</button><button class="ak-confirm" id="ak-ready"></button></div>
        </div>
      </section>
      <section class="ak-page ak-match" data-pane="fight" aria-label="双人对战" hidden><div id="ak-match-mount"></div><div id="ak-result" hidden><div id="ak-result-box"></div></div></section>
    </div>
    <footer class="ak-bottom"><button class="ak-text-btn" id="ak-back">‹ 返回</button><div class="ak-keytips" id="ak-navkeys"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>ENTER</kbd> 确认</span></div><span id="ak-location"></span><button id="ak-match-exit" class="ak-text-btn" hidden>${icon('exit')} 离开对战</button></footer>`;
  document.querySelector('.shell').before(shell);
  $('ak-title').append($('wordmark'));
  $('ak-lobby-controls').append($('network-actions'));
  $('ak-stage-tiles').append($('arenas'));
  $('ak-match-mount').append($('cabinet'));
  $('screen').append($('ak-result'));
  $('guide-ok').before($('controls'));
  const fc = document.createElement('button');
  fc.id='ak-full'; fc.className='top-button';
  fc.innerHTML=icon('expand'); fc.title='全屏街机';fc.setAttribute('aria-label','全屏街机');
  document.querySelector('.top-actions').append(fc);
  fc.onclick = async () => {
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { $('ak-stage').scrollIntoView({block:'start'}); }
  };
  document.addEventListener('fullscreenchange',() => {
    fc.innerHTML=icon(document.fullscreenElement?'shrink':'expand');
    fc.setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏街机');
  });
  body.classList.add('arcade-on');
  const isOnline = () => state.online;
  const ownSeat = () => state.role==='guest'?1:0;
  const canPick = i => !isOnline() || i===ownSeat();
  const selectedChar = i => fighters[state.chars?.[i]]?state.chars[i]:i;
  const primary = (button,label,enabled=true) => {
    button.innerHTML='<strong>'+label+'</strong>'+icon('arrow');
    button.disabled=!enabled;
  };
  function paintPortrait(canvas,id,flip=false) {
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(window.ArenaCombat.drawPortrait) {
      window.ArenaCombat.drawPortrait(ctx,id,canvas.width,canvas.height,flip);
    } else {
      const color=fighters[id].color,w=canvas.width,h=canvas.height;
      ctx.save();ctx.scale(w/100,h/100);
      if(flip){ctx.translate(100,0);ctx.scale(-1,1);}
      ctx.fillStyle='#171825';ctx.strokeStyle=color;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(0,100);ctx.lineTo(26,71);ctx.lineTo(42,65);ctx.lineTo(75,75);ctx.lineTo(95,100);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.ellipse(51,46,25,30,-.22,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(30,40);ctx.lineTo(75,45);ctx.lineTo(70,50);ctx.lineTo(28,44);ctx.fill();ctx.restore();
    }
  }

  function drawPortraits(element) {
    element.querySelectorAll('canvas[data-char]').forEach(c=>paintPortrait(c,Number(c.dataset.char),c.dataset.flip==='true'));
  }
  function portraitMarkup(id,i) {
    const f=fighters[id];
    return '<div class="ak-fighter-slab" style="--char:'+f.color+'"><div class="ak-portrait-graphic"><i></i><canvas data-char="'+id+'" data-flip="'+Boolean(i)+'" width="420" height="385"></canvas></div><div class="ak-fighter-caption"><span>P'+(i+1)+'</span><div><small>'+f.call+'</small><strong>'+f.name+'</strong></div></div></div>';
  }
  function roleLabel(i) {
    if(!isOnline()) return '玩家 '+(i+1);
    return i===ownSeat()?'你':'好友';
  }
  const portraitKeys = [], kitKeys = [];
  let castKey='', seatKey='';
  function roster() {
    if(isOnline())seat=ownSeat();
    for(let i=0;i<2;i++) {
      const id=selectedChar(i),slot=$('ak-fighter-'+i);
      if(portraitKeys[i]!==id){slot.innerHTML=portraitMarkup(id,i);drawPortraits(slot);portraitKeys[i]=id;}
    }
    const seatsStamp=[seat,state.role,isOnline()].join();
    if(seatKey!==seatsStamp) {
      const el=$('ak-seats');
      el.innerHTML=[0,1].map(i=>'<button data-seat="'+i+'" aria-pressed="'+(seat===i)+'" '+(!canPick(i)?'disabled':'')+'>P'+(i+1)+' <b>'+roleLabel(i)+'</b></button>').join('');
      el.querySelectorAll('button').forEach(b=>b.onclick=()=>{fx();seat=+b.dataset.seat;roster();});
      seatKey=seatsStamp;
    }
    const stamp=seat+':'+state.chars;
    if(castKey!==stamp){
      const el=$('ak-cast');
      el.innerHTML=fighters.map((f,id)=>{
        const players=[0,1].filter(i=>selectedChar(i)===id).map(i=>'P'+(i+1)).join('·');
        return '<button class="ak-cast-btn" aria-label="选择'+f.name+'" aria-pressed="'+(selectedChar(seat)===id)+'" style="--char:'+f.color+'" data-char="'+id+'"><canvas data-char="'+id+'" width="150" height="102"></canvas><strong>'+f.name+'</strong>'+(players?'<span>'+players+'</span>':'')+'</button>';
      }).join('');
      el.querySelectorAll('button').forEach(b=>b.onclick=()=>{fx();apply('character',seat,+b.dataset.char);});
      drawPortraits(el);castKey=stamp;
    }
    primary($('ak-roster-next'),!isOnline()&&seat===0?'确认 P1 · 选择 P2':'确认斗士');
  }
  function kitColumn(i) {
    const id=selectedChar(i), f=fighters[id];
    const gear=state.gear?.[i]||'katana',skill=state.skills?.[i]||'dash';
    const locked=!canPick(i)||(isOnline()&&(i===0?state.hostArmed:state.guestReady));
    const opponent=!canPick(i)?' · 好友':'';
    const choices=(items,selected,kind)=>items.map(([k,label])=>'<button data-slot="'+i+'" data-'+kind+'="'+k+'" aria-pressed="'+(selected===k)+'" '+(locked?'disabled':'')+'>'+ (kind==='weapon'?icon(k):'')+label+'</button>').join('');
    return '<div class="ak-kit" style="--char:'+f.color+'"><div class="ak-kit-title"><canvas data-char="'+id+'" data-flip="'+Boolean(i)+'" width="93" height="76"></canvas><div><small>P'+(i+1)+opponent+'</small><b>'+f.name+'</b></div><strong>'+f.call+'</strong></div><div class="ak-equip"><h3>武器</h3><div class="ak-choices">'+choices(weaponList,gear,'weapon')+'</div><h3>身法</h3><div class="ak-choices ak-skills">'+choices(skillList,skill,'skill')+'</div></div></div>';
  }
  function loadout() {
    let stamps=[0,1].map(i=>[selectedChar(i),state.gear?.[i],state.skills?.[i],state.role,state.guestReady,state.hostArmed].join()).join('|');
    if(kitKeys[0]!==stamps){
      const el=$('ak-kits');el.innerHTML=kitColumn(0)+kitColumn(1);drawPortraits(el);
      el.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>{
        const select=$('weapons').querySelectorAll('select')[+b.dataset.slot];
        if(select.disabled)return;
        select.value=b.dataset.weapon;select.dispatchEvent(new Event('change',{bubbles:true}));
      });
      el.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{fx();apply('skill',+b.dataset.slot,b.dataset.skill);});
      kitKeys[0]=stamps;
    }
    $('ak-stage-ownership').textContent=isOnline()?'房主选图':'';
    const armed=state.role==='guest'?state.guestReady:state.hostArmed;
    const other=state.role==='guest'?state.hostArmed:state.guestReady;
    primary($('ak-ready'),!isOnline()?'开始对战':armed?'已就绪 · 取消':other?'好友已就绪 · 准备开战':'准备就绪');
  }

  let resultMode='';
  function result() {
    const visible=confirmExit||state.paused||state.phase==='matchover';
    const plate=$('ak-result');plate.hidden=!visible;
    if(!visible){resultMode='';return;}
    const el=$('ak-result-box');
    const mode=confirmExit?'exit':state.phase==='matchover'?'over':'pause';
    const headline=mode==='exit'?'离开本场对战？':mode==='over'?($('announcement').lastElementChild.textContent||'对战结束'):'已暂停';
    const stamp=mode+headline;
    if(resultMode===stamp)return;
    resultMode=stamp;
    el.innerHTML='<strong></strong><button class="ak-confirm" id="ak-result-main"></button><button class="ak-text-btn" id="ak-result-alt"></button>';
    el.firstElementChild.textContent=headline;
    primary($('ak-result-main'),mode==='exit'?'继续对战':mode==='over'?'再来一场':'继续对战');
    $('ak-result-alt').textContent=mode==='exit'?'离开并返回主菜单':mode==='over'?'返回主菜单':'返回备战';
    $('ak-result-main').onclick=()=>{
      fx();
      if(mode==='exit'){confirmExit=false;result();}
      else if(mode==='over'){apply('reset');setPage('loadout');}
      else $('pause').click();
    };
    $('ak-result-alt').onclick=()=>{
      if(mode==='pause'){apply('reset');setPage('loadout');}
      else mainMenu();
    };
  }
  function mainMenu() {
    confirmExit=false;
    if(state.online) apply('leave');
    else if(state.running) apply('reset');
    apply('mode',false);seat=0;setPage('menu');
  }
  function back() {
    fx();
    if(page==='menu')return;
    if(page==='fight'){
      if(confirmExit){confirmExit=false;result();}
      else{confirmExit=true;result();}
    } else if(page==='loadout'){
      if(isOnline())apply(state.role==='guest'?'guestReady':'hostArmed',false);
      setPage('roster');
    } else if(page==='roster'&&!isOnline()&&seat===1){seat=0;roster();}
    else mainMenu();
  }
  function setPage(which) {
    if(!panes.includes(which))return;
    const changed=which!==page;page=which;
    $('ak-stage').dataset.page=which;body.dataset.arcadePage=which;
    for(const pane of shell.querySelectorAll('[data-pane]'))pane.hidden=pane.dataset.pane!==which;
    document.querySelector('.nav-current').innerHTML='<i></i>'+pageNames[which];
    const modeStatus = isOnline() && state.ready?'好友联机 · P'+(ownSeat()+1)+(Number.isFinite(state.latency)?' · '+state.latency+' ms':''):'同屏对战';
    $('ak-location').textContent=which==='fight'?stages[state.arena]+' · '+modeStatus:(which==='loadout'||which==='roster')?modeStatus:'';
    $('ak-back').hidden=which==='menu'||which==='fight';
    $('ak-match-exit').hidden=which!=='fight';
    $('ak-navkeys').hidden=which==='fight';
    if(which==='lobby')$('network-actions').hidden=false;
    if(which==='roster')roster();
    if(which==='loadout')loadout();
    if(which==='fight')result();
    if(changed){
      document.activeElement?.blur();
      shell.scrollIntoView({block:'start',behavior:'instant'});
      if(scrollY<100)window.scrollTo(0,0);
    }
  }
  function sync(view) {
    if(!view)return;
    const was=state;state={...state,...view};
    if(state.running){setPage('fight');return;}
    confirmExit=false;
    if(state.online&&state.ready&&(page==='menu'||page==='lobby')){seat=ownSeat();setPage('roster');}
    else if(state.online&&!state.ready&&(state.invited||state.pending||state.inRoom||was.ready||page==='fight'))setPage('lobby');
    else if(page==='fight')setPage('loadout');
    else setPage(page);
  }
  window.ArcadeUI={sync,screen:()=>page};
  function mode(online) {
    fx();seat=0;apply('mode',online);
    if(!game())$(online?'online':'local').click();
    setPage(online?(state.ready?'roster':'lobby'):'roster');
  }
  $('ak-online').onclick=()=>mode(true);$('ak-local').onclick=()=>mode(false);
  $('ak-roster-next').onclick=()=>{fx();if(!isOnline()&&seat===0){seat=1;roster();}else setPage('loadout');};
  $('ak-ready').onclick=()=>{
    fx();
    if(!isOnline())apply('start');
    else if(state.role==='guest')apply('guestReady',!state.guestReady);
    else apply('hostArmed',!state.hostArmed);
  };
  $('ak-back').onclick=back;$('ak-match-exit').onclick=back;
  shell.querySelectorAll('[data-back]').forEach(b=>b.onclick=back);
  document.querySelector('.brand').onclick=e=>{e.preventDefault();if(page==='fight'){confirmExit=true;result();}else mainMenu();};
  document.addEventListener('keydown',e=>{
    if($('guide').open || e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;
    if(page==='fight') {
      if(confirmExit&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();back();}
      return;
    }
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();back();return;}
    if(e.target.matches?.('input,select,textarea'))return;
    if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Enter'].includes(e.key))return;
    const pane=shell.querySelector('[data-pane="'+page+'"]');
    const buttons=[...pane.querySelectorAll('button:not([disabled])')].filter(b=>b.offsetWidth&&b.offsetHeight);
    if(!buttons.length)return;
    const current=buttons.indexOf(document.activeElement);
    if(e.key==='Enter' && document.activeElement?.matches('button,a') && current<0)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.key==='Enter') (buttons[current]||buttons[0]).click();
    else {
      const dir=['ArrowRight','ArrowDown'].includes(e.key)?1:-1;
      buttons[(current<0?(dir>0?0:buttons.length-1):(current+dir+buttons.length)%buttons.length)].focus();
    }
  },true);

  // Artwork is built from the same environment and playable fighters as the match.
  const art=$('ak-art'),g=art.getContext('2d');
  const sprite=document.createElement('canvas'),sp=2;sprite.width=1000*sp;sprite.height=450*sp;
  const sg=sprite.getContext('2d');
  sg.scale(sp,sp);
  let demo=window.ArenaCombat.create(['katana','katana'],0,[0,1]);
  let last=-100,artPage='',artStage=-1;
  function renderArt(time) {
    const t=time/1000;
    if(page!=='fight' && (time-last>(reduced?1500:66)||artPage!==page||artStage!==state.arena)){
      last=time;artPage=page;artStage=state.arena;
      const bounds=art.getBoundingClientRect();
      if(bounds.width && bounds.height){
        const pixelScale=Math.min(1.3,devicePixelRatio||1);
        const w=Math.round(bounds.width*pixelScale),h=Math.round(bounds.height*pixelScale);
        if(art.width!==w||art.height!==h){art.width=w;art.height=h;}
        const narrow=w/h<1.05,bgIndex=page==='loadout'?state.arena:page==='roster'?2:page==='lobby'?1:0;
        const k=Math.max(w/1000,h/450);
        g.clearRect(0,0,w,h);g.save();g.imageSmoothingEnabled=false;g.translate((w-k*1000)/2,(h-k*450)/2);g.scale(k,k);
        window.ArenaScenery.draw(g,bgIndex,reduced?3:t);g.restore();
        if(page==='menu'||page==='lobby'){
          sg.clearRect(0,0,1000,450);window.ArenaCombat.draw(sg,demo,reduced?1:t,true);
          for(const fighter of demo.players) sg.clearRect(fighter.x+fighter.facing*7-17,fighter.y-180,34,24);
          const floor=(h+k*(374-225)*2)/2;
          const scale=Math.min(h*(narrow?.00205:.0028),w*(narrow?.00212:.00150));
          for(let i=0;i<2;i++) {
            const anchor=narrow?(i?.85:.15):(i?.81:.19);
            const x=demo.players[i].x;
            const cropW=300, cropTop=146, cropH=235;
            g.imageSmoothingEnabled=true;
            g.drawImage(sprite,(x-150)*sp,cropTop*sp,cropW*sp,cropH*sp,w*anchor-150*scale,floor-(374-cropTop)*scale,cropW*scale,cropH*scale);
          }
        }
      }
    }
    requestAnimationFrame(renderArt);
  }
  setPage('menu');
  sync(game()?.view?.());
  requestAnimationFrame(renderArt);
})();

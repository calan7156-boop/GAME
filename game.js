(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { create, step, draw, weapons } = window.ArenaCombat;
  const icons = window.ArenaIcons;
  const sound = window.ArenaAudio;
  const names = ['日落天台','雨夜街区','深空轨道'];
  const traits = {katana:'均衡',staff:'长距',twin:'速攻'};
  const actions = ['left','right','jump','attack','guard','dash'];
  const keysets = [
    {KeyA:'left',KeyD:'right',KeyW:'jump',KeyJ:'attack',KeyK:'guard',KeyL:'dash'},
    {ArrowLeft:'left',ArrowRight:'right',ArrowUp:'jump',Digit1:'attack',Digit2:'guard',Digit3:'dash',Numpad1:'attack',Numpad2:'guard',Numpad3:'dash'}
  ];
  const fresh = () => Object.fromEntries(actions.map(a => [a,false]));
  const keys = new Set(), fingers = new Map();
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const hud = [...document.querySelectorAll('.fighter-hud')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse), (any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  let arena = 0, gear = ['katana','katana'], chars = [0,1], skills = ['dash','step'];
  let state = create(gear,arena,chars,skills);
  let guestReady = false, hostArmed = false, roundId = 0;
  let prediction = null, lastPing = 0, latency = null;
  const invited = new URLSearchParams(location.search).has('room');
  const impulseActions = ['jump','dash','attack'];
  let localImpulses = [fresh(),fresh()], remoteImpulses = fresh();
  let online = false, running = false, paused = false, enabled = true;
  let room = null, ready = false, pending = false, attempt = 0, statusText = '';
  let remote = fresh(), latestInputAt = 0, snapshotAt = 0, sentAt = 0;
  let prevSnapshot = null, guestAt = 0, lastInput = '', hudCache = '', cue = '', announced = '';
  let invite = '', lastFrame = performance.now();
  try { enabled = localStorage.getItem('neon-clash-sfx') !== 'off'; } catch {}
  sound.setEnabled(enabled);
  function playerInputs(i) {
    const result = fresh();
    for (const code of keys) {
      const action = keysets[i][code];
      if (action) result[action] = true;
    }
    for (const value of fingers.values()) if (value.i === i) result[value.action] = true;
    return result;
  }
  function clearInputs() {
    keys.clear(); fingers.clear(); localImpulses = [fresh(),fresh()];
    document.querySelectorAll('.held').forEach(el => el.classList.remove('held'));
    if (online && room && !room.isHost && running) transmitInput(true);
  }
  function notify(text) {
    if (announced !== text) { announced = text; $('announcer').textContent = text; }
  }
  function setStatus(text) {
    if (text !== statusText) { statusText = text; $('status').textContent = text; }
  }
  function setInfo(text) { $('network-info').textContent = text; }
  function send(message) { if (room && ready) room.send(message); }
  function view() {
    return {online,running,paused,phase:state.phase,role:room?(room.isHost?'host':'guest'):'local',
      ready,inRoom:!!room,pending,arena,gear:[...gear],chars:[...chars],skills:[...skills],
      guestReady,hostArmed,invited,latency,code:room?.code||''};
  }
  function pushSetup() {
    send({type:'setup',arena,gear,chars,skills,guestReady,hostArmed});
  }
  function canPick(slot) {
    return (slot===0||slot===1) && (!running||state.phase==='matchover') && (!online || (ready && slot===(room.isHost?0:1)));
  }
  function pick(kind,slot,value) {
    if (!canPick(slot)) return;
    if (kind==='character' && Number.isInteger(value) && value>=0 && value<4) chars[slot]=value;
    else if (kind==='skill' && ['dash','step'].includes(value)) skills[slot]=value;
    else return;
    if (online && !room.isHost) send({type:kind,value});
    changeSetup();
  }
  function confirmSeat(host,value) {
    if (!online || !ready || !room || room.isHost!==host || (running && state.phase!=='matchover')) return;
    if (host) {hostArmed=!!value;pushSetup();}
    else {guestReady=!!value;send({type:'ready',value:guestReady});}
    syncControls();
    if (host && hostArmed && guestReady) startMatch();
  }
  function soundUI() {
    $('sound').innerHTML = icons.icon(enabled ? 'volume':'mute')+'<span>音效 '+(enabled?'开':'关')+'</span>';
    $('sound').setAttribute('aria-pressed',String(enabled));
  }
  function buildSelectors() {
    names.forEach((name,i) => {
      const b = document.createElement('button');
      b.className = 'arena-btn'; b.title = name; b.setAttribute('aria-label',name);
      b.innerHTML = '<canvas width="220" height="102" aria-hidden="true"></canvas><strong>'+name+'</strong>';
      const c = b.querySelector('canvas').getContext('2d');
      c.scale(220/1000,102/450);
      window.ArenaScenery.draw(c,i,1);
      b.onclick = () => { arena = i; changeSetup(); };
      $('arenas').append(b);
    });
    gear.forEach((id,i) => {
      const el = document.createElement('label');
      el.className = 'weapon-row p'+(i+1);
      el.innerHTML = '<span class="pill">P'+(i+1)+'</span><span class="weapon-icon"></span><select aria-label="玩家 '+(i+1)+' 武器"></select><span class="weapon-kind"></span><span class="chev">'+icons.icon('chevron')+'</span>';
      const select = el.querySelector('select');
      Object.entries(weapons).forEach(([key,weapon]) => select.add(new Option(weapon.name,key)));
      select.onchange = () => {
        gear[i] = select.value;
        if (room && !room.isHost) send({type:'weapon',id:gear[1]});
        changeSetup();
      };
      $('weapons').append(el);
    });
  }
  function changeSetup(quiet = false) {
    if (!quiet) sound.play('select');
    if (!running) state = create(gear,arena,chars,skills);
    if (room?.isHost) { if(quiet)guestReady=false;else hostArmed=false;pushSetup(); }
    else if (room) guestReady=false;
    syncControls(); updateHud();
  }
  function syncControls() {
    const locked = running && state.phase !== 'matchover';
    const guest = room && !room.isHost;
    $('local').setAttribute('aria-pressed',String(!online));
    $('online').setAttribute('aria-pressed',String(online));
    $('local').disabled = (running || pending || !!room) && online;
    $('online').disabled = locked && !online;
    $('local-actions').hidden = online; $('network-actions').hidden = !online;
    [...$('arenas').children].forEach((b,i) => {
      b.setAttribute('aria-pressed',String(i === arena)); b.disabled = locked || !!guest;
    });
    [...$('weapons').children].forEach((row,i) => {
      const select = row.querySelector('select');
      select.value = gear[i]; select.disabled = locked || (guest ? i===0 : room?.isHost && ready && i===1);
      row.querySelector('.weapon-icon').innerHTML = icons.icon(gear[i]);
      row.querySelector('.weapon-kind').textContent = traits[gear[i]];
    });
    $('stage-name').textContent = names[arena]; $('stage-code').textContent = 'STAGE 0'+(arena+1);
    $('arena-index').textContent = '0'+(arena+1)+' / 03';
    $('start').querySelector('strong').textContent = !running?'开始对战':state.phase==='matchover'?'再来一场':paused?'继续对战':'暂停对战';
    $('start').querySelector('span').innerHTML = icons.icon(locked&&!paused?'pause':'play');
    $('pause').hidden = online || !locked;
    $('back-setup').hidden = online || !running || (!paused && state.phase!=='matchover');
    $('pause').innerHTML = icons.icon(paused?'play':'pause');
    $('pause').setAttribute('aria-label',paused?'继续':'暂停');
    $('keyboard-tip').hidden = online;
    $('keyboard-tip').innerHTML = locked?'<kbd>ESC</kbd> '+(paused?'继续':'暂停'):'<kbd>ENTER</kbd> 开始对战';
    $('room-idle').hidden = !!room;
    $('room-live').hidden = !room;
    $('host').disabled = pending;
    $('join-form').querySelector('button').disabled = pending;
    $('room-input').disabled = pending;
    $('room-code').textContent = room?.code || '';
    $('net-start').disabled = !ready || !room?.isHost || locked;
    $('net-start').querySelector('strong').textContent = !ready?'等待好友加入':locked?'正在对战':guest?'等待房主开始':running?'再来一场':'开始对战';
    $('touch-deck').hidden = !touch || !running;
    hud.forEach((el,i)=>{el.querySelector('.tagline strong').textContent=['烬刃','青岚','紫电','赤影'][chars[i]];});
    window.ArcadeUI?.sync(view());
  }
  const binding = (letters,text) => '<span class="binding"><span class="keys">'+letters.map(k=>'<kbd>'+k+'</kbd>').join('')+'</span>'+text+'</span>';
  function buildGuides() {
    const labels = ['移动','跳跃','攻击','防御','冲刺'];
    const groups = [[['A','D'],['W'],['J'],['K'],['L']],[['←','→'],['↑'],['1'],['2'],['3']]];
    const seats = online ? [room && !room.isHost ? 1 : 0] : [0,1];
    $('control-rows').innerHTML = seats.map((seat,index) => '<div class="control-row p'+(seat+1)+'"><span class="player-label">P'+(seat+1)+'</span>'+groups[index].map((g,j)=>binding(g,labels[j])).join('')+'</div>').join('');
    $('touch-deck').replaceChildren();
    seats.forEach((seat,i) => {
      const row = document.createElement('div'); row.className = 'touch-row p'+(seat+1);
      row.innerHTML = '<span class="player-label">P'+(seat+1)+'</span>';
      actions.forEach((action,j) => {
        const b = document.createElement('button'); b.textContent=['←','→','跳','攻','防','冲'][j]; b.setAttribute('aria-label','P'+(seat+1)+' '+['左移','右移','跳跃','攻击','防御','冲刺'][j]);
        b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); fingers.set(e.pointerId,{i,action}); b.classList.add('held'); transmitInput(true); };
        b.onlostpointercapture = e => { fingers.delete(e.pointerId); b.classList.remove('held'); transmitInput(true); };
        row.append(b);
      });
      $('touch-deck').append(row);
    });
  }
  function reset() {
    running=false; paused=false; remote=fresh(); prevSnapshot=null; cue=''; clearInputs();
    remoteImpulses=fresh(); guestReady=false;hostArmed=false;prediction=null;
    state=create(gear,arena,chars,skills); hudCache=''; setStatus('准备就绪'); syncControls(); updateHud();
  }
  function startMatch() {
    if (online && (!ready || !room?.isHost || !guestReady || !hostArmed)) return;
    if (running && state.phase!=='matchover') { togglePause(); return; }
    sound.unlock(); sound.play('start');
    state=create(gear,arena,chars,skills); running=true; paused=false; cue=''; remote=fresh(); remoteImpulses=fresh(); clearInputs();
    roundId++; guestReady=false;hostArmed=false;prediction=null;
    lastFrame=performance.now(); snapshotAt=0; hudCache='';
    send({type:'start',arena,gear,chars,skills,state,roundId}); syncControls(); updateHud();
    document.activeElement?.blur();
    if (touch) $('cabinet').scrollIntoView({block:'nearest'});
  }
  function togglePause() {
    if (online || !running || state.phase==='matchover') return;
    paused=!paused; clearInputs(); lastFrame=performance.now(); cue=''; syncControls(); updateHud();
  }
  function updateHud() {
    const timer=Math.ceil(state.timeLeft);
    const round=state.round;
    const phase=!running?'ready':paused?'paused':state.phase;
    const count=Math.ceil(state.phaseTime);
    const cache=[state.players[0].hp,state.players[1].hp,state.scores,round,phase,timer,count,state.winner].join(',');
    if (cache===hudCache) return;
    hudCache=cache;
    hud.forEach((el,i) => {
      const hp=Math.max(0,Math.ceil(state.players[i].hp));
      el.querySelector('.health>div').style.width=hp+'%';
      el.querySelector('small').textContent=hp+' HP';
      [...el.querySelectorAll('.points i')].forEach((p,j)=>p.classList.toggle('won',state.scores[i]>j));
    });
    $('clock').textContent=String(timer).padStart(2,'0');
    $('round').textContent='ROUND '+String(round).padStart(2,'0');
    const outcome=state.winner<0?'平局':'P'+(state.winner+1)+' 获胜';
    const labels = {
      paused:['PAUSED','已暂停','已暂停'],
      countdown:['ROUND '+String(round).padStart(2,'0'),String(Math.max(1,count)),'准备开战'],
      roundover:['ROUND '+String(round).padStart(2,'0'),outcome,state.winner<0?'平局重赛':'本局结束'],
      matchover:['MATCH COMPLETE',outcome,'对战结束']
    };
    const message=labels[phase];
    const plate=$('announcement');
    plate.hidden=!message;
    if (message) { plate.firstElementChild.textContent=message[0]; plate.lastElementChild.textContent=message[1]; }
    setStatus(message?.[2] || (phase==='fight'?'对战进行中':online&&ready?'好友已就位':'准备就绪'));
    const newCue=phase+':'+round+(phase==='countdown'?':'+count:'');
    if (cue!==newCue) {
      cue=newCue;
      if (phase==='countdown') sound.play('countdown');
      if (phase==='fight') sound.play('start');
      if (phase==='matchover') { sound.play('win'); syncControls(); }
      if (message) notify(message[0]+' '+message[1]);
      window.ArcadeUI?.sync(view());
    }
  }
  function transmitInput(force=false) {
    if (!running || !online || !ready || !room || room.isHost) return;
    const input=playerInputs(0), serial=JSON.stringify(input), now=performance.now();
    if (force || serial!==lastInput || now-sentAt>220) {
      lastInput=serial; sentAt=now; send({type:'input',input,roundId});
    }
  }
  function simulate(now,dt) {
    if (!running || paused || state.phase==='matchover') return;
    if (online && !room?.isHost) { transmitInput(); return; }
    if (online && now-latestInputAt>750) remote=fresh();
    function withPresses(held,presses) {
      const result={...held};
      for(const a of impulseActions) if(presses[a]) result[a]=true;
      return result;
    }
    const events=step(state,[withPresses(playerInputs(0),localImpulses[0]),withPresses(online?remote:playerInputs(1),online?remoteImpulses:localImpulses[1])],dt);
    localImpulses=[fresh(),fresh()];remoteImpulses=fresh();
    events.forEach(e => sound.play(e.type,e.player));
    if (online && (now-snapshotAt>=40 || events.length || state.phase==='matchover')) {
      snapshotAt=now; send({type:'frame',state,events,roundId});
    }
  }
  function frame(now) {
    const dt=Math.min(.10,Math.max(0,(now-lastFrame)/1000)); lastFrame=now;
    simulate(now,dt);
    if (ready && now-lastPing>2500) {lastPing=now;send({type:'ping',at:now});}
    let imageState=state;
    if (online && room && !room.isHost && running && prevSnapshot && state.phase==='fight') {
      const alpha=Math.min(1,(now-guestAt)/40);
      imageState={...state,players:state.players.map((p,i) => {
        const old=prevSnapshot.players[i];return {...p,x:old.x+(p.x-old.x)*alpha,y:old.y+(p.y-old.y)*alpha};
      })};
      if(prediction && state.phase==='fight'){
        step(prediction,[{},playerInputs(0)],dt);
        imageState.players[1]={...prediction.players[1],hp:state.players[1].hp,flash:state.players[1].flash};
      }
    }
    const t=reducedMotion&&!running?0:now/1000;
    if(!window.ArcadeUI || window.ArcadeUI.screen()==='fight'){
      window.ArenaScenery.draw(ctx,arena,t);
      draw(ctx,imageState,t,!running);
    }
    updateHud();
    requestAnimationFrame(frame);
  }
  function mode(value) {
    if (pending || room || (running && state.phase!=='matchover')) return;
    online=value; setInfo(''); reset(); buildGuides(); sound.play('select');
  }
  function validGear(value){return Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==='string'&&Object.hasOwn(weapons,v));}
  function validSetup(msg){return validGear(msg.gear)&&Number.isInteger(msg.arena)&&msg.arena>=0&&msg.arena<names.length;}
  function validState(s) {
    return s && Array.isArray(s.players) && s.players.length===2 && s.players.every(p=>p && Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.hp)&&Object.hasOwn(weapons,p.weapon)) && Array.isArray(s.effects) && s.effects.length<300 && Array.isArray(s.scores) && s.scores.length===2 && ['fight','countdown','roundover','matchover'].includes(s.phase) && Number.isFinite(s.timeLeft) && Number.isFinite(s.phaseTime);
  }
  function receive(msg) {
    if (!room || !msg || typeof msg!=='object') return;
    if (msg.type==='ping' && Number.isFinite(msg.at)) {send({type:'pong',at:msg.at});return;}
    if (msg.type==='pong' && msg.at===lastPing) {latency=Math.round(Math.max(0,performance.now()-msg.at));window.ArcadeUI?.sync(view());return;}
    if(msg.type==='lobby' && running && state.phase==='matchover'){reset();return;}
    if (room.isHost) {
      if (msg.type==='input' && msg.roundId===roundId && msg.input && typeof msg.input==='object') {
        for(const a of impulseActions) if(!remote[a] && msg.input[a]===true)remoteImpulses[a]=true;
        remote=Object.fromEntries(actions.map(a=>[a,msg.input[a]===true])); latestInputAt=performance.now();
      }
      if (msg.type==='weapon' && (!running || state.phase==='matchover') && Object.hasOwn(weapons,msg.id)) {
        gear[1]=msg.id; changeSetup(true);
      }
      const editable=!running||state.phase==='matchover';
      if (msg.type==='character' && editable && Number.isInteger(msg.value) && msg.value>=0 && msg.value<4){chars[1]=msg.value;changeSetup(true);}
      if (msg.type==='skill' && editable && ['dash','step'].includes(msg.value)){skills[1]=msg.value;changeSetup(true);}
      if (msg.type==='ready' && editable){guestReady=msg.value===true;pushSetup();syncControls();if(guestReady&&hostArmed)startMatch();}
      if(msg.type==='hello') pushSetup();
      return;
    }
    if (msg.type==='setup' && validSetup(msg) && (!running||state.phase==='matchover')) {
      arena=msg.arena; gear=[...msg.gear];readSetup(msg); if (!running) state=create(gear,arena,chars,skills); syncControls(); return;
    }
    if (msg.type==='start' && validSetup(msg) && validState(msg.state)) {
      arena=msg.arena; gear=[...msg.gear];readSetup(msg);roundId=msg.roundId; state=msg.state; prevSnapshot=null;prediction=null;
      running=true; paused=false; clearInputs(); hudCache=''; syncControls(); updateHud();
      if(touch) $('cabinet').scrollIntoView({block:'nearest'});
    } else if (running && msg.type==='frame' && msg.roundId===roundId && validState(msg.state)) {
      prevSnapshot=state; guestAt=performance.now(); state=msg.state;
      prediction=structuredClone(state);
      if (state.phase==='fight') step(prediction,[{},playerInputs(0)],Math.min(.09,(latency||0)/2000));
      if (Array.isArray(msg.events)) msg.events.slice(0,6).forEach(e=>{ if(e && ['hit','block','swing','dash','round'].includes(e.type)) sound.play(e.type,e.player); });
      updateHud();
    }
  }
  function readSetup(msg) {
    if(Array.isArray(msg.chars)&&msg.chars.length===2&&msg.chars.every(c=>Number.isInteger(c)&&c>=0&&c<4))chars=[...msg.chars];
    if(Array.isArray(msg.skills)&&msg.skills.length===2&&msg.skills.every(s=>['dash','step'].includes(s)))skills=[...msg.skills];
    guestReady=msg.guestReady===true;hostArmed=msg.hostArmed===true;
  }
  function eraseRoomParam(){
    try {const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);} catch {}
  }
  function leaveRoom(reason='已离开房间') {
    attempt++;const old=room;room=null;pending=false;ready=false;latency=null;invite='';old?.close();eraseRoomParam();
    reset(); buildGuides(); setInfo(reason);
  }
  async function openRoom(code) {
    if (room || pending) return;
    if (code && !/^[A-Z0-9]{6}$/.test(code)) { setInfo('请输入 6 位房间码。'); return; }
    online=true;pending=true;ready=false; const current=++attempt;
    syncControls();setInfo(code?'正在加入房间…':'正在创建房间…');
    let earlyReady=false, inbox=[];
    function connected(){
      if(current!==attempt)return;
      if(!room){earlyReady=true;return;}
      ready=true;setInfo(room.isHost?'好友已加入，可以开始对战。':'已加入房间，由房主开始对战。');
      syncControls();buildGuides();setStatus('好友已就位');sound.play('select');
      if(room.isHost) pushSetup(); else send({type:'hello'});
      inbox.splice(0).forEach(receive);
    }
    const callbacks={
      onStatus:text=>{if(current===attempt)setInfo(text);},
      onReady:connected,
      onMessage:msg=>{if(current===attempt){if(room)receive(msg);else if(inbox.length<12)inbox.push(msg);}},
      onClose:reason=>{if(current===attempt)leaveRoom(reason||'好友已离开，房间已关闭。');}
    };
    try {
      const result=code?await window.ArenaNetwork.join(code,callbacks):await window.ArenaNetwork.create(callbacks);
      if(current!==attempt){result.close();return;}
      room=result;pending=false;
      setInfo(code?'正在连接房主…':'将邀请链接发给好友，或分享房间码。');
      syncControls();buildGuides(); if(earlyReady)connected();
      invite=await window.ArenaNetwork.inviteUrl(room.code);
    } catch(e){
      if(current!==attempt)return;
      if(room){setInfo('房间已就绪，可分享房间码。');return;}
      pending=false;ready=false;syncControls();setInfo(e?.message||'连接失败，请重试。');
    }
  }
  async function copyInvite() {
    if(!room)return;
    const standalone=location.protocol==='file:';
    const value=standalone?room.code:(invite || await window.ArenaNetwork.inviteUrl(room.code));
    try {
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const input=document.createElement('textarea');input.value=value;document.body.append(input);input.select();
        const ok=document.execCommand('copy');input.remove();if(!ok)throw Error();
      }
      setInfo(standalone?'已复制房间码，让好友打开同一游戏后输入即可加入。':'已复制邀请链接，发给好友即可加入。');
    } catch { setInfo(value); }
  }
  function setFullscreenUI(){
    const active=!!document.fullscreenElement||$('cabinet').classList.contains('full-view');
    $('fullscreen').innerHTML=icons.icon(active?'shrink':'expand');
    $('fullscreen').setAttribute('aria-label',active?'退出全屏':'全屏');
  }
  $('fullscreen').onclick=async()=>{
    const cab=$('cabinet');
    if(document.fullscreenElement) await document.exitFullscreen();
    else if(cab.classList.contains('full-view')) cab.classList.remove('full-view');
    else { try { await cab.requestFullscreen(); } catch {cab.classList.add('full-view');} }
    setFullscreenUI();
  };
  document.addEventListener('fullscreenchange',setFullscreenUI);
  $('local').onclick=()=>mode(false);$('online').onclick=()=>mode(true);$('start').onclick=startMatch;
  $('net-start').onclick=startMatch;$('pause').onclick=togglePause;
  $('back-setup').onclick=reset;
  $('host').onclick=()=>openRoom('');$('leave').onclick=()=>leaveRoom();$('copy').onclick=copyInvite;
  $('join-form').onsubmit=e=>{e.preventDefault();openRoom($('room-input').value.trim().toUpperCase());};
  $('sound').onclick=()=>{enabled=!enabled;sound.setEnabled(enabled);sound.unlock();sound.play('select');soundUI();try{localStorage.setItem('neon-clash-sfx',enabled?'on':'off');}catch{}};
  $('help').onclick=()=>{if(running&&!paused&&!online&&state.phase!=='matchover')togglePause();$('guide').showModal();};
  $('close-guide').onclick=$('guide-ok').onclick=()=>$('guide').close();
  $('guide').onclick=e=>{if(e.target===$('guide')){const r=$('guide').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('guide').close();}};
  document.addEventListener('pointerdown',()=>sound.unlock(),{passive:true});
  document.addEventListener('keydown',e=>{
    sound.unlock();
    if($('guide').open || e.ctrlKey || e.altKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
    if (window.ArcadeUI && window.ArcadeUI.screen()!=='fight') return;
    if(e.code==='Escape'&&!e.repeat){if($('cabinet').classList.contains('full-view')){$('cabinet').classList.remove('full-view');setFullscreenUI();}else togglePause();return;}
    if(e.code==='Enter'&&!e.repeat&&!online&&e.target.tagName!=='BUTTON'){e.preventDefault();startMatch();return;}
    if(!running||paused||state.phase==='matchover')return;
    if(keysets[0][e.code]||(!online&&keysets[1][e.code])){
      e.preventDefault();keys.add(e.code);
      if(!e.repeat){const seat=keysets[0][e.code]?0:1;const a=keysets[seat][e.code];if(impulseActions.includes(a))localImpulses[seat][a]=true;transmitInput(true);}
    }
  });
  document.addEventListener('keyup',e=>{if(keys.delete(e.code))transmitInput(true);});
  window.addEventListener('blur',clearInputs);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(running&&!online&&!paused&&state.phase!=='matchover')togglePause();}lastFrame=performance.now();});
  setInterval(()=>{if(document.hidden&&online&&ready&&running){const now=performance.now();simulate(now,Math.min(.25,(now-lastFrame)/1000));lastFrame=now;}},50);
  window.addEventListener('pagehide',()=>room?.close());
  window.ArcadeGame={view,mode,character:(slot,id)=>pick('character',slot,id),skill:(slot,id)=>pick('skill',slot,id),
    guestReady:v=>confirmSeat(false,v),hostArmed:v=>confirmSeat(true,v),start:startMatch,leave:leaveRoom,
    reset(){if(online){if(!running||state.phase!=='matchover')return;send({type:'lobby'});}reset();}
  };
  icons.refresh();buildSelectors();buildGuides();syncControls();soundUI();requestAnimationFrame(frame);
  const incoming=new URLSearchParams(location.search).get('room');
  if(incoming){mode(true);$('room-input').value=incoming.toUpperCase().slice(0,6);openRoom(incoming.trim().toUpperCase());}
})();

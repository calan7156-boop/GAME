/* Neon Stick Arena. The entire match is plain data so the host can send snapshots. */
(() => {
  'use strict';

  const GROUND = 374;
  const SPEED = 235;
  const colors = [
    { light: '#c9ff5a', bright: '#f0ffbd', dark: '#637b32', tint: '187,252,72' },
    { light: '#5be9fc', bright: '#cefcff', dark: '#346a84', tint: '73,218,249' },
  ];
  const characters = [
    { ...colors[0], plate: '#83954c', edge: '#c0c99a', low: '#303826' },
    { ...colors[1], plate: '#77a1b9', edge: '#c1e8ef', low: '#243c4f' },
    { light: '#c799ff', bright: '#f3e6ff', dark: '#766092', tint: '190,133,255', plate: '#8d79ad', edge: '#cfbde4', low: '#3c2a50' },
    { light: '#ff706e', bright: '#ffe1c8', dark: '#974e58', tint: '255,103,97', plate: '#af656b', edge: '#f5ab9e', low: '#512637' },
  ];
  const skills = {
    dash: { duration: .155, speed: 675, cooldown: .74, evade: .079 },
    step: { duration: .102, speed: 590, cooldown: .40, evade: .035 },
  };
  const weapons = {
    katana: { name: '光刃', damage: 16, reach: 126, windup: .105, active: .095, recovery: .235 },
    staff: { name: '脉冲棍', damage: 20, reach: 153, windup: .185, active: .115, recovery: .335 },
    twin: { name: '双刃', damage: 11, reach: 99, windup: .065, active: .08, recovery: .155 },
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, k) => a + (b - a) * k;
  const ease = k => k * k * (3 - 2 * k);
  const point = (a, b, k) => [mix(a[0], b[0], k), mix(a[1], b[1], k)];

  function fighter(i, weapon, charId, skill) {
    return {
      x: i ? 720 : 280, y: GROUND, vx: 0, vy: 0, facing: i ? -1 : 1,
      hp: 100, weapon: Object.hasOwn(weapons, weapon) ? weapon : 'katana',
      charId: Number.isInteger(charId) && characters[charId] ? charId : i,
      skill: Object.hasOwn(skills, skill) ? skill : i ? 'step' : 'dash',
      attackTime: -1, attackHit: false, combo: 0, guard: false,
      dashTime: 0, dashCool: 0, dashDir: 0, jumpHeld: false, dashHeld: false, attackHeld: false,
      jumpBuffer: 0, dashBuffer: 0, attackBuffer: 0,
      stun: 0, flash: 0, walk: 0, speed: 0,
    };
  }

  function create(weaponIds = ['katana', 'katana'], arena = 0, chars = [0,1], chosenSkills = ['dash','step']) {
    return {
      players: [0,1].map(i => fighter(i, weaponIds[i], chars[i], chosenSkills[i])),
      scores: [0, 0], round: 1, arena, phase: 'countdown', phaseTime: 2.6,
      timeLeft: 60, winner: -1, effects: [],
    };
  }

  function newRound(s) {
    if (s.winner !== -1) s.round++;
    s.players = s.players.map((p, i) => fighter(i, p.weapon, p.charId, p.skill));
    s.phase = 'countdown';
    s.phaseTime = 2.6;
    s.timeLeft = 60;
    s.winner = -1;
    s.effects = [];
  }

  function finishRound(s, events) {
    const difference = s.players[0].hp - s.players[1].hp;
    const win = difference === 0 ? -1 : difference > 0 ? 0 : 1;
    s.winner = win;
    if (win !== -1) s.scores[win]++;
    s.phase = s.scores.includes(2) ? 'matchover' : 'roundover';
    s.phaseTime = s.phase === 'roundover' ? 2.15 : 0;
    s.players.forEach(p => { p.guard = false; p.speed = 0; p.dashTime = 0; });
    events.push({ type: 'round', player: win });
  }

  function beginAttack(p, i, events) {
    p.attackTime = 0;
    p.attackHit = false;
    p.combo++;
    events.push({ type: 'swing', player: i });
  }

  function moveFighter(p, target, input, dt, i, events) {
    const w = weapons[p.weapon];
    const movementSkill = skills[p.skill] || skills.dash;
    const direction = Number(!!input.right) - Number(!!input.left);
    const ground = p.y >= GROUND - .01;
    p.jumpBuffer = input.jump && !p.jumpHeld ? .105 : Math.max(0, (p.jumpBuffer || 0) - dt);
    p.dashBuffer = input.dash && !p.dashHeld ? .105 : Math.max(0, (p.dashBuffer || 0) - dt);
    p.attackBuffer = input.attack && !p.attackHeld ? .12 : Math.max(0, (p.attackBuffer || 0) - dt);
    p.jumpHeld = !!input.jump;
    p.dashHeld = !!input.dash;
    p.attackHeld = !!input.attack;
    p.dashCool = Math.max(0, p.dashCool - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    if (p.attackTime >= w.windup + w.active + w.recovery) p.attackTime = -1;
    const free = p.stun === 0 && p.dashTime === 0 && p.attackTime < 0;
    if (free && Math.abs(target.x - p.x) > 2) p.facing = target.x > p.x ? 1 : -1;
    p.guard = free && ground && !!input.guard;
    if (free && !p.guard) {
      if (p.dashBuffer > 0 && p.dashCool === 0) {
        p.dashBuffer = 0;
        p.dashTime = movementSkill.duration;
        p.dashCool = movementSkill.cooldown;
        p.dashDir = direction || p.facing;
        events.push({ type: 'dash', player: i });
      } else {
        if (p.jumpBuffer > 0 && ground) { p.vy = -545; p.jumpBuffer = 0; }
        if (input.attack || p.attackBuffer > 0) {
          p.attackBuffer = 0;
          beginAttack(p, i, events);
        }
      }
    }
    const mobility = p.stun > 0 ? 0 : p.guard ? .19 : p.attackTime >= 0 ? .39 : 1;
    p.speed = p.dashTime > 0 ? p.dashDir * movementSkill.speed : direction * SPEED * mobility;
    p.walk += dt * p.speed * .053 * p.facing;
    p.vx *= Math.exp(-dt * 10);
    p.x = clamp(p.x + (p.speed + p.vx) * dt, 27, 973);
    p.vy += 1450 * dt;
    p.y = Math.min(GROUND, p.y + p.vy * dt);
    if (p.y >= GROUND) p.vy = 0;
    if (p.attackTime >= 0) p.attackTime += dt;
  }

  function separate(a, b) {
    if (Math.abs(b.y - a.y) > 80) return;
    const dx = b.x - a.x;
    const space = 34 - Math.abs(dx);
    if (space <= 0) return;
    const sign = dx === 0 ? a.facing : Math.sign(dx);
    a.x = clamp(a.x - sign * space / 2, 27, 973);
    b.x = clamp(a.x + sign * 34, 27, 973);
    a.x = b.x - sign * 34;
  }

  function connects(p, target) {
    const w = weapons[p.weapon];
    const move = skills[target.skill] || skills.dash;
    const toTarget = (target.x - p.x) * p.facing;
    return !p.attackHit && p.attackTime >= w.windup && p.attackTime <= w.windup + w.active
      && toTarget >= -12 && toTarget <= w.reach && Math.abs(p.y - target.y) <= 80
      && target.dashTime <= move.duration - move.evade;
  }

  function impact(s, i, blocked, events) {
    const p = s.players[i], target = s.players[1 - i];
    const w = weapons[p.weapon];
    p.attackHit = true;
    const type = blocked ? 'block' : 'hit';
    const damage = blocked ? (p.weapon === 'staff' ? 3 : 1) : w.damage;
    target.hp = Math.max(0, target.hp - damage);
    target.flash = blocked ? .07 : .16;
    target.vx = p.facing * (blocked ? 75 : p.weapon === 'staff' ? 245 : 165);
    if (!blocked) {
      target.stun = p.weapon === 'staff' ? .23 : .145;
      target.attackTime = -1;
      target.guard = false;
    }
    s.effects.push({
      type, x: target.x - p.facing * 8, y: target.y - 78,
      facing: p.facing, age: 0, player: i, charId: p.charId, seed: p.combo % 13,
    });
    events.push({ type, player: i });
  }

  function tick(s, inputs, dt, events) {
    for (const e of s.effects) e.age += dt;
    s.effects = s.effects.filter(e => e.age < .31);
    if (s.phase === 'matchover') return;
    if (s.phase !== 'fight') {
      s.phaseTime = Math.max(0, s.phaseTime - dt);
      if (s.phaseTime === 0) {
        if (s.phase === 'roundover') newRound(s);
        else s.phase = 'fight';
      }
      return;
    }
    const [a, b] = s.players;
    moveFighter(a, b, inputs[0] || {}, dt, 0, events);
    moveFighter(b, a, inputs[1] || {}, dt, 1, events);
    separate(a, b);
    const hitA = connects(a, b), hitB = connects(b, a);
    const blockedA = b.guard && b.facing === -a.facing;
    const blockedB = a.guard && a.facing === -b.facing;
    if (hitA) impact(s, 0, blockedA, events);
    if (hitB) impact(s, 1, blockedB, events);
    s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (a.hp === 0 || b.hp === 0 || s.timeLeft === 0) finishRound(s, events);
  }

  function step(s, inputs = [{}, {}], dt = 1 / 60) {
    const events = [];
    if (!Number.isFinite(dt) || dt <= 0) return events;
    const elapsed = Math.min(.25, dt);
    const steps = Math.ceil(elapsed * 120);
    for (let i = 0; i < steps; i++) tick(s, inputs, elapsed / steps, events);
    return events;
  }

  function path(ctx, coords, color, width) {
    ctx.beginPath();
    ctx.moveTo(...coords[0]);
    for (let i = 1; i < coords.length; i++) ctx.lineTo(...coords[i]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function poly(ctx, coords, fill, border) {
    ctx.beginPath();
    ctx.moveTo(...coords[0]);
    for (let i = 1; i < coords.length; i++) ctx.lineTo(...coords[i]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function disk(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function halo(ctx, x, y, rx, ry, rgb, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, .03, 0, 0, 1);
    g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
    g.addColorStop(.4, 'rgba(' + rgb + ',' + alpha * .55 + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    disk(ctx, 0, 0, 1, g);
    ctx.restore();
  }

  const vectorPaths = new Map();
  function shape(ctx, data, fill, edge, width = 1.2) {
    let path = vectorPaths.get(data);
    if (!path) {
      path = new Path2D(data);
      vectorPaths.set(data, path);
    }
    if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = width; ctx.stroke(path); }
  }

  function shade(ctx, x, y, x2, y2, start, end) {
    const gradient = ctx.createLinearGradient(x,y,x2,y2);
    gradient.addColorStop(0,start);
    gradient.addColorStop(1,end);
    return gradient;
  }

  // Shared cel artwork keeps the large portraits and moving silhouettes identifiable.
  // The mask is centered at the origin and always looks toward positive x.
  function drawMask(ctx, id) {
    const c = characters[id], ink = '#151424';
    const metal = shade(ctx,-29,-33,25,37,'#454653','#151525');
    const trim = shade(ctx,-30,-35,31,29,c.edge,c.plate);
    if (id === 3) {
      // Long angular cowl and cloth folds frame the deep-set eyes.
      shape(ctx,'M-40 29 Q-39 10 -38 -3 Q-38 -33 -9 -43 L7 -47 Q24 -44 36 -19 L42 -8 L32 -5 L30 18 L16 33 L-2 41 L-21 34 L-37 41 Z',shade(ctx,-24,-43,26,32,'#a14f57','#311f35'),ink,2.4);
      shape(ctx,'M-38 13 Q-31 -23 -4 -39 L7 -44 Q-2 -35 -9 -22 L-20 4 L-25 25 L-37 37 Z','#783844');
      shape(ctx,'M-9 -27 Q10 -41 23 -24 L37 -11 L30 -2 L27 17 L13 30 L-5 32 L-21 18 L-18 -2 Z','#201e2b',c.dark);
      shape(ctx,'M-17 -1 Q-7 -14 3 -16 L21 -20 L35 -11 L29 -5 L13 -4 L4 1 L-7 -2 Z','#522b39');
      shape(ctx,'M-10 -9 L6 -7 L11 -4 L-4 -5 Z M14 -5 L28 -11 L33 -10 L26 -5 L18 -2 Z',c.light);
      shape(ctx,'M-17 5 L-8 -1 L10 6 L17 4 L32 -5 L29 14 L13 30 L-6 30 L-19 18 Z',metal,ink,1.5);
      shape(ctx,'M-14 7 L8 11 L26 3 M-11 15 L7 19 L20 11',null,c.plate,1.5);
      shape(ctx,'M-38 11 Q-26 -19 -1 -37 M6 -43 Q24 -38 34 -16',null,c.edge,1.6);
      shape(ctx,'M-35 28 L-27 15 M-34 33 L-27 24 M-1 -27 L4 -31',null,c.light,1.2);
      return;
    }
    const skull='M-33 2 Q-38 -21 -17 -31 Q-2 -41 18 -33 Q34 -27 37 -11 L35 3 L39 10 L34 14 L30 26 L14 34 L-3 33 L-23 22 Z';
    shape(ctx,skull,metal,ink,2.2);
    shape(ctx,'M-29 -7 Q-28 -24 -10 -30 Q7 -37 24 -26 Q5 -30 -7 -20 L-18 -3 Z','#545461');
    shape(ctx,'M-30 -5 L-21 -12 L-15 9 L-3 25 L11 31 L-5 31 L-24 21 Z','#1e1e2b');
    if (id === 0) {
      // Torn headband, asymmetric brow and a painted slash under the lead eye.
      shape(ctx,'M-30 -13 L-39 -17 L-37 -23 L-45 -31 L-29 -26 L-35 -36 L-21 -32 L-19 -41 L-7 -35 L5 -40 L14 -35 L23 -36 L28 -29 Q6 -31 -5 -26 Z','#2d3034',ink,2);
      shape(ctx,'M-35 -12 Q-20 -21 -7 -17 L14 -10 L36 -15 L37 -7 L16 -1 L-8 -8 L-31 -3 Z',shade(ctx,-35,-15,34,-2,c.dark,c.light),ink,1.6);
      shape(ctx,'M-31 -12 Q-20 -17 -8 -15 L12 -9 L27 -11',null,c.bright,1.45);
      shape(ctx,'M-21 1 L-13 -5 L8 1 L13 7 L3 6 Z M17 3 L32 -2 L34 0 L25 5 L19 7 Z','#0e0f17');
      shape(ctx,'M-12 -1 L5 3 L8 5 L-6 3 Z M20 4 L30 0 L26 4 Z',c.bright);
      shape(ctx,'M-15 10 L-8 11 L6 24 L0 22 Z M-11 15 L-3 21 L-1 25 Z',c.light);
      shape(ctx,'M18 12 L23 13 L28 9 M10 26 L18 26',null,'#646670',1.3);
    } else if (id === 1) {
      // Aero-helmet, single glass visor, point-back cooling vanes.
      shape(ctx,'M-35 3 L-48 -14 L-36 -13 L-46 -28 L-27 -21 Q-16 -42 9 -42 Q30 -39 40 -18 L38 -11 L24 -16 L2 -17 L-17 -11 L-25 5 Z',trim,ink,2);
      shape(ctx,'M-40 -26 L-21 -17 L-13 -23 L4 -29 L24 -28 Q0 -39 -18 -24 L-26 -19 Z','#6890a2');
      shape(ctx,'M-28 -6 L-16 -13 L8 -15 L27 -13 L40 -17 L40 -7 L31 4 L11 10 L0 7 L-16 6 Z',shade(ctx,-17,-9,31,7,'#2997b8','#183351'),ink,2);
      shape(ctx,'M-21 -7 L-13 -11 L6 -13 L20 -11 L39 -15 L37 -11 L20 -7 L7 -9 L-12 -7 Z',c.light);
      shape(ctx,'M-9 -5 L-3 -6 L-9 2 L-14 2 Z M-1 -7 L2 -7 L-4 0 L-6 0 Z',c.bright);
      shape(ctx,'M-25 5 L-17 13 L1 12 L12 16 L33 5 L28 23 L13 32 L-3 27 L-19 22 Z',trim,ink,1.6);
      shape(ctx,'M-17 16 L1 17 L12 21 L25 15 M-13 21 L-1 22',null,'#476376',1.5);
      shape(ctx,'M-31 -2 L-21 -8 L-16 -1 L-20 9 L-28 7 Z','#253743',c.dark);
      shape(ctx,'M-26 0 L-21 -3 L-21 3 L-25 4 Z',c.light);
    } else {
      // Asymmetric horned oni helm. Its broken brow forms a continuous electric zigzag.
      shape(ctx,'M-28 -5 L-42 -19 L-43 -38 L-32 -28 L-35 -48 L-19 -32 Q-10 -41 7 -40 L17 -36 L31 -49 L29 -34 L42 -43 L37 -19 L32 -8 L17 -14 L4 -6 L-14 -12 Z',shade(ctx,-37,-42,26,-6,'#9983bc','#3b334f'),ink,2.2);
      shape(ctx,'M-39 -32 L-28 -22 L-32 -40 L-22 -29 L-20 -21 L-26 -14 Z M30 -36 L37 -39 L33 -24 L27 -20 Z',c.light);
      shape(ctx,'M-21 -15 L4 -10 L14 -17 L32 -18 L38 -9 L31 -4 L18 -1 L11 5 L6 0 L-12 -3 Z','#211c31',ink,1.3);
      shape(ctx,'M-16 -9 L3 -5 L8 -7 L12 -1 L18 -7 L32 -10 L28 -5 L18 -2 L11 6 L5 -1 L-9 -4 Z',c.light);
      shape(ctx,'M-26 -1 L-12 2 L-3 14 L5 10 L13 18 L19 12 L34 1 L28 20 L15 34 L2 35 L-12 27 L-25 16 Z',shade(ctx,-26,-3,24,33,'#70647e','#302a44'),ink,1.7);
      shape(ctx,'M-18 6 L-6 10 L1 21 L-9 15 Z M8 16 L12 21 L17 17 L13 28 Z M21 13 L29 6 L25 16 Z',c.plate);
      shape(ctx,'M-22 -25 L-12 -32 L2 -33 M4 31 L13 33 L23 23',null,c.edge,1.3);
    }
  }

  function drawPortrait(ctx, charId, width, height, mirrored = false) {
    if (!(width > 0 && height > 0)) return;
    const id = Number.isInteger(charId) && characters[charId] ? charId : 0;
    const c = characters[id], ink='#171624';
    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,width,height); ctx.clip();
    ctx.translate(width*.5,height);
    const scale = Math.min(width / 142, height / 181);
    ctx.scale(mirrored ? -scale : scale,scale);
    ctx.lineJoin='round'; ctx.lineCap='round';
    // Weapon grips and scarf ends frame the silhouette behind the nearer shoulder.
    if (id===0 || id===3) {
      ctx.save(); ctx.translate(-38,-79); ctx.rotate(-1.99);
      blade(ctx,[0,0],0,48,c); ctx.restore();
    } else if(id===1) {
      shape(ctx,'M-16 -94 C-46 -103 -57 -66 -98 -83 L-76 -69 L-94 -61 Q-57 -47 -31 -73 L-13 -82 Z',c.plate,ink,2);
      shape(ctx,'M-92 -80 Q-65 -69 -49 -82 L-26 -93 Q-46 -75 -56 -70 L-73 -65 Z',c.light);
    } else {
      shape(ctx,'M-40 -62 L-72 -118 L-50 -106 L-57 -130 L-27 -101 L-24 -77 Z',c.plate,ink,2);
      shape(ctx,'M-57 -124 L-35 -99 L-33 -91 L-46 -102 Z',c.light);
    }
    const body=shade(ctx,-69,-104,56,-6,'#484653','#191a28');
    shape(ctx,'M-2 -105 L24 -102 L28 -82 Q38 -71 57 -66 L76 -49 L88 -12 L88 8 L-87 8 L-82 -25 Q-76 -65 -49 -76 L-17 -85 Z',body,ink,2.6);
    shape(ctx,'M-50 -71 L-31 -77 L-13 -55 L-2 -36 L4 4 L-29 4 L-44 -24 Z','#272734');
    shape(ctx,'M25 -78 L42 -70 L62 -52 L73 -13 L49 -23 L30 -49 Z','#4f4e5a');
    shape(ctx,'M-59 -61 L-39 -72 L-25 -58 L-32 -45 L-49 -39 L-68 -46 Z','#3e3e4a',ink,1.4);
    shape(ctx,'M-68 -40 L-51 -34 L-30 -44 L-33 -31 L-58 -20 L-75 -24 Z','#262735',ink,1.2);
    shape(ctx,'M-78 -7 L-57 -6 L-35 -17 M45 -36 L63 -26 M49 -30 L66 -19',null,'#62606b',1.2);
    if(id===0){
      shape(ctx,'M-21 -96 L3 -101 L28 -91 L32 -80 L18 -68 L3 -61 L-25 -71 L-36 -81 Z',c.light,ink,2.2);
      shape(ctx,'M-29 -84 L-9 -80 L22 -85 L9 -76 L-5 -71 L17 -70 L5 -64 L-22 -73 Z',c.dark);
      shape(ctx,'M-25 -78 Q-47 -79 -59 -59 L-82 -25 L-62 -38 L-69 -21 L-43 -45 L-18 -67 Z',c.light,ink,2);
      shape(ctx,'M-68 -39 L-49 -60 L-29 -72 L-43 -58 L-55 -46 Z',c.dark);
      shape(ctx,'M30 -66 L40 -60 L-12 2 L-24 4 Z','#595a60',ink,2);
      shape(ctx,'M-3 -21 L6 -30 L12 -25 L3 -16 Z',c.edge,ink);
    } else if(id===1){
      shape(ctx,'M-33 -90 L-25 -105 L-9 -96 L17 -95 L28 -105 L41 -92 L35 -73 L18 -66 L-5 -68 L-26 -77 Z',trimArmor(),ink,2.2);
      shape(ctx,'M-27 -93 L-8 -77 L13 -74 L32 -83 L27 -73 L16 -69 L-7 -73 Z',c.dark);
      shape(ctx,'M-62 -67 L-44 -78 L-33 -70 L-29 -55 L-49 -49 L-69 -56 Z',trimArmor(),ink,2);
      shape(ctx,'M-61 -66 L-44 -73 L-37 -69 M-60 -58 L-50 -54 L-36 -60 M40 -61 L54 -53 L62 -38',null,c.light,2);
      shape(ctx,'M-12 -55 L1 -53 L16 -40 L32 -47 L40 -42 L16 -29 Z',c.plate,ink);
    } else if(id===2){
      shape(ctx,'M-32 -91 L-27 -103 L-12 -93 L6 -91 L27 -98 L40 -87 L31 -70 L16 -62 L-6 -67 Z',trimArmor(),ink,2.2);
      shape(ctx,'M-71 -62 L-68 -82 L-57 -74 L-60 -94 L-41 -83 L-33 -88 L-20 -67 L-36 -48 L-55 -44 Z',trimArmor(),ink,2.4);
      shape(ctx,'M-61 -82 L-46 -73 L-39 -74 L-27 -66 L-38 -62 L-46 -68 L-55 -68 Z',c.light);
      shape(ctx,'M-19 -59 L-7 -58 L8 -44 L19 -46 L34 -58 L30 -46 L17 -33 L6 -37 L-5 -36 Z',c.plate,ink,1.6);
      shape(ctx,'M-13 -55 L3 -47 L9 -40 L18 -42 L32 -52',null,c.light,1.7);
    } else {
      shape(ctx,'M-28 -104 L-8 -102 L16 -101 L31 -111 L44 -95 L40 -79 L56 -65 L34 -52 L23 -25 L4 -48 L-27 -61 L-48 -77 Z',shade(ctx,-35,-99,29,-41,'#a25a61','#572d40'),ink,2.4);
      shape(ctx,'M-32 -94 L-8 -77 L15 -75 L37 -88 L23 -69 L0 -62 L18 -51 L23 -31 L6 -48 L-20 -66 L-43 -78 Z','#663342');
      shape(ctx,'M-33 -91 Q-6 -68 18 -75 M27 -64 L39 -72 M14 -54 L22 -42',null,c.edge,1.45);
      shape(ctx,'M-62 -68 L-42 -72 L-31 -65 L-43 -50 L-61 -46 L-70 -53 Z',c.low,ink,2);
      shape(ctx,'M-56 -62 L-42 -65 L-49 -56 L-63 -51 Z',c.light);
    }
    ctx.save(); ctx.translate(3,-126); ctx.rotate(id===2 ? -.055 : id===3 ? .03 : -.07);
    drawMask(ctx,id); ctx.restore();
    if(id===0){
      shape(ctx,'M-24 -133 Q-38 -136 -50 -126 L-70 -123 L-53 -117 L-66 -110 L-48 -112 L-33 -124 Z',c.light,ink,1.6);
      shape(ctx,'M-63 -121 L-48 -121 L-36 -128',null,c.bright,1.1);
    }
    ctx.restore();
    function trimArmor(){return shade(ctx,-45,-94,20,-50,c.edge,c.plate);}
  }

  function jointLimb(ctx, coords, width, c, rear = false) {
    const rim = rear ? '#544f69' : c.dark;
    path(ctx, coords, rim, width + 2.3);
    path(ctx, coords, rear ? '#1b1928' : '#171625', width);
    const a = coords[0], b = coords[1];
    const edgeA = point(a, b, .72), edgeB = point(a, b, .93);
    path(ctx, [[edgeA[0] + 1.7, edgeA[1]], [edgeB[0] + 1.7, edgeB[1]]], rim, 2.1);
  }

  function band(ctx, a, b, start, end, width, c) {
    path(ctx, [point(a, b, start), point(a, b, end)], c, width);
  }

  function blade(ctx, hand, theta, length, c, staff = false) {
    ctx.save();
    ctx.translate(...hand);
    ctx.rotate(theta);
    ctx.lineCap = 'round';
    if (staff) {
      path(ctx, [[-42, 0], [length, 0]], '#252533', 7);
      path(ctx, [[-44, -1], [length + 2, -1]], c.dark, 3.5);
      ctx.shadowColor = c.light; ctx.shadowBlur = 10;
      path(ctx, [[-45, -1], [-31, -1]], c.light, 4.5);
      path(ctx, [[length - 17, -1], [length + 2, -1]], c.light, 4.5);
      ctx.shadowBlur = 0;
      for (const x of [-12, -6, 0, 6, 12]) path(ctx, [[x, -3], [x + 2, 2]], '#777585', 1.5);
    } else {
      const tip = length;
      ctx.shadowColor = c.light; ctx.shadowBlur = 13;
      poly(ctx, [[10, -2], [tip - 13, -4.1], [tip + 3, -7.2], [tip - 11, 1.8], [9, 3]], c.light);
      ctx.shadowBlur = 0;
      path(ctx, [[12, -1.6], [tip - 13, -3.6], [tip, -6.1]], c.bright, 1.75);
      path(ctx, [[11, -2.7], [tip - 19, -4.7]], 'rgba(255,255,255,.6)', 1);
      path(ctx, [[-11, 0], [8, 0]], '#272437', 5.5);
      path(ctx, [[7, -5.5], [10, 5]], c.light, 2.7);
      for (const x of [-9, -5, -1, 3]) path(ctx, [[x, -1.6], [x + 2, 1.6]], c.dark, 1.2);
      disk(ctx, -12, 0, 2.45, c.light);
    }
    ctx.restore();
  }

  function drawScarf(ctx, neck, bob, clock, c, movement) {
    const [x, y] = neck, gust = Math.sin(clock * 3.2) * 3;
    poly(ctx, [[x-1,y+1],[x-11,y+5],[x-27,y+5+gust],[x-42-movement,y+14+gust],
      [x-23,y+11+gust],[x-10,y+11],[x+1,y+6]], c.dark);
    poly(ctx, [[x,y+1],[x-14,y+3],[x-31,y-1-gust],[x-54-movement,y+3+gust],
      [x-32,y-7-gust],[x-15,y-3],[x,y-4]], c.light);
    path(ctx, [[x-8,y-1],[x-19,y-1],[x-31,y-4-gust]], c.bright, 1);
  }

  function renderFighter(ctx, p, i, time, attract, phase, winner) {
    const id = Number.isInteger(p.charId) && characters[p.charId] ? p.charId : i;
    const c = characters[id], airborne = p.y < GROUND - 1;
    const fighting = phase === 'fight' && !attract;
    const moved = fighting && Math.abs(p.speed) > 40 && p.dashTime === 0;
    const walk = moved && !airborne ? Math.sin(p.walk) : 0;
    const breath = Math.sin(time * 2.55 + i * 2.6);
    const weight = attract ? 1.20 : 1.06;
    const losing = !attract && (phase === 'matchover' || phase === 'roundover') && winner !== i && winner >= 0;
    const guard = fighting && p.guard, dashing = fighting && p.dashTime > 0;
    const hurt = fighting && p.stun > 0;
    const x = p.x, footY = p.y;
    const height = GROUND - footY;
    halo(ctx, x, GROUND + 2.5, 80 - Math.min(height * .22, 30), 11, c.tint, .23);
    ctx.save();
    ctx.translate(x, GROUND + 2);
    ctx.scale(1, .13);
    disk(ctx, 0, 0, 43, 'rgba(10,7,23,.64)');
    ctx.restore();
    if (dashing) {
      for (let n = 0; n < 5; n++) {
        const y = footY - 26 - n * 18;
        path(ctx, [[x-p.dashDir*(16+n*3),y],[x-p.dashDir*(50+(n%2)*15),y+1]], 'rgba('+c.tint+',.42)', 1.4);
      }
    }
    ctx.save();
    ctx.translate(x, footY);
    ctx.scale(weight * p.facing, weight);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const bob = breath * 1.25 + Math.abs(walk) * 2;
    const crouch = losing ? 21 : guard ? 9 : dashing ? 13 : 0;
    const recoil = hurt ? Math.min(1,p.stun/.14) : 0;
    const lean = hurt ? -14*recoil : dashing ? 20 : guard ? -2 : 0;
    const hip = [-1 + lean * .3, -47 + bob + crouch];
    const shoulder = [6 + lean, -85 + bob + crouch];
    const neck = [shoulder[0] + .5, shoulder[1] - 3];
    const head = [neck[0] + 2, neck[1] - 16];
    let backKnee = [-24 - walk * 10, -23 + bob + crouch * .45];
    let backFoot = [-45 - walk * 18, -2 - Math.max(0,-walk) * 12];
    let frontKnee = [30 + walk * 10, -35 + bob + crouch * .55];
    let frontFoot = [39 + walk * 18, -2 - Math.max(0,walk) * 12];
    if (airborne) {
      backKnee = [-21, -33]; backFoot = [-42, -21];
      frontKnee = [31, -49]; frontFoot = [27, -23];
    }
    if (losing) {
      backKnee = [-23, -4]; backFoot = [-42, -3]; frontKnee = [17,-27]; frontFoot=[34,-2];
    }
    const highStance = i === 1 && p.weapon !== 'staff';
    let frontPalm = highStance ? [25 + lean, -74 + bob + crouch] : [34 + lean, -55 + bob + crouch];
    let foreElbow = highStance ? [33 + lean, -65+bob+crouch] : [16+lean,-53+bob+crouch];
    let backPalm = [-16 + lean, -57 + bob + crouch];
    let backElbow = [-27 + lean, -65 + bob + crouch];
    let theta = highStance ? -1.12 : -.51;
    if (p.weapon === 'staff') theta = -.60;
    if (p.weapon === 'twin') theta -= .12;
    if (guard) {
      frontPalm = [25,-68+crouch+bob]; foreElbow = [13,-53+crouch+bob]; theta = -1.24;
      backPalm = [20,-78+crouch+bob]; backElbow = [-4,-64+crouch+bob];
    }
    if (losing) { frontPalm = [27,-35]; foreElbow = [9,-34]; theta = .27; }
    const active = !attract && !losing && p.attackTime >= 0;
    const w = weapons[p.weapon];
    let swing = -1;
    if (active) {
      const tp = p.attackTime;
      const overhead = p.combo % 2 === 1;
      const windPalm = overhead ? [-7,-108] : [7,-44];
      const endPalm = overhead ? [47,-65] : [42,-91];
      const windElbow = overhead ? [-16,-89] : [-12,-59];
      const endElbow = overhead ? [25,-70] : [20,-76];
      const windTheta = overhead ? -2.25 : .62;
      const endTheta = overhead ? -.01 : -1.02;
      const thrust = p.weapon === 'staff';
      const aPalm = thrust ? [-4,-64] : windPalm;
      const bPalm = thrust ? [51,-69] : endPalm;
      const aTheta = thrust ? -.17 : windTheta;
      const bTheta = thrust ? -.12 : endTheta;
      if (tp < w.windup) {
        const k = ease(tp / w.windup);
        frontPalm=point(frontPalm,aPalm,k); foreElbow=point(foreElbow,windElbow,k);
        theta=mix(theta,aTheta,k);
      } else if (tp < w.windup + w.active) {
        swing = (tp - w.windup) / w.active;
        const k = ease(swing);
        frontPalm=point(aPalm,bPalm,k); foreElbow=point(windElbow,endElbow,k);
        theta=mix(aTheta,bTheta,k);
      } else {
        const k = ease(clamp((tp-w.windup-w.active) / w.recovery, 0, 1));
        frontPalm=point(bPalm,frontPalm,k); foreElbow=point(endElbow,foreElbow,k);
        theta=mix(bTheta,theta,k);
      }
    }
    // Far limbs, cloth, and near limbs overlap in the order of a side-on fighting stance.
    jointLimb(ctx, [hip, backKnee, backFoot], 8.2, c, true);
    path(ctx, [backFoot, [backFoot[0]-7, backFoot[1]+1]], '#282637', 6.6);
    jointLimb(ctx, [shoulder, backElbow, backPalm], 6.8, c, true);
    band(ctx, backElbow, backPalm, .65, .79, 7.1, c.dark);
    if (p.weapon === 'twin') blade(ctx, backPalm, -2.8 + breath * .04, 42, c);
    if (id===0 || id===1) {
      ctx.save();
      if(id===1){ctx.translate(neck[0],neck[1]);ctx.rotate(-.30);ctx.scale(1.16,.78);ctx.translate(-neck[0],-neck[1]);}
      drawScarf(ctx, neck, bob, time + i * 1.4, c, moved || dashing ? 9 : 0);
      ctx.restore();
    } else if(id===3) {
      const wave=Math.sin(time*3)*2+ (moved ? 5 : 0);
      poly(ctx,[[neck[0]-6,neck[1]],[neck[0]-14,neck[1]+12],[hip[0]-23-wave,hip[1]+8],
        [hip[0]-13,hip[1]+5],[hip[0]-14,hip[1]+10],[hip[0]+3,hip[1]-4],[neck[0]+7,neck[1]+11]],c.low,c.dark);
    }
    jointLimb(ctx, [hip, frontKnee, frontFoot], 9.6, c);
    band(ctx, frontKnee, frontFoot, .62, .69, 9.1, c.dark);
    path(ctx, [frontFoot, [frontFoot[0]+7,frontFoot[1]+.6]], '#302d3c', 7.1);
    path(ctx, [[frontFoot[0]-2,frontFoot[1]+3.6],[frontFoot[0]+9,frontFoot[1]+3.6]], c.dark, 1.15);
    jointLimb(ctx, [hip, [(hip[0]+shoulder[0])/2, hip[1]-17], shoulder], 11.4, c);
    band(ctx, hip, shoulder, .16, .22, 12.8, c.dark);
    path(ctx, [[shoulder[0]-3,shoulder[1]+8],[shoulder[0]+3,shoulder[1]+16]], c.dark, 2.2);
    ctx.save(); ctx.translate(...shoulder);
    if(id===0) {
      shape(ctx,'M-7 -5 L4 -5 L9 -1 L1 6 L-5 9 L-12 3 Z',c.light,c.dark);
      shape(ctx,'M-7 1 L1 2 L5 -1 M-3 10 L5 15',null,c.plate,1.3);
    } else if(id===1) {
      shape(ctx,'M-9 -6 L-6 -12 L0 -7 L6 -6 L12 -10 L13 -1 L6 5 L-3 4 Z',c.plate,c.dark);
      shape(ctx,'M-9 1 L-3 0 L2 5 L-3 10 L-12 8 Z',c.edge,c.dark);
      shape(ctx,'M-10 6 L-4 7 L-1 5',null,c.light,1.4);
    } else if(id===2) {
      shape(ctx,'M-15 2 L-18 -7 L-13 -5 L-17 -15 L-7 -8 L-6 -13 L5 -3 L7 3 L-4 10 L-13 8 Z',c.plate,c.low);
      shape(ctx,'M-13 -8 L-6 -4 L-4 -7 L2 0 L-4 -1 L-6 1 Z',c.light);
      shape(ctx,'M2 7 L9 4 L7 11 L1 16 L-4 12 Z',c.dark,c.low);
    } else {
      shape(ctx,'M-13 -7 L-2 -8 L9 -10 L14 -2 L10 7 L4 19 L-1 9 L-13 6 L-18 1 Z',c.plate,c.low);
      shape(ctx,'M-13 -2 L0 3 L9 0 L4 6 L-2 8 L-8 5 Z',c.dark);
    }
    ctx.restore();
    ctx.save(); ctx.translate(...head); ctx.scale(.37,.37);
    drawMask(ctx,id); ctx.restore();
    if (swing >= 0 && p.weapon !== 'staff') {
      const dir = p.combo % 2 === 1 ? -1 : 1;
      const len = p.weapon === 'katana' ? 79 : 44;
      ctx.save(); ctx.translate(...frontPalm);
      const tail = theta + dir * (.30 + Math.sin(Math.PI * swing) * .84);
      ctx.beginPath(); ctx.moveTo(Math.cos(theta)*15,Math.sin(theta)*15);
      ctx.arc(0,0,len,theta,tail,dir < 0);
      ctx.quadraticCurveTo(Math.cos(tail)*44,Math.sin(tail)*44,Math.cos(theta)*15,Math.sin(theta)*15);
      ctx.fillStyle = 'rgba('+c.tint+',.23)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0,0,len,theta,tail,dir < 0);
      ctx.strokeStyle='rgba('+c.tint+',.64)'; ctx.lineWidth=1.4; ctx.stroke(); ctx.restore();
    }
    const len = p.weapon === 'katana' ? 82 : p.weapon === 'staff' ? 94 : 47;
    blade(ctx, frontPalm, theta, len, c, p.weapon === 'staff');
    jointLimb(ctx, [shoulder, foreElbow, frontPalm], 7.65, c);
    band(ctx, foreElbow,frontPalm,.45,.57,8.1,c.dark);
    band(ctx, foreElbow,frontPalm,.70,.79,8.0,c.light);
    disk(ctx, frontPalm[0],frontPalm[1],4.4,'#222033');
    if (guard) {
      ctx.beginPath(); ctx.arc(11,-63+crouch,41,-.99,.91);
      ctx.strokeStyle='rgba('+c.tint+',.59)'; ctx.lineWidth=2; ctx.stroke();
    }
    if (fighting && p.flash > 0) halo(ctx, shoulder[0], shoulder[1]+15, 34, 40, '255,244,217', .38 * p.flash/.16);
    ctx.restore();
  }

  function sparks(ctx, effect) {
    const k = effect.age / .31, c = characters[effect.charId] || colors[effect.player];
    const blocked = effect.type === 'block';
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.scale(effect.facing, 1);
    ctx.globalAlpha = 1 - k;
    halo(ctx, 0, 0, (1 - k) * 28 + 1, (1 - k) * 22 + 1, c.tint, .61);
    if(!blocked && k < .36) {
      const spike=1-k/.36;
      poly(ctx,[[-26*spike,-3*spike],[-5,-4],[-9*spike,-20*spike],[1,-5],
        [12*spike,-13*spike],[5,0],[28*spike,3*spike],[4,5],[8*spike,19*spike],[-2,6]],'#fffbdf');
    }
    for (let n = 0; n < (blocked ? 6 : 10); n++) {
      const a = n * 2.39996 + effect.seed * .53;
      const r = (8 + k * 62) * (.51 + (n%4)*.16);
      const tail = r * Math.min(1, .44 + k * .6);
      path(ctx, [[Math.cos(a)*tail, Math.sin(a)*tail + k*k*6],
        [Math.cos(a)*r,Math.sin(a)*r + k*k*10]], n%3 === 0 ? '#fffbd6' : c.light, 1.1 + (1-k)*1.4);
    }
    if (blocked) {
      ctx.beginPath(); ctx.arc(0,0,7+k*20,0,2*Math.PI);
      ctx.strokeStyle=c.light; ctx.lineWidth=1.3; ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, s, time = 0, attract = false) {
    ctx.save();
    for (let i = 0; i < 2; i++) renderFighter(ctx,s.players[i],i,time,attract,s.phase,s.winner);
    if (attract || s.phase === 'countdown' || s.phase === 'fight') {
      for (let i = 0; i < 2; i++) {
        const p = s.players[i], c = colors[i];
        const x = Math.round(p.x + p.facing * 7);
        const y = Math.round(p.y - (attract ? 171 : 150));
        ctx.save();
        ctx.translate(x, y);
        poly(ctx, [[-14,-7],[12,-7],[15,-4],[15,7],[-12,7],[-14,5]], '#1b192b', c.dark);
        poly(ctx, [[-3,10],[3,10],[0,13.3]], c.light);
        ctx.font = 'bold 10px "Consolas", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = c.light;
        ctx.fillText('P' + (i + 1), .5, .5);
        ctx.restore();
      }
    }
    for (const e of s.effects) sparks(ctx,e);
    ctx.restore();
  }

  window.ArenaCombat = { create, step, draw, weapons, drawPortrait };
})();

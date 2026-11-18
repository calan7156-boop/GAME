(() => {
  'use strict';

  // The scenery is painted at half the logical resolution, like a 16-bit game.
  const W = 500;
  const H = 225;
  const cache = [];
  const int = Math.floor;

  function random(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  const rect = (g, color, x, y, w, h) => {
    g.fillStyle = color;
    g.fillRect(int(x), int(y), Math.max(1, int(w)), Math.max(1, int(h)));
  };

  function gradient(g, top, bottom, stops) {
    const v = g.createLinearGradient(0, top, 0, bottom);
    stops.forEach(([point, color]) => v.addColorStop(point, color));
    return v;
  }

  function poly(g, color, points) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
    g.fill();
  }

  function line(g, color, x, y, ex, ey, thickness = 1) {
    x = Math.round(x); y = Math.round(y);
    ex = Math.round(ex); ey = Math.round(ey);
    const dx = Math.abs(ex - x), dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
    let error = dx + dy;
    g.fillStyle = color;
    while (true) {
      g.fillRect(x, y, thickness, thickness);
      if (x === ex && y === ey) break;
      const doubled = 2 * error;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
    }
  }

  function bloom(g, x, y, radius, inside, outside) {
    const glow = g.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, inside);
    glow.addColorStop(1, outside);
    g.fillStyle = glow;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function stars(g, rng, count, limit, palette) {
    for (let i = 0; i < count; i++) {
      const x = int(rng() * W), y = int(rng() * limit);
      const color = palette[int(rng() * palette.length)];
      rect(g, color, x, y, 1, 1);
      if (i % 38 === 0 && y > 5 && y < limit * .82) {
        g.globalAlpha = .36;
        rect(g, color, x - 1, y, 3, 1);
        rect(g, color, x, y - 1, 1, 3);
        g.globalAlpha = 1;
      }
    }
  }

  function clouds(g, rng, y, count, tone, dark, elongate) {
    for (let i = 0; i < count; i++) {
      const x = int(rng() * 560) - 50, row = y + int(rng() * 36);
      const span = int(15 + rng() * elongate);
      const height = int(1 + rng() * 3);
      const shape = [[0,.06,.40], [1,0,.72], [2,.22,.96], [3,.48,1]];
      for (const [step,start,end] of shape) {
        rect(g, step === 3 ? dark : tone, x + span * start, row + step * height, span * (end - start), height);
      }
      rect(g, tone, x - 4 - rng() * 14, row + height * 2, 2 + rng() * 11, 1);
    }
  }

  function sunset(g) {
    const rng = random(9428);
    g.fillStyle = gradient(g, 0, 188, [[0,'#101329'],[.20,'#252044'],[.48,'#63365e'],[.71,'#ac576d'],[.91,'#f19185'],[1,'#b75a79']]);
    g.fillRect(0, 0, W, 188);
    bloom(g, 249, 108, 121, '#ff905b55', '#da649300');
    stars(g, rng, 118, 95, ['#716a97','#c7a2bd','#867292','#5d577f','#a293aa']);
    clouds(g, rng, 27, 8, '#765d8d22', '#9068861a', 45);
    clouds(g, rng, 78, 12, '#b8798d36', '#bc728824', 60);
    const sx = 250, sy = 94, sr = 42;
    bloom(g, sx, sy, 64, '#ff903852', '#ff913900');
    g.fillStyle = gradient(g, sy - sr, sy + sr, [[0,'#ffdd83'],[.20,'#ffbc75'],[.48,'#ff9169'],[.74,'#ff706d'],[1,'#f95883']]);
    for (let yy = -sr; yy <= sr; yy++) {
      const h = yy + sr;
      if ((h >= 34 && h <= 34) || (h >= 42 && h <= 42) || (h >= 49 && h <= 50) ||
          (h >= 56 && h <= 57) || (h >= 63 && h <= 65) || (h >= 71 && h <= 74) ||
          (h >= 79 && h <= 82)) continue;
      const half = Math.round(Math.sqrt(sr * sr - yy * yy));
      g.fillRect(sx - half, sy + yy, 2 * half + 1, 1);
    }
    clouds(g, rng, 115, 12, '#f6ac9840', '#eb8d962a', 60);
    mountain(g, rng, 130, '#925574', 6);
    mountain(g, rng, 145, '#714368', 8);
    skyline(g, 177, 22, 10, rng, {wall:'#69426c',side:'#754873', roof:'#8c577d',win:['#956282','#a26c88']}, false);
    skyline(g, 183, 41, 14, rng, {wall:'#493154',side:'#53365e',roof:'#785173',win:['#9a647e','#ba7b91','#755675','#906486']}, false);
    // A thin communications mast and a viaduct break up the skyline.
    mast(g, 119, 138, 39, '#513553', '#cc7e89', false);
    line(g, '#5b3e64', 0, 160, 499, 160);
    line(g, '#ac6b83', 0, 159, 499, 159);
    for (let x = 5; x < 500; x += 29) {
      rect(g,'#604264',x,161,3,17);
      line(g,'#624064',x+2,166,x+8,160);
    }
    skyline(g, 189, 44, 23, rng, {wall:'#27243f',side:'#302943',roof:'#624463',win:['#af6a84','#56557b','#ba7e95','#408998','#8c5473']}, true);
    // Hand-painted near towers frame either side of the open fighting line.
    tower(g, rng, 5, 113, 24, 77, {wall:'#1d1c34',side:'#29223c',roof:'#76546f',win:['#c66e8c','#555a79','#4d8997','#83516c']}, 2);
    tower(g, rng, -13, 139, 21, 50, {wall:'#151a2d',side:'#26213c',roof:'#543c53',win:['#60506b','#bc6a87']}, 1);
    tower(g, rng, 458, 121, 27, 70, {wall:'#222039',side:'#32253e',roof:'#724a64',win:['#b47388','#81526d','#448396','#765b81']}, 3);
    tower(g, rng, 478, 143, 27, 47, {wall:'#181c31',side:'#28213b',roof:'#63445f',win:['#76506e','#cf7497','#5b557c']}, 0);
    sign(g, 24, 139, 3, 18, '#b15b87', '#e18e9f');
    sign(g, 462, 139, 3, 13, '#57898d', '#77b3af');
    fence(g, -4, 38, '#432b48','#aa5c7b');
    fence(g, 457, 48, '#432b48','#aa5c7b');
    platform(g, 0, rng);
  }

  function mountain(g, rng, baseline, color, amplitude) {
    let x = -3, y = baseline;
    while (x < W) {
      const width = int(2 + rng() * 7);
      y = Math.max(baseline - amplitude, Math.min(baseline + amplitude, y + int(rng()*5) - 2));
      rect(g, color, x, y, width, 188 - y);
      x += width;
    }
  }

  function mast(g, x, base, height, color, light, thick = false) {
    const top = base - height;
    line(g,color,x,top,x,base);
    line(g,color,x,top+7,x-5,base);
    line(g,color,x,top+7,x+5,base);
    for (let y = base-4; y > top+10; y -= 5) {
      const w = Math.max(1,int((y-top)/height*5));
      line(g,color,x-w,y,x+w,y-4);
    }
    if (thick) {
      rect(g,color,x-3,top+10,7,2);
      rect(g,light,x-2,top+10,4,1);
    }
    rect(g,light,x,top,1,1);
  }

  function tower(g,rng,x,top,w,h,p,style) {
    const side = Math.max(2,int(w*.22));
    rect(g,p.wall,x,top,w,h);
    rect(g,p.side,x+w-side,top,side,h);
    rect(g,p.roof,x,top,w,1);
    if (style === 0 || style === 2) {
      rect(g,p.wall,x+2,top-3,w-5,3);
      rect(g,p.roof,x+2,top-3,w-5,1);
    }
    if (style === 1 || style === 3) {
      const hw = int(w*.45);
      rect(g,p.wall,x+int(w*.3),top-4,hw,4);
      rect(g,p.roof,x+int(w*.3),top-4,hw,1);
      if (w > 12) rect(g,p.wall,x+int(w*.5),top-6,2,3);
    }
    if (w >= 17 && style % 2 === 0) {
      const rx = x+int(w*.3), rh = 5+int(rng()*9);
      rect(g,p.wall,rx,top-2-rh,1,rh);
      rect(g,p.win[0],rx,top-2-rh,1,1);
      rect(g,p.wall,rx-2,top-3-rh*.4,5,1);
    }
    const spacing = w > 14 ? 4 : 3;
    for (let yy = top+3; yy < top+h-2; yy += 4) {
      for (let xx = x+2; xx < x+w-side-1; xx += spacing) {
        if (rng() < .44) {
          rect(g,p.win[int(rng()*p.win.length)],xx,yy,style === 2 ? 1 : Math.min(spacing-1,2),1);
          if (style === 3 && rng() < .22) rect(g,p.win[1],xx,yy+1,1,1);
        }
      }
      if (style === 2 && w>10 && rng() > .45) rect(g,p.roof,x+w-side+1,yy,Math.min(2,side-1),1);
    }
    if (style === 3 && w > 15) {
      for(let yy=top+9;yy<top+h;yy+=13) rect(g,p.side,x,yy,w,2);
    }
  }

  function skyline(g,baseline,span,avg,rng,p,edgeBias) {
    let x = -4;
    while (x < W) {
      const w = int(avg*(.47+rng()*.9));
      const edge = Math.abs(x / W * 2 - 1);
      const height = int(6 + (.15+rng()*.82)*span + (edgeBias ? edge*12 : 0));
      tower(g,rng,x,baseline-height,w,height,p,int(rng()*4));
      x += w - (rng() < .42 ? int(rng()*3) : -int(rng()*3));
    }
  }

  function sign(g,x,y,w,h,base,light) {
    rect(g,'#25243a',x-1,y-1,w+2,h+2);
    rect(g,base,x,y,w,h);
    for(let yy=y+2;yy<y+h-1;yy+=4) rect(g,light,x+1,yy,Math.max(w-2,1),2);
  }

  function fence(g,x,w,metal,rim) {
    rect(g,metal,x,179,w,1);
    rect(g,metal,x,182,w,1);
    for (let i=0;i<=w;i+=13) {
      rect(g,metal,x+i,177,2,10);
      rect(g,rim,x+i,177,1,1);
    }
  }

  function rainy(g) {
    const rng=random(389029);
    g.fillStyle=gradient(g,0,188,[[0,'#081528'],[.38,'#173551'],[.70,'#365770'],[1,'#789196']]);
    g.fillRect(0,0,W,188);
    const mx=312,my=60,mr=18;
    bloom(g,mx,my,56,'#9ddcd533','#96d0ff00');
    for(let y=-mr;y<=mr;y++) {
      const half=int(Math.sqrt(mr*mr-y*y));
      rect(g,'#9ac7cf',mx-half,my+y,half*2,1);
    }
    rect(g,'#7da7b8',304,52,5,2); rect(g,'#7da7b8',302,54,4,1);
    rect(g,'#88b7c6',316,67,7,2);
    stars(g,rng,41,72,['#59748a','#6a8996','#526881']);
    clouds(g,rng,19,15,'#34516bbb','#355167b3',92);
    clouds(g,rng,61,16,'#37546eb0','#48687c90',98);
    skyline(g,177,48,13,rng,{wall:'#325167',side:'#3a576b',roof:'#507083',win:['#6a8b94','#658494']},false);
    const far={wall:'#253e55',side:'#2c455b',roof:'#4a6a79',win:['#6c97a8','#61939c','#7e7587','#477a91']};
    skyline(g,186,55,18,rng,far,false);
    // Twin pylons and suspension cable of the rain-drenched skyway.
    for(const bx of [161,332]) {
      rect(g,'#2a475e',bx,101,3,67);
      rect(g,'#38566d',bx+3,101,2,67);
      rect(g,'#759da4',bx,101,1,62);
      rect(g,'#b98282',bx+1,99,2,1);
      for(let i=1;i<=5;i++) {
        line(g,'#46677a',bx+1,102+i*2,bx-8*i,156);
        line(g,'#486b7b',bx+2,102+i*2,bx+8*i,156);
      }
    }
    rect(g,'#628791',105,155,280,1);
    rect(g,'#284456',105,156,280,4);
    skyline(g,190,44,22,rng,{wall:'#182e42',side:'#223a50',roof:'#386174',win:['#5d929c','#9d6c83','#7d94a1','#4e7085','#57a3a6']},true);
    const near={wall:'#162536',side:'#203246',roof:'#386578',win:['#5d8799','#5daaa8','#996986','#3e6577']};
    tower(g,rng,4,87,23,102,near,3); tower(g,rng,26,122,21,67,near,0);
    tower(g,rng,451,109,22,80,near,3); tower(g,rng,473,85,32,103,near,2);
    sign(g,11,105,5,23,'#963e78','#dc87ab'); sign(g,481,114,6,20,'#2b8c9a','#86ddd1');
    sign(g,37,140,4,13,'#397d92','#81c4bf');
    fence(g,0,59,'#273847','#4e8894'); fence(g,463,37,'#273847','#4e8894');
    platform(g,1,rng);
  }

  function space(g) {
    const rng=random(7239);
    g.fillStyle=gradient(g,0,188,[[0,'#0a1029'],[.48,'#222044'],[.78,'#45436c'],[1,'#74678b']]);
    g.fillRect(0,0,W,188);
    bloom(g,270,72,118,'#8462c32a','#705fa800');
    for(let i=0;i<115;i++){
      const x=rng()*W,y=27+x*.14+(rng()+rng()-1)*63;
      rect(g,'#71619c44',x,y,1,1);
    }
    stars(g,rng,255,149,['#ccc6e3','#7779ab','#9090b9','#5d6890','#b0b7d7']);
    // A ringed planet, painted scanline by scanline. Far arc precedes the globe.
    const cx=275,cy=76,pr=38;
    function ring(front) {
      for(let i=0;i<900;i++){
        const angle=i/900*Math.PI*2;
        if((Math.sin(angle)>0)!==front) continue;
        const dx=Math.cos(angle)*72,dy=Math.sin(angle)*9;
        const x=cx+dx, y=cy+dy-dx*.29;
        rect(g,front?'#8d93c1':'#67678c',x,y-2,1,2);
        rect(g,front?'#c4badb':'#8b82a5',x,y,1,1);
        rect(g,front?'#756f9e':'#645e88',x,y+2,1,1);
      }
    }
    ring(false);
    const bands=['#cec5ed','#b2b2db','#9c9dcc','#8e8bbd','#a9a3d1','#b8acda','#9691c1','#7f7fab','#a6a0c5','#9b91bc','#7c77a4','#77719b','#67648d'];
    for(let y=-pr;y<=pr;y++) {
      const w=int(Math.sqrt(pr*pr-y*y));
      const bi=Math.min(bands.length-1, int((y+pr)/(2*pr+1)*bands.length));
      rect(g,bands[bi],cx-w,cy+y,2*w+1,1);
      const shadow=int((y+pr)/(2*pr)*.47*w+.11*w);
      if(shadow) rect(g,'#45466b69',cx+w-shadow,cy+y,shadow+1,1);
    }
    ring(true);
    mountain(g,rng,143,'#46465f',6);
    mountain(g,rng,156,'#37374f',8);
    // Modules, glazed corridors and masts of a space dock.
    for(let x=-8;x<W;x+=17+int(rng()*39)) {
      const y=148+int(rng()*21),w=15+int(rng()*25),h=5+int(rng()*8);
      rect(g,'#39384f',x,y,w,188-y);
      rect(g,'#626177',x+3,y-2,w-6,2);
      rect(g,'#514f67',x,y,w,2);
      for(let i=x+2;i<x+w-2;i+=4) if(rng()>.25)rect(g,'#84949f',i,y+3,2,1);
      if(rng()>.65)mast(g,x+int(w/2),y,11+int(rng()*9),'#47455d','#9f7596',false);
      rect(g,'#292d44',x+3,y+h,w-3,1);
    }
    for(const x of [38,438]) {
      mast(g,x,181,x===38?86:63,'#24263f','#d7a9a7',true);
      rect(g,'#37364e',x-8,151,18,16); rect(g,'#68617d',x-9,150,21,2);
      rect(g,'#53536b',x-10,166,23,3);
      for(let i=-6;i<=7;i+=4) rect(g,'#87afb6',x+i,156,2,2);
    }
    // Tracking dish and the counterbalanced service crane flank the platform.
    poly(g,'#39384f',[[68,144],[89,132],[86,140],[82,145],[77,147],[72,147]]);
    line(g,'#9691ad',67,144,90,131); line(g,'#686781',76,143,76,134);
    line(g,'#787992',76,134,69,136); rect(g,'#9a93aa',68,135,2,2);
    line(g,'#303047',79,146,77,158,2); rect(g,'#373750',71,157,14,4);
    line(g,'#323349',397,154,401,120,2);line(g,'#68627c',401,120,425,114);
    line(g,'#444159',399,126,425,115); line(g,'#4a4761',423,115,423,132);rect(g,'#53516c',419,132,8,4);
    for(let x=0;x<W;x+=49) {
      rect(g,'#2b2b43',x,177,43,11); rect(g,'#74728c',x+2,177,39,1);
      rect(g,'#44435d',x+4,181,8,3); rect(g,'#789896',x+18,181,3,1);
    }
    platform(g,2,rng);
  }

  function platform(g,kind,rng) {
    const palettes=[
      ['#f39bbc','#df6392','#623257','#32273e','#201d2f','#432d45','#72405b','#b26884'],
      ['#9de0dd','#4ca5b5','#2b5c70','#253847','#172635','#314959','#496c7c','#64939a'],
      ['#d4c7ef','#a191db','#59516f','#363447','#222332','#444152','#665e7c','#8e82aa']
    ];
    const p=palettes[kind];
    rect(g,p[2],0,186,W,2); rect(g,p[0],0,187,W,1); rect(g,p[1],0,188,W,1);
    rect(g,p[2],0,189,W,1);
    g.fillStyle=gradient(g,190,H,[[0,p[3]],[1,p[4]]]);
    g.fillRect(0,190,W,H-190);
    for(let x=-500;x<=1000;x+=39) {
      const ex=250+(x-250)*1.86;
      line(g,p[5],x,190,ex,H+1);
      if(kind===2)line(g,'#282938',x+1,190,ex+1,H+1);
    }
    for(const y of [193,199,209,224]) {
      rect(g,p[5],0,y,W,1);
      if(y===199||y===224) rect(g,'#0c132026',0,y+1,W,1);
    }
    for(let i=0;i<215;i++) {
      const x=rng()*W, y=191+rng()*(H-191), w=1+rng()*3;
      rect(g,i%3===0?'#ac91ab0d':'#070c1a15',x,y,w,1);
    }
    for(let x=8;x<W;x+=37) {
      rect(g,p[2],x,188,3,2);
      rect(g,p[7],x,190,1,1);
    }
    if(kind===1){
      for(let i=0;i<60;i++) {
        const x=int(rng()*W),y=192+int(rng()*32);
        rect(g,i%2?'#78afc12c':'#af86a826',x,y,1+rng()*10,1);
      }
    }
    // Flush maintenance grates and hardware stay outside the duel silhouettes.
    for(const [x,y] of [[19,215],[452,215]]) {
      rect(g,p[5],x,y,27,4); rect(g,p[4],x+1,y+1,25,2);
      for(let i=2;i<25;i+=4)rect(g,p[5],x+i,y+1,1,2);
    }
  }

  function makeCanvas() {
    if(typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W,H);
    const canvas = document.createElement('canvas');
    canvas.width=W; canvas.height=H;
    return canvas;
  }

  function movingLights(g, index, t) {
    if(index===0) {
      const x=(t*5.7+162)%535-20, y=146;
      rect(g,'#6d4c6a',x,y,8,1);rect(g,'#d0848c',x+6,y,2,1);
      if(Math.sin(t*1.9)>.55)rect(g,'#f1949c',119,99,1,1);
    } else if(index===1) {
      g.fillStyle='#9ad6e333';
      for(let i=0;i<65;i++) {
        const speed=41+(i%7)*3, cycle=H+11;
        const y=(i*67+t*speed)%cycle-7;
        const x=(i*139 - t*speed*.23 + W*(1+int(t*speed/W)))%W;
        g.fillRect(int(x),int(y),1,3);
        if(i%3===0)g.fillRect(int(x)-1,int(y)+3,1,2);
      }
      for(let i=0;i<7;i++) {
        const f=(t*.81+i*.31)%1;
        if(f>.61 && f<.93)rect(g,'#98c4cf40',i*73+16,196+(i*29)%26,2+int((f-.61)*13),1);
      }
    } else {
      const f=(t+8)%14;
      if(f<.75){
        const x=int(38+f*115),y=int(13+f*26);
        line(g,'#767da2',x-5,y-1,x,y);rect(g,'#d1daed',x,y,1,1);
      }
      if(Math.sin(t*1.7)>.65)rect(g,'#f8bbc1',38,95,1,1);
    }
  }

  window.ArenaScenery={
    draw(ctx,arenaIndex,tSeconds=0) {
      const index=arenaIndex===1||arenaIndex===2?arenaIndex:0;
      if(!cache[index]) {
        const canvas=makeCanvas();
        const g=canvas.getContext('2d');
        [sunset,rainy,space][index](g);
        cache[index]=canvas;
      }
      ctx.save();
      ctx.imageSmoothingEnabled=false;
      ctx.scale(2,2);
      ctx.drawImage(cache[index],0,0);
      movingLights(ctx,index,Number.isFinite(tSeconds)?tSeconds:0);
      ctx.restore();
    }
  };
})();

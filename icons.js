(() => {
  'use strict';

  // Monochrome controls inherit the color and size of their surrounding UI.
  const path = data => '<path d="' + data + '"/>';
  const fill = data => '<path stroke="none" fill="currentColor" d="' + data + '"/>';
  const icons = {
    brand: fill('M3 3h5v2h2v2h2v2h-3v3H7v-2H5V8H3z M16 3h5v5h-2v2h-2v2h-2v2h-2v2l2 2-2 2-3-3-4 4-3-3 4-4-2-2 2-2 2 2 2-2V9h2V7h2V5h1z M16 13l2-2 2 2-2 2 3 3-3 3-3-3-2 2-2-2z'),
    key: '<rect x="2" y="5.6" width="20" height="13.5" rx="2.2"/>' + fill('M5 9h2v2H5zM9 9h2v2H9zM13 9h2v2h-2zM17 9h2v2h-2zM5 13h2v2H5zM9 13h7v2H9zM17 13h2v2h-2z'),
    volume: path('M3 9h4l5-4v14l-5-4H3z M16 8.5a5 5 0 0 1 0 7 M18.9 5.5a9 9 0 0 1 0 13'),
    mute: path('M3 9h4l5-4v14l-5-4H3z M16 9l5 6m0-6-5 6'),
    trophy: path('M7 3.8h10v6.1a5 5 0 0 1-10 0z M7 6H3v2.4a4.8 4.8 0 0 0 4.9 4.8 M17 6h4v2.4a4.8 4.8 0 0 1-4.9 4.8 M12 15v4.5 M8 20h8'),
    sliders: path('M3 6h3m5 0h10 M3 12h10m5 0h3 M3 18h4m5 0h9') + '<rect x="6.5" y="3.8" width="4.5" height="4.4" rx=".7"/><rect x="13" y="9.8" width="4.5" height="4.4" rx=".7"/><rect x="7.5" y="15.8" width="4.5" height="4.4" rx=".7"/>',
    pad: path('M7.5 6h9a4 4 0 0 1 4 3.3l1.1 6.6c.55 3.5-2.5 4.8-4.5 2.4l-2-2.3H8.9l-2 2.3c-2 2.4-5 1.1-4.5-2.4l1.1-6.6A4 4 0 0 1 7.5 6z M7.7 9v4m-2-2h4') + '<circle cx="16.1" cy="11.8" r="1" fill="currentColor" stroke="none"/><circle cx="18.6" cy="9.8" r="1" fill="currentColor" stroke="none"/>',
    wireless: path('M2.5 8.7a15 15 0 0 1 19 0 M5.6 12a10 10 0 0 1 12.8 0 M8.6 15.2a5.2 5.2 0 0 1 6.8 0') + '<circle cx="12" cy="18.7" r="1.45" fill="currentColor" stroke="none"/>',
    play: fill('M6 3.8v16.4L20.1 12z'),
    pause: fill('M5.2 4h4.5v16H5.2zM14.3 4h4.5v16h-4.5z'),
    arrow: path('M3 12h16m-6-6 6 6-6 6'),
    expand: path('M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5'),
    shrink: path('M9 3v6H3 M15 3v6h6 M21 15h-6v6 M9 21v-6H3'),
    exit: path('M10 4H4v16h6 M9 12h12m-4-4 4 4-4 4'),
    copy: '<rect x="8" y="7.6" width="12.5" height="13.1" rx="1.5"/>' + path('M16.5 4H5a1.5 1.5 0 0 0-1.5 1.5V16'),
    close: path('m5.5 5.5 13 13m0-13-13 13'),
    chevron: path('m6 9 6 6 6-6'),
    katana: path('m7 16 7.8-8.5L21 3l-2 6.3-8.8 9 M5.1 14.4l5 5m-2.8-2.7-4.1 4.1'),
    staff: path('m3 20.7 17.7-17.8 M4.7 17.5l2 2m10.7-16 2.6 2.6 M8.5 13.8l2 2m.5-4.5 2 2'),
    twin: path('m3.3 15.5 7.9-8.2L15 4l-1.2 4.5-8.1 9 M2.4 13.8l4.7 4.6m-2.6-2.2-2.4 2.4 M10 18l7.2-7.6 4.4-3.7-1.6 4.7-7.6 8.3m-3.5-3.3 4.8 4.7m-2.6-2.8L8.7 21')
  };

  function icon(name) {
    if (!Object.prototype.hasOwnProperty.call(icons,name)) return '';
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + icons[name] + '</svg>';
  }

  function refresh(root=document) {
    if(root.matches?.('[data-i]')) root.innerHTML = icon(root.dataset.i);
    for(const node of root.querySelectorAll('[data-i]')) node.innerHTML = icon(node.dataset.i);
  }

  // Bespoke octagonal arcade capitals. All letterforms share the same cap height,
  // heavy horizontals, clipped terminals, and forward-cut stance.
  const glyphs = {
    N:[70,'M0 84V0h21l29 46V0h20v84H50L20 37v47z'],
    E:[62,'M0 0h62v17H21v15h35v17H21v18h41v17H0z'],
    O:[72,'M13 0h46l13 13v58L59 84H13L0 71V13z M24 18l-3 4v40l3 4h24l3-4V22l-3-4z'],
    C:[69,'M13 0h44l12 12v15H48v-6l-3-3H25l-4 4v40l4 4h20l3-3v-6h21v15L57 84H13L0 71V13z'],
    L:[60,'M0 0h21v66h39v18H0z'],
    A:[77,'M0 84 21 0h34l22 84H55l-4-18H26l-4 18z M30 49h17L39 16h-1z'],
    S:[68,'M12 0h43l12 12v10H46v-4H24l-3 3v9l3 3h31l13 13v26L56 84H12L0 72V61h21v5h23l3-3v-10l-3-3H13L0 37V12z'],
    H:[70,'M0 0h21v32h28V0h21v84H49V50H21v34H0z']
  };

  function drawWordmark() {
    const canvas = document.getElementById('wordmark');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;
    const word = 'NEON CLASH', gap=7, space=24, skew=.195, cap=84;
    let width = 0;
    for(const c of word) width += c === ' ' ? space : glyphs[c][0] + gap;
    width += skew*cap-gap;
    const sx=(canvas.width-3)/width, sy=(canvas.height-6)/cap;
    ctx.save();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.translate(1.5,3);
    ctx.scale(sx,sy);
    ctx.transform(1,0,-skew,1,skew*cap,0);
    for(let i=0;i<word.length;i++) {
      const c=word[i];
      if(c===' ') { ctx.translate(space,0); continue; }
      ctx.fillStyle=i<4?'#f0f0ef':'#bcfa57';
      ctx.fill(new Path2D(glyphs[c][1]),'evenodd');
      // Three engraved speed cuts accent the word without disrupting counters.
      if(i===0||i===5||i===8) {
        ctx.save();ctx.globalCompositeOperation='destination-out';
        const h=i===0?57:i===5?48:22;
        ctx.fill(new Path2D('M-1 '+h+'h12l-12 3z'));
        ctx.restore();
      }
      ctx.translate(glyphs[c][0]+gap,0);
    }
    ctx.restore();
  }

  window.ArenaIcons = { icon, refresh };
  const init = () => { refresh(); drawWordmark(); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

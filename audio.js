(() => {
  'use strict';
  let context;
  let master;
  let noise;
  let enabled = true;
  let resuming = false;
  const voices = new Set();
  const lastPlayed = new Map();
  const maxVoices = 16;

  function unlock() {
    if (!enabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!context || context.state === 'closed') {
        context = new Audio();
        master = context.createGain();
        master.gain.value = .48;
        master.connect(context.destination);
        const length = Math.floor(context.sampleRate * .28);
        noise = context.createBuffer(1, length, context.sampleRate);
        const data = noise.getChannelData(0);
        let seed = 4453;
        for (let i = 0; i < length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          data[i] = seed / 2147483648 - 1;
        }
        lastPlayed.clear();
      }
      if (context.state !== 'running' && !resuming) {
        resuming = true;
        Promise.resolve(context.resume()).catch(() => {}).finally(() => { resuming = false; });
      }
    } catch {
      resuming = false;
    }
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!master || context.state === 'closed') return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(enabled ? .48 : 0, now, .008);
    if (!enabled) {
      for (const source of voices) {
        try { source.stop(now + .019); } catch {}
      }
      lastPlayed.clear();
    }
  }

  // One short envelope per note or noise burst. Only the connections for a live voice survive.
  function voice(type, from, to, duration, gain, delay, pan) {
    if (voices.size >= maxVoices) return;
    const start = context.currentTime + delay;
    const end = start + duration;
    const source = type === 'noise' ? context.createBufferSource() : context.createOscillator();
    let filter;
    let tone = source;
    if (type === 'noise') {
      source.buffer = noise;
      filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = .8;
      source.connect(filter);
      tone = filter;
    } else {
      source.type = type;
    }
    tone.frequency.setValueAtTime(from, start);
    tone.frequency.exponentialRampToValueAtTime(to, end);
    const amp = context.createGain();
    amp.gain.setValueAtTime(.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + .004);
    amp.gain.exponentialRampToValueAtTime(.0001, end);
    tone.connect(amp);
    let panner;
    if (pan && context.createStereoPanner) {
      panner = context.createStereoPanner();
      panner.pan.value = pan;
      amp.connect(panner);
      panner.connect(master);
    } else amp.connect(master);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      if (filter) filter.disconnect();
      amp.disconnect();
      if (panner) panner.disconnect();
    };
    voices.add(source);
    source.start(start);
    source.stop(end + .006);
  }

  function play(type, player = 0) {
    if (!enabled || !context || context.state !== 'running') return;
    const now = context.currentTime;
    const key = type + '/' + player;
    if (now - (lastPlayed.get(key) ?? -1) < .045) return;
    lastPlayed.set(key, now);
    const side = player === 1 ? .22 : -.22;
    switch (type) {
      case 'swing':
        voice('noise', 1050, 6000, .105, .34, 0, side);
        break;
      case 'hit':
        voice('triangle', 145, 44, .18, .55, 0, -side);
        voice('noise', 3800, 780, .105, .47, 0, -side);
        break;
      case 'block':
        voice('square', 1010, 560, .052, .12, 0, -side);
        voice('sine', 1880, 1090, .16, .16, .009, -side);
        break;
      case 'dash':
        voice('noise', 3700, 550, .16, .46, 0, side);
        voice('triangle', 220, 82, .10, .16, 0, side);
        break;
      case 'countdown':
        voice('triangle', 587, 587, .11, .30, 0, 0);
        break;
      case 'start':
        voice('square', 660, 660, .075, .12, 0, 0);
        voice('triangle', 990, 990, .22, .32, .066, 0);
        break;
      case 'select':
        voice('triangle', 740, 960, .085, .23, 0, 0);
        break;
      case 'round':
        voice('triangle', 392, 392, .14, .33, 0, 0);
        voice('triangle', 523, 523, .22, .32, .095, 0);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((hz, i) => {
          voice('triangle', hz, hz, i === 3 ? .31 : .13, .33, i * .083, 0);
        });
        break;
    }
  }

  window.ArenaAudio = { unlock, setEnabled, play };
})();

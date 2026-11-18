(() => {
  'use strict';
  const publicOrigin = 'https://neon-clash-arcade-k8w3.whvian.chatgpt.site';
  const envelope = 'neon-wire-v1';
  const encoder = new TextEncoder();

  async function post(base, action, body, keepalive = false) {
    const response = await fetch(base + '/relay/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', keepalive,
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const error = new Error(result.error || '房间服务连接失败，请重试。');
      error.status = response.status;
      throw error;
    }
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      const error = new Error('当前地址未提供互联网房间服务。');
      error.status = 415;
      throw error;
    }
    return response.json();
  }

  async function open(joinCode, callbacks, makeSession, base = '') {
    const isHost = !joinCode;
    callbacks.onStatus?.(isHost ? '正在创建互联网房间…' : '正在加入互联网房间…');
    const credentials = await post(base,isHost ? 'create' : 'join',isHost ? {} : {code:joinCode});
    const {code,token} = credentials;
    if (!/^R[A-Z2-9]{5}$/.test(code) || typeof token !== 'string') throw Error('房间服务返回了无效房间。');
    const session = makeSession(code,isHost,callbacks);
    const unsent = [], httpQueue = [], directUnacked = new Map(), reorder = new Map();
    let httpBatch = [], outgoingHttp = 0, receivedHttp = 0, outgoingGame = 0, receivedGame = 0;
    let peer = null, channel = null, direct = false, triedDirect = false, setupTimer = 0;
    let pendingIce = [], signalWork = Promise.resolve();
    let timer = 0, inFlight = false, immediate = false, lastContact = performance.now(), failures = 0;

    function schedule(delay) {
      if (session.closed) return;
      if (inFlight) { if (!delay) immediate = true; return; }
      clearTimeout(timer);
      timer = setTimeout(sync,delay);
    }

    function queueHttp(msg) {
      if (httpQueue.length >= 256) { session.finish('网络拥堵，请重新进入房间。'); return; }
      const bytes = encoder.encode(JSON.stringify(msg)).length;
      if (bytes > 24*1024 - 128) { session.finish('对战消息过大，请重新开局。'); return; }
      httpQueue.push({item:{seq:++outgoingHttp,msg},bytes:bytes+64});
    }

    function sendSignal(kind,data) {
      if (session.closed) return;
      queueHttp({wire:envelope,kind,data});
      schedule(0);
    }

    function stopDirect() {
      clearTimeout(setupTimer);
      const oldChannel = channel, oldPeer = peer, wasDirect = direct;
      channel = null; peer = null; direct = false;
      if (oldChannel) {
        oldChannel.onclose = oldChannel.onerror = oldChannel.onmessage = oldChannel.onopen = null;
        try { oldChannel.close(); } catch {}
      }
      if (oldPeer) {
        oldPeer.onicecandidate = oldPeer.ondatachannel = oldPeer.onconnectionstatechange = null;
        try { oldPeer.close(); } catch {}
      }
      if (!session.closed && directUnacked.size) {
        for (const item of directUnacked.values()) queueHttp(item.packet);
      }
      directUnacked.clear();
      pendingIce = [];
      if (wasDirect) schedule(0);
    }

    function acknowledgeDirect() {
      if (!direct || channel?.readyState !== 'open') return;
      try { channel.send(JSON.stringify({wire:envelope,kind:'ack',seq:receivedGame})); }
      catch { stopDirect(); }
    }

    function deliver(packet) {
      if (!Number.isSafeInteger(packet.seq) || packet.seq < 1 || !packet.msg || typeof packet.msg !== 'object') return;
      if (packet.seq > receivedGame + 256) { session.finish('房间消息失去同步，请重新加入。'); return; }
      if (packet.seq > receivedGame) reorder.set(packet.seq,packet.msg);
      while (reorder.has(receivedGame + 1)) {
        const seq = ++receivedGame, message = reorder.get(seq);
        reorder.delete(seq);
        session.receive(message);
      }
      acknowledgeDirect();
    }

    function bindChannel(ch) {
      if (channel || ch.label !== 'neon-duel') { ch.close(); return; }
      channel = ch;
      ch.onopen = () => {
        if (session.closed || channel !== ch) return;
        clearTimeout(setupTimer);
        direct = true;
        pump();
      };
      ch.onmessage = event => {
        if (channel !== ch || typeof event.data !== 'string' || event.data.length > 32*1024) return;
        let packet; try { packet=JSON.parse(event.data); } catch { return; }
        if (packet?.wire !== envelope) return;
        if (packet.kind === 'game') deliver(packet);
        else if (packet.kind === 'ack' && Number.isSafeInteger(packet.seq) && packet.seq<=outgoingGame) {
          for (const seq of directUnacked.keys()) if (seq<=packet.seq) directUnacked.delete(seq);
        }
      };
      ch.onclose = ch.onerror = () => { if (ch === channel) stopDirect(); };
    }

    function preparePeer() {
      if (triedDirect || session.closed) return;
      triedDirect = true;
      if (typeof window.RTCPeerConnection !== 'function') return;
      try {
        const pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
        peer = pc;
        pc.onicecandidate = event => {
          if (pc === peer && event.candidate) sendSignal('ice',event.candidate.toJSON());
        };
        pc.onconnectionstatechange = () => {
          if (pc === peer && ['failed','closed'].includes(pc.connectionState)) stopDirect();
        };
        pc.ondatachannel = event => { if (pc===peer) bindChannel(event.channel); };
        setupTimer = setTimeout(() => { if (!direct && peer===pc) stopDirect(); },15000);
        if (isHost) {
          bindChannel(pc.createDataChannel('neon-duel',{ordered:true}));
          signalWork = signalWork.then(async () => {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (peer===pc) sendSignal('offer',{type:'offer',sdp:offer.sdp});
          }).catch(stopDirect);
        }
      } catch { stopDirect(); }
    }

    function receiveSignal(packet) {
      if (!peer) return;
      const pc = peer;
      signalWork = signalWork.then(async () => {
        if (peer!==pc || session.closed) return;
        if (packet.kind==='ice') {
          if (pc.remoteDescription) await pc.addIceCandidate(packet.data);
          else if (pendingIce.length < 32) pendingIce.push(packet.data);
          return;
        }
        if (packet.kind !== (isHost?'answer':'offer') || packet.data?.type!==packet.kind) return;
        await pc.setRemoteDescription(packet.data);
        for (const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate);
        if (!isHost) {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (peer===pc) sendSignal('answer',{type:'answer',sdp:answer.sdp});
        }
      }).catch(stopDirect);
    }

    function pump() {
      if (session.closed) return;
      while (unsent.length && !session.closed) {
        const packet = {wire:envelope,kind:'game',seq:++outgoingGame,msg:unsent.shift()};
        if (direct && channel?.readyState === 'open') {
          directUnacked.set(packet.seq,{packet,at:performance.now()});
          try {
            if (channel.bufferedAmount > 96*1024 || directUnacked.size > 64) stopDirect();
            else channel.send(JSON.stringify(packet));
          } catch { stopDirect(); }
        } else queueHttp(packet);
      }
    }

    function send(message) {
      if (unsent.length >= 192) { session.finish('网络拥堵，请重新进入房间。'); return false; }
      // Game snapshots are mutable on the host. Freeze each one before asynchronous delivery.
      const copy = JSON.parse(JSON.stringify(message));
      const tail = unsent[unsent.length-1];
      if (copy.type==='frame' && tail?.type==='frame' && copy.state?.phase===tail.state?.phase
        && copy.state?.round===tail.state?.round && (tail.events?.length || 0)+(copy.events?.length || 0)<=12) {
        copy.events = [...(tail.events || []),...(copy.events || [])];
        unsent[unsent.length-1] = copy;
      } else unsent.push(copy);
      if (direct) pump();
      else if (copy.type!=='frame') schedule(0);
      return true;
    }

    async function sync() {
      if (inFlight || session.closed) return;
      inFlight = true;
      immediate = false;
      const start = performance.now();
      let retry = 0;
      try {
        const oldest = directUnacked.values().next().value;
        if (oldest && start-oldest.at>2400) stopDirect();
        if (!httpBatch.length) {
          pump();
          let bytes = 0;
          while (httpQueue.length && httpBatch.length<32 && bytes+httpQueue[0].bytes<120*1024) {
            const next = httpQueue.shift();
            bytes += next.bytes;
            httpBatch.push(next.item);
          }
        }
        const result = await post(base,'sync',{code,token,ack:receivedHttp,items:httpBatch});
        if (session.closed) return;
        if (result.closed) { session.finish('好友已离开，房间已关闭。'); return; }
        if (typeof result.connected !== 'boolean' || !Array.isArray(result.items)) throw Error('房间服务响应异常。');
        httpBatch = [];
        lastContact = performance.now();
        failures = 0;
        if (result.connected && !session.connected) {
          session.ready();
          preparePeer();
        }
        for (const item of result.items) {
          if (item.seq <= receivedHttp) continue;
          if (item.seq !== receivedHttp+1) break;
          receivedHttp = item.seq;
          if (item.msg?.wire !== envelope) continue;
          if (item.msg.kind==='game') deliver(item.msg);
          else receiveSignal(item.msg);
        }
      } catch (err) {
        if (session.closed) return;
        const permanent = [400,401,403,404,409,410,413].includes(err.status);
        if (permanent || performance.now()-lastContact>28000) {
          session.finish(permanent ? err.message : '与房间服务的连接已中断，请重新加入。');
          return;
        }
        retry = Math.min(1600,150 * (2**Math.min(4,failures++)));
      } finally {
        inFlight=false;
        const cadence = !session.connected ? 340 : direct ? 1100 : 60;
        const wait = Math.max(0,cadence-(performance.now()-start));
        schedule(retry || (immediate || httpQueue.length ? 0 : wait));
      }
    }

    session.wire(send,() => {
      clearTimeout(timer);
      stopDirect();
      post(base,'leave',{code,token},true).catch(() => {});
    });
    if (isHost) session.allocate();
    schedule(0);
    return session.promise;
  }

  window.ArenaRelay = {open,publicOrigin};
})();

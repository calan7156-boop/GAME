(() => {
  "use strict";

  const scriptUrl = document.currentScript?.src || location.href;
  const api = "/arena-api";
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const peerPrefix = "stick-duel-arena-v1-";
  let serverInfo;
  let peerLibrary;

  function service() {
    if (!serverInfo) {
      serverInfo = /^https?:$/.test(location.protocol)
        ? fetch(api + "/meta", { cache: "no-store", signal: AbortSignal.timeout(3500) })
          .then(r => r.ok && r.headers.get("Content-Type")?.includes("application/json") ? r.json() : null)
          .then(data => data?.service === "stick-arena-rooms-v1" ? data : null).catch(() => null)
        : Promise.resolve(null);
    }
    return serverInfo;
  }

  async function request(path, token, body, keepalive = false) {
    const headers = {};
    if (token) headers.Authorization = "Bearer " + token;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(api + path, {
      method: "POST", cache: "no-store", headers, body, keepalive, signal: AbortSignal.timeout(8000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "无法连接房间");
    return result;
  }

  function session(code, isHost, cb) {
    let closed = false;
    let connected = false;
    let announced = false;
    let allocated = false;
    let disconnect = () => {};
    let transmit = () => false;
    const pending = [];
    let resolveHandle, rejectHandle;
    const promise = new Promise((resolve, reject) => { resolveHandle = resolve; rejectHandle = reject; });

    function finish(reason) {
      if (closed) return;
      closed = true;
      window.removeEventListener("pagehide", handle.close);
      cb.signal?.removeEventListener("abort", handle.close);
      disconnect();
      if (!allocated) rejectHandle(new Error(reason || "连接已取消"));
      else if (reason) cb.onClose?.(reason);
    }
    const handle = {
      code, isHost,
      send(data) { return connected && !closed && data && typeof data === "object" ? transmit(data) : false; },
      close() { finish(); }
    };
    window.addEventListener("pagehide", handle.close);
    cb.signal?.addEventListener("abort", handle.close, { once: true });
    return {
      promise, handle, finish,
      get closed() { return closed; },
      get connected() { return connected; },
      wire(send, cleanup) { transmit = send; disconnect = cleanup; if (cb.signal?.aborted) finish(); },
      allocate() {
        if (closed || allocated) return;
        allocated = true;
        resolveHandle(handle);
      },
      ready() {
        if (closed || connected) return;
        connected = true;
        this.allocate();
        // Let callers store their handle before they are asked to send the first game state.
        setTimeout(() => {
          if (closed) return;
          announced = true;
          cb.onReady?.();
          for (const item of pending.splice(0)) cb.onMessage?.(item);
        }, 0);
      },
      receive(data) {
        if (closed || !connected || !data || typeof data !== "object" || Array.isArray(data)) return;
        if (announced) cb.onMessage?.(data);
        else if (pending.length < 48) pending.push(data);
      }
    };
  }

  async function localRoom(code, cb) {
    const isHost = !code;
    cb.onStatus?.(isHost ? "正在创建局域网房间…" : "正在加入局域网房间…");
    const credentials = await request(code ? "/rooms/" + code + "/join" : "/rooms");
    const base = "/rooms/" + credentials.code;
    const s = session(credentials.code, isHost, cb);
    const events = new EventSource(api + base + "/events?ticket=" + credentials.token);
    let sending = false;
    const queue = [];
    const timeout = setTimeout(() => s.finish("连接房间超时，请重新加入"), 12000);

    async function flush() {
      if (sending || s.closed) return;
      sending = true;
      try {
        while (!s.closed && queue.length) {
          await request(base + "/data", credentials.token, JSON.stringify(queue.splice(0, 16)));
        }
      } catch (err) {
        if (!s.closed) s.finish(err.message || "联机网络已断开");
      } finally { sending = false; }
    }
    s.wire(data => {
      if (queue.length >= 48) { s.finish("网络连接过慢，请重新加入"); return false; }
      queue.push(data);
      void flush();
      return true;
    }, () => {
      clearTimeout(timeout);
      events.close();
      request(base + "/leave", credentials.token, undefined, true).catch(() => {});
    });
    events.onmessage = event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.event === "listening" && isHost) {
        clearTimeout(timeout);
        s.allocate();
        cb.onStatus?.("房间已创建，等待朋友加入");
      } else if (packet.event === "ready") {
        clearTimeout(timeout);
        s.ready();
      } else if (packet.event === "data" && Array.isArray(packet.items)) {
        for (const item of packet.items) s.receive(item);
      } else if (packet.event === "close") s.finish(packet.reason || "对手已离开");
    };
    events.onerror = () => s.finish("与房间的连接已断开，请重新加入");
    return s.promise;
  }

  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (!peerLibrary) peerLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("vendor/peerjs-1.5.5.min.js", scriptUrl).href;
      const timer = setTimeout(() => fail(), 12000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        peerLibrary = null;
        reject(new Error("联机组件加载失败，请刷新后重试"));
      }
      script.onerror = fail;
      script.onload = () => {
        if (!window.Peer) return fail();
        clearTimeout(timer);
        resolve(window.Peer);
      };
      document.head.appendChild(script);
    });
    return peerLibrary;
  }

  function randomCode() {
    return "P" + Array.from(crypto.getRandomValues(new Uint8Array(5)), n => alphabet[n % 32]).join("");
  }

  const explanations = {
    "browser-incompatible": "这个浏览器不支持实时联机，请使用新版 Chrome、Edge、Firefox 或 Safari",
    "peer-unavailable": "找不到这个房间，请核对房间码并确认房主在线",
    "network": "无法连接互联网房间服务，请检查网络后重试",
    "server-error": "房间服务暂时无法连接，请稍后重试",
    "socket-error": "与房间服务的连接已断开，请稍后重试",
    "unavailable-id": "房间号码冲突，请重新创建"
  };

  async function internetRoom(joinCode, cb, remaining = 2) {
    cb.onStatus?.(joinCode ? "正在寻找朋友的房间…" : "正在连接互联网房间服务…");
    const Peer = await loadPeer();
    if (cb.signal?.aborted) throw new Error("连接已取消");
    const isHost = !joinCode;
    const code = joinCode || randomCode();
    const peer = new Peer(isHost ? peerPrefix + code : undefined, { secure: true, debug: 0 });
    const s = session(code, isHost, cb);
    let active = null;
    let channelTimeout;
    let heartbeat;
    let lastPacket = Date.now();
    let conflict = false;
    let setup = setTimeout(() => s.finish("房间服务连接超时，请检查网络后重试"), 16000);

    function control(connection, type) { if (connection.open) connection.send({ arena: 1, type }); }
    function bind(connection) {
      if (s.closed) { connection.close(); return; }
      if (isHost && (active || connection.metadata?.game !== "stick-arena-v1")) {
        connection.on("open", () => {
          control(connection, "full");
          setTimeout(() => connection.close(), 500);
        });
        return;
      }
      active = connection;
      channelTimeout = setTimeout(() => {
        if (!isHost) return s.finish("无法建立对战连接，请检查双方网络或使用同一局域网房间");
        if (active !== connection) return;
        active = null;
        connection.close();
        cb.onStatus?.("连接尝试超时，房间继续等待朋友加入");
      }, 22000);
      connection.on("open", () => { if (!isHost) control(connection, "hello"); });
      connection.on("data", packet => {
        if (active !== connection || s.closed || packet?.arena !== 1) return;
        lastPacket = Date.now();
        if (packet.type === "full") return s.finish("这个房间已经有两位玩家");
        if ((isHost && packet.type === "hello") || (!isHost && packet.type === "welcome")) {
          if (s.connected) return;
          if (isHost) control(connection, "welcome");
          clearTimeout(channelTimeout);
          heartbeat = setInterval(() => {
            if (Date.now() - lastPacket > 65000) s.finish("对手的连接已中断");
            else control(connection, "ping");
          }, 5000);
          s.ready();
        } else if (packet.type === "game") s.receive(packet.data);
        else if (packet.type === "leave") s.finish("对手已离开房间");
      });
      function lost() {
        if (active !== connection || s.closed) return;
        clearTimeout(channelTimeout);
        if (isHost && !s.connected) {
          active = null;
          cb.onStatus?.("房间已创建，等待朋友加入");
        } else s.finish("对手已离开或网络已断开");
      }
      connection.on("close", lost);
      connection.on("error", lost);
    }
    s.wire(data => {
      if (!active?.open) return false;
      if (active.dataChannel?.bufferedAmount > 512 * 1024) {
        s.finish("网络连接过慢，请重新加入");
        return false;
      }
      try { active.send({ arena: 1, type: "game", data }); return true; }
      catch { s.finish("与对手的连接已断开"); return false; }
    }, () => {
      clearTimeout(setup);
      clearTimeout(channelTimeout);
      clearInterval(heartbeat);
      if (active?.open) {
        try { control(active, "leave"); } catch { /* Channel already closed. */ }
      }
      peer.destroy();
    });
    peer.on("open", () => {
      clearTimeout(setup);
      if (s.closed) return;
      if (isHost) {
        s.allocate();
        if (!active) cb.onStatus?.("房间已创建，等待朋友加入");
      } else if (!active) {
        cb.onStatus?.("正在建立对战连接…");
        bind(peer.connect(peerPrefix + code, { reliable: true, serialization: "json", metadata: { game: "stick-arena-v1" } }));
      }
    });
    peer.on("connection", connection => isHost ? bind(connection) : connection.close());
    peer.on("error", err => {
      if (s.closed || s.connected) return;
      conflict = isHost && err.type === "unavailable-id";
      s.finish(explanations[err.type] || "房间连接失败，请稍后重试");
    });
    peer.on("disconnected", () => {
      if (s.closed || s.connected || peer.destroyed) return;
      clearTimeout(setup);
      setup = setTimeout(() => s.finish("房间服务连接中断，请重新创建"), 12000);
      try { peer.reconnect(); } catch { s.finish("房间服务连接中断，请重试"); }
    });
    peer.on("close", () => { if (!s.closed) s.finish("房间连接已关闭"); });
    try { return await s.promise; }
    catch (err) {
      if (conflict && remaining > 0 && !cb.signal?.aborted) return internetRoom(null, cb, remaining - 1);
      throw err;
    }
  }

  window.ArenaNetwork = {
    async create(callbacks = {}, options = {}) {
      const relay = window.ArenaRelay;
      if (relay && location.origin === relay.publicOrigin) return relay.open(null, callbacks, session);
      if (location.protocol === "file:") return internetRoom(null, callbacks);
      if (await service()) {
        return options.transport === "internet" ? internetRoom(null, callbacks) : localRoom(null, callbacks);
      }
      if (relay) {
        try { return await relay.open(null, callbacks, session); }
        catch (error) { if (![404,405,415].includes(error.status)) throw error; }
      }
      return internetRoom(null,callbacks);
    },
    async join(input, callbacks = {}) {
      const code = String(input || "").trim().toUpperCase();
      if (!/^[LPR][A-Z2-9]{5}$/.test(code)) throw new Error("请输入完整的六位房间码");
      if (code.startsWith("R")) {
        const relay = window.ArenaRelay;
        if (!relay) throw new Error("请打开游戏的在线版本加入这个房间。");
        if (location.origin !== relay.publicOrigin && (location.protocol === "file:" || await service())) {
          location.assign(relay.publicOrigin + "/?room=" + code);
          throw new Error("正在打开在线对战房间…");
        }
        return relay.open(code, callbacks, session);
      }
      if (code.startsWith("P")) return internetRoom(code, callbacks);
      if (!await service()) throw new Error("这是局域网房间，请连接同一网络并打开房主的邀请链接");
      return localRoom(code, callbacks);
    },
    async inviteUrl(code) {
      if (code.startsWith("R") && window.ArenaRelay) return window.ArenaRelay.publicOrigin + "/?room=" + code;
      const url = new URL(location.href);
      if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) {
        const info = await service();
        if (info?.lan) url.hostname = info.lan;
      }
      url.search = "";
      url.hash = "";
      url.searchParams.set("room", code);
      return url.href;
    }
  };
})();

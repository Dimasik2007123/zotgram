import { api, changed } from "./client";

export function startRealtime() {
  let stopped = false,
    socket,
    timer,
    heartbeat,
    retry = 0,
    lastSync = 0,
    lastPong = 0,
    lastMembershipSync = Date.now(),
    connectedBefore = false,
    ready = false;
  const reconcile = (sync = false) => {
    lastSync = Date.now();
    const memberships = sync || lastSync - lastMembershipSync >= 300000;
    if (memberships) lastMembershipSync = lastSync;
    changed("chats", { sync: memberships });
    changed("messages");
  };
  const onFocus = () => {
    if (!stopped && ready && socket?.readyState === WebSocket.OPEN &&
        document.visibilityState === "visible" && Date.now() - lastSync >= 30000) reconcile();
  };
  async function connect() {
    if (stopped) return;
    try {
      const { ticket } = await api("/api/chat/ws-ticket/", { method: "POST" });
      if (stopped) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/chat/`,
      );
      const current = socket;
      current.onopen = () => {
        if (!stopped && current === socket) current.send(JSON.stringify({ type: "auth", ticket }));
      };
      current.onmessage = (event) => {
        if (stopped || current !== socket) return;
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!payload || typeof payload !== "object") return;
        if (payload.type === "auth.ready") {
          retry = 0;
          ready = true;
          lastPong = Date.now();
          reconcile(connectedBefore);
          connectedBefore = true;
          clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            if (Date.now() - lastPong > 60000) current.close();
            else if (current.readyState === WebSocket.OPEN)
              current.send(JSON.stringify({ type: "ping" }));
          }, 25000);
        } else if (payload.type === "pong") {
          lastPong = Date.now();
          // Keep a less frequent HTTP repair for events lost during a Redis outage.
          if (Date.now() - lastSync >= 120000) reconcile();
        } else if (payload.type === "read.updated") {
          changed("reads", payload);
        } else if (payload.type === "message.created") {
          changed("messages", payload);
        } else if (["chat.updated", "chat.removed"].includes(payload.type)) {
          changed("chats", payload);
        }
      };
      current.onclose = () => {
        if (current !== socket) return;
        ready = false;
        clearInterval(heartbeat);
        if (!stopped)
          timer = setTimeout(
            connect,
            Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)) +
              Math.random() * 500,
          );
      };
      current.onerror = () => current.close();
    } catch {
      if (!stopped) timer = setTimeout(connect, 5000);
    }
  }
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  void connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
    socket?.close();
  };
}

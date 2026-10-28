import { api, changed } from "./client";

export function startRealtime() {
  let stopped = false,
    socket,
    timer,
    heartbeat,
    retry = 0;
  async function connect() {
    if (stopped) return;
    try {
      const { ticket } = await api("/api/chat/ws-ticket/", { method: "POST" });
      if (stopped) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/chat/`,
      );
      socket.onopen = () =>
        socket.send(JSON.stringify({ type: "auth", ticket }));
      socket.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload.type === "auth.ready") {
          retry = 0;
          changed("chats");
          changed("messages");
          clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ type: "ping" }));
          }, 25000);
        } else if (payload.type === "pong") {
          // HTTP сверка восстанавливает и событие, потерянное при сбое Redis.
          changed("chats");
          changed("messages");
        } else {
          changed("chats", payload);
          changed("messages", payload);
        }
      };
      socket.onclose = () => {
        clearInterval(heartbeat);
        if (!stopped)
          timer = setTimeout(
            connect,
            Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)) +
              Math.random() * 500,
          );
      };
      socket.onerror = () => socket.close();
    } catch {
      if (!stopped) timer = setTimeout(connect, 5000);
    }
  }
  void connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
    socket?.close();
  };
}

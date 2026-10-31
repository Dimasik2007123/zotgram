import { store } from "../store";
import { serverApi } from "./serverApi";
import { playNotificationSound } from "../utils/notificationSound";

export function startMessageNotifications(userId, navigate) {
  const canNotify = "Notification" in window && window.isSecureContext;

  const seen = new Set();
  let stopped = false;
  const notifications = new Set();

  const requestPermission = () => {
    if (canNotify && Notification.permission === "default") {
      Notification.requestPermission().catch((error) => {
        console.warn("Не удалось запросить уведомления", error);
      });
    }
  };

  if (canNotify && Notification.permission === "default") {
    document.addEventListener("click", requestPermission, { once: true });
  }

  const handleMessage = async ({ detail }) => {
    if (detail.topic !== "messages") return;

    const event = detail.event;
    if (event?.type !== "message.created") return;

    const message = event.message;
    if (!message?.id || !event.chat_id) return;

    if (String(message.authorId) === String(userId)) return;

    if (seen.has(message.id)) return;
    seen.add(message.id);

    if (seen.size > 500) {
      seen.delete(seen.values().next().value);
    }

    const path = `/chats/${event.chat_id}`;

    const readingThisChat =
      window.location.pathname === path &&
      document.visibilityState === "visible" &&
      document.hasFocus();

    playNotificationSound();
    if (readingThisChat) return;
    if (!canNotify || Notification.permission !== "granted") return;

    try {
      const state = store.getState();
      const cachedAuthor = serverApi.endpoints.getPerson.select(
        String(message.authorId),
      )(state).data;
      const cachedChat =
        state.chats.items?.find((item) => item.id === event.chat_id) ||
        serverApi.endpoints.getChat.select(event.chat_id)(state).data;
      const [author, chat] = await Promise.all([
        cachedAuthor ||
          store
            .dispatch(
              serverApi.endpoints.getPerson.initiate(String(message.authorId), {
                subscribe: false,
              }),
            )
            .unwrap(),
        cachedChat ||
          store
            .dispatch(
              serverApi.endpoints.getChat.initiate(event.chat_id, {
                subscribe: false,
              }),
            )
            .unwrap(),
      ]);

      if (
        stopped ||
        Notification.permission !== "granted" ||
        store.getState().user.user?.id !== userId
      )
        return;

      const authorName =
        [author.name, author.lastname].filter(Boolean).join(" ") ||
        "Пользователь";

      const chatName =
        chat.type === "group" ? chat.name || "Групповой чат" : authorName;

      const text =
        message.content ||
        (message.attachment ? "Вложение" : "Новое сообщение");

      const notification = new Notification(`ZotGram — ${chatName}`, {
        body: `${authorName}: ${text}`.slice(0, 150),
        tag: `message-${message.id}`,
      });

      notifications.add(notification);

      notification.onclick = () => {
        window.focus();
        navigate(path);
        notification.close();
      };

      notification.onclose = () => {
        notifications.delete(notification);
      };
    } catch (error) {
      console.warn("Не удалось показать уведомление", error);
    }
  };

  window.addEventListener("zotgram:changed", handleMessage);

  return () => {
    stopped = true;
    document.removeEventListener("click", requestPermission);
    window.removeEventListener("zotgram:changed", handleMessage);

    for (const notification of notifications) {
      notification.close();
    }

    notifications.clear();
    seen.clear();
  };
}

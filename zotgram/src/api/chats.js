import { api, changed } from "./client";

export async function openDirectChat(recipient_id) {
  const chat = await api("/api/chat/direct/", {
    method: "POST",
    body: { recipient_id },
  });
  changed("chats");
  return chat.id;
}

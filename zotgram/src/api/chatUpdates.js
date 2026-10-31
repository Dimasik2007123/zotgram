import { applyRead, loadChats, removeChat } from "../store/chatsReducer";
import { serverApi, applyIncomingMessage, applyReadToCache, refreshChat } from "./serverApi";

export function startChatUpdates(dispatch) {
  const handle = ({ detail: { topic, event } }) => {
    if (topic === "reads") {
      dispatch(applyRead(event));
      dispatch(applyReadToCache(event));
    } else if (topic === "messages" && event?.type === "message.created") {
      if (event.message?.chatId === event.chat_id) dispatch(applyIncomingMessage(event.message));
    } else if (topic === "profiles") {
      dispatch(serverApi.util.invalidateTags(["Person", "Chat", "Directory", "Posts", "ChatSearch"]));
      dispatch(loadChats({ force: true, sync: true }));
    } else if (topic === "posts") {
      dispatch(serverApi.util.invalidateTags(["Posts"]));
    } else if (topic === "chats") {
      dispatch(serverApi.util.invalidateTags(["ChatSearch"]));
      if (event?.type === "chat.removed") {
        dispatch(removeChat(event.chat_id));
        dispatch(serverApi.util.getRunningQueryThunk("getChat", event.chat_id))?.abort();
        void dispatch(serverApi.util.upsertQueryData("getChat", event.chat_id, null));
      } else if (event?.chat_id) {
        void dispatch(refreshChat(event.chat_id));
      } else {
        dispatch(serverApi.util.invalidateTags(["Chat"]));
        dispatch(loadChats({ force: true, sync: Boolean(event?.sync) }));
      }
    }
  };
  window.addEventListener("zotgram:changed", handle);
  return () => window.removeEventListener("zotgram:changed", handle);
}

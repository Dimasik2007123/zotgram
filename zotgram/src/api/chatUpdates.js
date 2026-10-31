import { applyRead, loadChats } from "../store/chatsReducer";
import { serverApi } from "./serverApi";

export function startChatUpdates(dispatch) {
  const handle = ({ detail: { topic, event } }) => {
    if (topic === "reads") {
      dispatch(applyRead(event));
    } else if (topic === "profiles") {
      dispatch(serverApi.util.invalidateTags(["Person", "Chat"]));
      dispatch(loadChats({ force: true, sync: true }));
    } else if (topic === "chats") {
      dispatch(serverApi.util.invalidateTags(event?.chat_id
        ? [{ type: "Chat", id: event.chat_id }]
        : ["Chat"]));
      dispatch(loadChats({ force: true, sync: Boolean(event?.sync) }));
    }
  };
  window.addEventListener("zotgram:changed", handle);
  return () => window.removeEventListener("zotgram:changed", handle);
}

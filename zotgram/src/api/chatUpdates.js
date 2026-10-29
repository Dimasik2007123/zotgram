import { applyRead, loadChats } from "../store/chatsReducer";

export function startChatUpdates(dispatch) {
  const handle = ({ detail: { topic, event } }) => {
    if (topic === "reads") {
      dispatch(applyRead(event));
    } else if (topic === "profiles") {
      dispatch(loadChats({ force: true, sync: true }));
    } else if (topic === "chats") {
      dispatch(loadChats({ force: true, sync: Boolean(event?.sync) }));
    }
  };
  window.addEventListener("zotgram:changed", handle);
  return () => window.removeEventListener("zotgram:changed", handle);
}

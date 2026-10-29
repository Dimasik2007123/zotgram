import statusText from "../utils/statusText";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api, allPages } from "../api/client";

const initialState = {
  ownerId: null,
  items: null,
  loading: false,
  error: "",
  requestId: null,
  queued: false,
  syncNext: true,
  unreadLoading: false,
  unreadRequestId: null,
  needsUnread: false,
};

const fetchChats = createAsyncThunk("chats/fetch", async ({ ownerId, sync }) => ({
  ownerId,
  items: await allPages(`/api/chat/chats/?page_size=100${sync ? "&sync=1" : ""}`),
}));

const fetchUnread = createAsyncThunk("chats/unread", async (ownerId) => ({
  ownerId,
  ...(await api("/api/chat/unread/")),
}));

function updateCount(state, row) {
  const chat = state.items?.find((item) => item.id === row.id);
  if (!chat) {
    if (state.loading) state.needsUnread = true;
    return;
  }
  // Запоздавший ответ не должен возвращать уже прочитанные сообщения.
  if (row.lastReadSequence < chat.lastReadSequence) return;
  if (row.lastSequence < Math.max(chat.lastSequence, chat.countedSequence || 0)) {
    if (row.lastReadSequence > chat.lastReadSequence) state.needsUnread = true;
    return;
  }
  chat.lastReadSequence = row.lastReadSequence;
  chat.unreadCount = row.unreadCount;
  chat.countedSequence = row.lastSequence;
}

const chatsSlice = createSlice({
  name: "chats",
  initialState,
  reducers: {
    queueReload(state, action) {
      state.queued = true;
      state.syncNext ||= action.payload;
    },
    receivedRead(state, action) {
      const event = action.payload;
      updateCount(state, {
        id: event.chat_id,
        lastReadSequence: event.sequence,
        lastSequence: event.last_sequence,
        unreadCount: event.unread_count,
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase("user/logout", () => ({ ...initialState }))
      .addCase("user/login", (state, action) => {
        if (state.ownerId !== action.payload.id) {
          return { ...initialState, ownerId: action.payload.id };
        }
      })
      .addCase(fetchChats.pending, (state, action) => {
        state.ownerId = action.meta.arg.ownerId;
        state.loading = true;
        state.error = "";
        state.requestId = action.meta.requestId;
        state.queued = false;
        state.syncNext = false;
      })
      .addCase(fetchChats.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId || state.ownerId !== action.payload.ownerId) return;
        const previous = new Map((state.items || []).map((chat) => [chat.id, chat]));
        state.items = action.payload.items.map((row) => {
          const old = previous.get(row.id);
          if (!old) return row;
          if (old.lastReadSequence > row.lastReadSequence ||
              Math.max(old.lastSequence, old.countedSequence || 0) > row.lastSequence) {
            state.needsUnread = true;
            return {
              ...row,
              lastReadSequence: Math.max(old.lastReadSequence, row.lastReadSequence),
              unreadCount: old.unreadCount,
              countedSequence: old.countedSequence || old.lastSequence,
            };
          }
          return row;
        });
        state.loading = false;
        state.requestId = null;
      })
      .addCase(fetchChats.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.loading = false;
        state.requestId = null;
        state.error = statusText(action.error.message || "Не удалось загрузить чаты");
      })
      .addCase(fetchUnread.pending, (state, action) => {
        state.unreadLoading = true;
        state.unreadRequestId = action.meta.requestId;
        state.needsUnread = false;
      })
      .addCase(fetchUnread.fulfilled, (state, action) => {
        if (state.unreadRequestId !== action.meta.requestId || state.ownerId !== action.payload.ownerId) return;
        state.unreadLoading = false;
        state.unreadRequestId = null;
        action.payload.chats.forEach((row) => updateCount(state, row));
      })
      .addCase(fetchUnread.rejected, (state, action) => {
        if (state.unreadRequestId !== action.meta.requestId) return;
        state.unreadLoading = false;
        state.unreadRequestId = null;
        // Следующее событие или периодическая сверка повторит запрос.
        state.needsUnread = false;
      });
  },
});

export const refreshUnread = () => async (dispatch, getState) => {
  const { user, chats } = getState();
  const ownerId = user.user?.id;
  if (!ownerId || chats.ownerId !== ownerId || chats.items === null || chats.unreadLoading) return;
  await dispatch(fetchUnread(ownerId));
  if (getState().chats.ownerId === ownerId && getState().chats.needsUnread) {
    void dispatch(refreshUnread());
  }
};

export const loadChats = ({ force = false, sync = false } = {}) => async (dispatch, getState) => {
  const { user, chats } = getState();
  const ownerId = user.user?.id;
  if (!ownerId) return;
  if (chats.loading) {
    if (force) dispatch(chatsSlice.actions.queueReload(sync));
    return;
  }
  if (chats.items !== null && !force) return;
  await dispatch(fetchChats({ ownerId, sync: sync || chats.syncNext || chats.items === null }));
  const current = getState().chats;
  if (current.ownerId !== ownerId) return;
  if (current.queued) {
    void dispatch(loadChats({ force: true, sync: current.syncNext }));
  } else if (current.needsUnread) {
    void dispatch(refreshUnread());
  }
};

export const applyRead = (event) => (dispatch, getState) => {
  if (event.user_id !== getState().user.user?.id) return;
  if (event.unread_count == null || event.last_sequence == null) {
    void dispatch(refreshUnread());
    return;
  }
  dispatch(chatsSlice.actions.receivedRead(event));
  if (getState().chats.needsUnread) void dispatch(refreshUnread());
};

export default chatsSlice.reducer;

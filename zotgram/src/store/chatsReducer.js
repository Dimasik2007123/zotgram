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
  updatesDuringLoad: {},
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
    state.needsUnread = true;
    return;
  }
  chat.lastReadSequence = row.lastReadSequence;
  chat.unreadCount = row.unreadCount;
  chat.countedSequence = row.lastSequence;
}

function mergeSnapshot(state, old, row) {
  if (!old) return row;
  const merged = { ...row };
  if (old.lastSequence > row.lastSequence) {
    merged.lastSequence = old.lastSequence;
    merged.lastMessage = old.lastMessage;
    merged.updatedAt = old.updatedAt > row.updatedAt ? old.updatedAt : row.updatedAt;
  }
  if (old.lastReadSequence > row.lastReadSequence ||
      Math.max(old.lastSequence, old.countedSequence || 0) > row.lastSequence) {
    state.needsUnread = true;
    merged.lastReadSequence = Math.max(old.lastReadSequence, row.lastReadSequence);
    merged.unreadCount = old.unreadCount;
    merged.countedSequence = old.countedSequence || old.lastSequence;
  }
  merged.members = row.members.map((member) => ({
    ...member,
    lastReadSequence: Math.max(member.lastReadSequence || 0,
      old.members?.find((entry) => entry.userId === member.userId)?.lastReadSequence || 0),
  }));
  return merged;
}

function sortChats(items) {
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
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
      const chat = state.items?.find((item) => item.id === event.chat_id);
      const person = chat?.members.find((item) => item.userId === event.user_id);
      if (person) person.lastReadSequence = Math.max(person.lastReadSequence || 0, event.sequence);
      if (state.loading && chat) state.updatesDuringLoad[event.chat_id] = "updated";
      if (event.user_id === state.ownerId) updateCount(state, {
          id: event.chat_id,
          lastReadSequence: event.sequence,
          lastSequence: event.last_sequence,
          unreadCount: event.unread_count,
        });
    },
    receivedMessage(state, { payload: message }) {
      const chat = state.items?.find((item) => item.id === message.chatId);
      if (!chat) return;
      const previous = chat.lastSequence || 0;
      const counted = Math.max(previous, chat.countedSequence || 0);
      if (message.sequence > counted) {
        if (message.sequence > counted + 1) state.needsUnread = true;
        if (message.authorId !== state.ownerId && message.sequence > chat.lastReadSequence) {
          chat.unreadCount = (chat.unreadCount || 0) + 1;
        }
        chat.countedSequence = message.sequence;
      }
      if (message.sequence > previous) {
        chat.lastSequence = message.sequence;
        chat.lastMessage = message;
        chat.updatedAt = message.createdAt;
        sortChats(state.items);
      }
      if (state.loading) state.updatesDuringLoad[message.chatId] = "updated";
    },
    upsertChat(state, { payload: row }) {
      state.items ??= [];
      const index = state.items.findIndex((item) => item.id === row.id);
      if (index < 0) state.items.push(row);
      else state.items[index] = mergeSnapshot(state, state.items[index], row);
      sortChats(state.items);
      if (state.loading) state.updatesDuringLoad[row.id] = "updated";
    },
    removeChat(state, { payload: chatId }) {
      if (state.items) state.items = state.items.filter((item) => item.id !== chatId);
      if (state.loading) state.updatesDuringLoad[chatId] = "removed";
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
        state.updatesDuringLoad = {};
      })
      .addCase(fetchChats.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId || state.ownerId !== action.payload.ownerId) return;
        const previous = new Map((state.items || []).map((chat) => [chat.id, chat]));
        const rows = action.payload.items.filter((row) => state.updatesDuringLoad[row.id] !== "removed");
        const ids = new Set(rows.map((row) => row.id));
        state.items = rows.map((row) => mergeSnapshot(state, previous.get(row.id), row));
        previous.forEach((row, id) => {
          if (!ids.has(id) && state.updatesDuringLoad[id] === "updated") state.items.push(row);
        });
        sortChats(state.items);
        state.updatesDuringLoad = {};
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
  if (!getState().user.user?.id) return;
  if (event.user_id === getState().user.user.id &&
      (event.unread_count == null || event.last_sequence == null)) {
    void dispatch(refreshUnread());
    return;
  }
  dispatch(chatsSlice.actions.receivedRead(event));
  if (getState().chats.needsUnread) void dispatch(refreshUnread());
};

export const { receivedMessage, upsertChat, removeChat } = chatsSlice.actions;
export default chatsSlice.reducer;

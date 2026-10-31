import statusText from "../utils/statusText";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { copyWithStructuralSharing } from "@reduxjs/toolkit/query";
import { api } from "../api/client";
import { nextApiPath } from "../api/pagination";
import { getCacheSession } from "../api/cacheSession";

const initialState = {
  ownerId: null,
  items: null,
  loaded: false,
  next: null,
  hasLoadedMore: false,
  loadingMore: false,
  moreError: "",
  moreRequestId: null,
  loading: false,
  error: "",
  requestId: null,
  queued: false,
  syncNext: true,
  unreadLoading: false,
  unreadRequestId: null,
  needsUnread: false,
  updatesDuringLoad: {},
  updatesDuringUnread: {},
  unreadCounts: {},
  unreadCount: 0,
  systemChats: [],
};

const fetchChats = createAsyncThunk("chats/fetch", async ({ ownerId, sync }, { signal }) => {
  const page = await api(`/api/chat/chats/?page_size=20${sync ? "&sync=1" : ""}`, { signal });
  return { ownerId, items: page.results, next: nextApiPath(page.next) };
});

const fetchMoreChats = createAsyncThunk("chats/more", async ({ ownerId, path }, { signal }) => {
  const page = await api(path, { signal });
  return { ownerId, items: page.results, next: nextApiPath(page.next) };
});

const fetchUnread = createAsyncThunk("chats/unread", async (ownerId) => ({
  ownerId,
  ...(await api("/api/chat/unread/")),
}));

const countRow = (chat) => ({ id: chat.id, lastReadSequence: chat.lastReadSequence,
  lastSequence: Math.max(chat.lastSequence, chat.countedSequence || 0), unreadCount: chat.unreadCount });

function countTotal(state) {
  state.unreadCount = Object.values(state.unreadCounts).reduce((sum, row) => sum + row.unreadCount, 0);
}

function updateCount(state, row) {
  const chat = state.items?.find((item) => item.id === row.id);
  const previous = state.unreadCounts[row.id] || chat;
  // Запоздавший ответ не должен возвращать уже прочитанные сообщения.
  if (previous && row.lastReadSequence < previous.lastReadSequence) return;
  if (previous && row.lastSequence < Math.max(previous.lastSequence, previous.countedSequence || 0)) {
    state.needsUnread = true;
    return;
  }
  state.unreadCounts[row.id] = { ...row };
  if (chat) {
    chat.lastReadSequence = row.lastReadSequence;
    chat.unreadCount = row.unreadCount;
    chat.countedSequence = row.lastSequence;
  }
}

function mergeSnapshot(state, old, row) {
  const merged = { ...row };
  if (old && old.lastSequence > row.lastSequence) {
    merged.lastSequence = old.lastSequence;
    merged.lastMessage = old.lastMessage;
    merged.updatedAt = old.updatedAt > row.updatedAt ? old.updatedAt : row.updatedAt;
  }
  if (old && (old.lastReadSequence > row.lastReadSequence ||
      Math.max(old.lastSequence, old.countedSequence || 0) > row.lastSequence)) {
    state.needsUnread = true;
    merged.lastReadSequence = Math.max(old.lastReadSequence, row.lastReadSequence);
    merged.unreadCount = old.unreadCount;
    merged.countedSequence = old.countedSequence || old.lastSequence;
  }
  merged.members = row.members.map((member) => ({
    ...member,
    lastReadSequence: Math.max(member.lastReadSequence || 0,
      old?.members?.find((entry) => entry.userId === member.userId)?.lastReadSequence || 0),
  }));
  const counter = state.unreadCounts[row.id];
  if (counter && counter.lastReadSequence >= merged.lastReadSequence && counter.lastSequence >= merged.lastSequence) {
    merged.lastReadSequence = counter.lastReadSequence;
    merged.unreadCount = counter.unreadCount;
    merged.countedSequence = counter.lastSequence;
  }
  return old ? copyWithStructuralSharing(old, merged) : merged;
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
      if ((state.loading || state.loadingMore) && chat) state.updatesDuringLoad[event.chat_id] = "updated";
      if (state.unreadLoading) state.updatesDuringUnread[event.chat_id] = "updated";
      if (event.user_id === state.ownerId) updateCount(state, {
          id: event.chat_id,
          lastReadSequence: event.sequence,
          lastSequence: event.last_sequence,
          unreadCount: event.unread_count,
        });
      countTotal(state);
    },
    receivedMessage(state, { payload: message }) {
      const chat = state.items?.find((item) => item.id === message.chatId);
      if (!chat) return;
      const previous = chat.lastSequence || 0;
      const counter = state.unreadCounts[message.chatId];
      const counted = Math.max(previous, chat.countedSequence || 0, counter?.lastSequence || 0);
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
      state.unreadCounts[chat.id] = countRow(chat);
      countTotal(state);
      if (state.loading || state.loadingMore) state.updatesDuringLoad[message.chatId] = "updated";
      if (state.unreadLoading) state.updatesDuringUnread[message.chatId] = "updated";
    },
    upsertChat(state, { payload: row }) {
      state.items ??= [];
      updateCount(state, countRow(row));
      const index = state.items.findIndex((item) => item.id === row.id);
      if (index < 0) state.items.push(mergeSnapshot(state, null, row));
      else state.items[index] = mergeSnapshot(state, state.items[index], row);
      sortChats(state.items);
      if (row.systemKey) {
        const index = state.systemChats.findIndex((chat) => chat.id === row.id);
        const room = { id: row.id, systemKey: row.systemKey, departmentId: row.departmentId, name: row.name };
        if (index < 0) state.systemChats.push(room);
        else state.systemChats[index] = room;
      }
      countTotal(state);
      if (state.loading || state.loadingMore) state.updatesDuringLoad[row.id] = "updated";
      if (state.unreadLoading) state.updatesDuringUnread[row.id] = "updated";
    },
    removeChat(state, { payload: chatId }) {
      if (state.items) state.items = state.items.filter((item) => item.id !== chatId);
      delete state.unreadCounts[chatId];
      state.systemChats = state.systemChats.filter((chat) => chat.id !== chatId);
      countTotal(state);
      if (state.loading || state.loadingMore) state.updatesDuringLoad[chatId] = "removed";
      if (state.unreadLoading) state.updatesDuringUnread[chatId] = "removed";
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
        rows.forEach((row) => updateCount(state, countRow(row)));
        state.items = rows.map((row) => mergeSnapshot(state, previous.get(row.id), row));
        previous.forEach((row, id) => {
          if (!ids.has(id) && state.updatesDuringLoad[id] !== "removed" &&
              (state.loaded || state.updatesDuringLoad[id] === "updated")) state.items.push(row);
        });
        if (!state.hasLoadedMore) state.next = action.payload.next;
        state.loaded = true;
        countTotal(state);
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
      .addCase(fetchMoreChats.pending, (state, action) => {
        state.loadingMore = true;
        state.moreError = "";
        state.moreRequestId = action.meta.requestId;
        state.updatesDuringLoad = {};
      })
      .addCase(fetchMoreChats.fulfilled, (state, action) => {
        if (state.moreRequestId !== action.meta.requestId || state.ownerId !== action.payload.ownerId) return;
        const rows = action.payload.items.filter((row) => state.updatesDuringLoad[row.id] !== "removed");
        for (const row of rows) {
          updateCount(state, countRow(row));
          const index = state.items.findIndex((item) => item.id === row.id);
          if (index < 0) state.items.push(mergeSnapshot(state, null, row));
          else state.items[index] = mergeSnapshot(state, state.items[index], row);
        }
        state.next = action.payload.next;
        state.hasLoadedMore = true;
        state.loadingMore = false;
        state.moreRequestId = null;
        state.updatesDuringLoad = {};
        sortChats(state.items);
        countTotal(state);
      })
      .addCase(fetchMoreChats.rejected, (state, action) => {
        if (state.moreRequestId !== action.meta.requestId) return;
        state.loadingMore = false;
        state.moreRequestId = null;
        state.moreError = statusText(action.error.message || "Не удалось загрузить чаты");
      })
      .addCase(fetchUnread.pending, (state, action) => {
        state.unreadLoading = true;
        state.unreadRequestId = action.meta.requestId;
        state.needsUnread = false;
        state.updatesDuringUnread = {};
      })
      .addCase(fetchUnread.fulfilled, (state, action) => {
        if (state.unreadRequestId !== action.meta.requestId || state.ownerId !== action.payload.ownerId) return;
        state.unreadLoading = false;
        state.unreadRequestId = null;
        const visible = new Set(action.payload.chats.map((row) => row.id));
        for (const id of Object.keys(state.unreadCounts)) {
          if (!visible.has(id) && state.updatesDuringUnread[id] !== "updated") delete state.unreadCounts[id];
        }
        action.payload.chats.filter((row) => state.updatesDuringUnread[row.id] !== "removed")
          .forEach((row) => updateCount(state, row));
        state.items = state.items?.filter((row) => visible.has(row.id) || state.updatesDuringUnread[row.id] === "updated") ?? null;
        state.systemChats = (action.payload.systemChats || state.items?.filter((chat) => chat.systemKey) || [])
          .filter((chat) => state.updatesDuringUnread[chat.id] !== "removed");
        state.updatesDuringUnread = {};
        countTotal(state);
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
  const session = getCacheSession();
  const { user, chats } = getState();
  const ownerId = user.user?.id;
  if (!ownerId || chats.ownerId !== ownerId || chats.items === null || chats.unreadLoading) return;
  await dispatch(fetchUnread(ownerId));
  if (session === getCacheSession() && getState().chats.ownerId === ownerId && getState().chats.needsUnread) {
    void dispatch(refreshUnread());
  }
};

export const loadChats = ({ force = false, sync = false } = {}) => async (dispatch, getState) => {
  const session = getCacheSession();
  const { user, chats } = getState();
  const ownerId = user.user?.id;
  if (!ownerId) return;
  if (chats.loading || chats.loadingMore) {
    if (force) dispatch(chatsSlice.actions.queueReload(sync));
    return;
  }
  if (chats.loaded && !force) return;
  await dispatch(fetchChats({ ownerId, sync: sync || chats.syncNext || chats.items === null }));
  const current = getState().chats;
  if (current.ownerId !== ownerId || session !== getCacheSession()) return;
  if (current.queued) {
    void dispatch(loadChats({ force: true, sync: current.syncNext }));
  } else {
    void dispatch(refreshUnread());
  }
};

export const loadMoreChats = () => async (dispatch, getState) => {
  const session = getCacheSession();
  const { user, chats } = getState();
  const ownerId = user.user?.id;
  if (!ownerId || !chats.loaded || !chats.next || chats.loading || chats.loadingMore) return;
  await dispatch(fetchMoreChats({ ownerId, path: chats.next }));
  const current = getState().chats;
  if (session !== getCacheSession()) return;
  if (current.queued) void dispatch(loadChats({ force: true, sync: current.syncNext }));
  else if (current.needsUnread) void dispatch(refreshUnread());
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

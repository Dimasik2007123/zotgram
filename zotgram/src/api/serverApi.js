import { createApi } from "@reduxjs/toolkit/query/react";
import { api, allPages } from "./client";
import { createPeopleBatcher } from "./peopleBatcher";
import { getCacheSession } from "./cacheSession";
import { rememberOutboxFile, getOutboxFile, releaseOutboxFile } from "./outboxFiles";
import { sendingMessage, failedMessage, confirmedMessage,
  sendingComment, failedComment, confirmedComment } from "../store/outboxReducer";
import { receivedMessage, upsertChat, refreshUnread } from "../store/chatsReducer";
import { infinitePages, pagePath, pageRows } from "./pagination";

const requestPerson = createPeopleBatcher((ids, signal) =>
  api(`/api/core/users/batch/?ids=${ids.join(",")}`, { signal }),
);

const queryError = (error) => ({
  error: { status: error.status || "FETCH_ERROR", message: error.message },
});

const baseQuery = async ({ path, pages = false, ...options }, { signal }) => {
  try {
    const load = pages ? allPages : api;
    return { data: await load(path, { ...options, signal }) };
  } catch (error) {
    return queryError(error);
  }
};

export function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

export const serverApi = createApi({
  reducerPath: "serverApi",
  baseQuery,
  keepUnusedDataFor: 300,
  tagTypes: ["Person", "Chat", "Posts", "Directory", "ChatSearch", "Comments"],
  endpoints: (build) => ({
    getPosts: build.infiniteQuery(infinitePages((query) => pagePath("/api/core/posts/", query), "Posts")),
    getPost: build.query({
      query: (postId) => ({ path: `/api/core/posts/${postId}/` }),
      providesTags: ["Posts"],
    }),
    getUsers: build.infiniteQuery({
      ...infinitePages((query) => pagePath("/api/core/users/", new URLSearchParams({ q: query }).toString()), "Directory"),
      async onQueryStarted(_args, { dispatch, getState, queryFulfilled }) {
        const session = getCacheSession();
        try {
          const { data } = await queryFulfilled;
          if (session !== getCacheSession()) return;
          const missing = pageRows(data).filter((person) => {
            const cached = serverApi.endpoints.getPerson.select(String(person.id))(getState());
            return !cached.data && !cached.isLoading;
          });
          if (missing.length) dispatch(serverApi.util.upsertQueryEntries(missing.map((person) => ({
            endpointName: "getPerson", arg: String(person.id), value: person,
          }))));
        } catch { /* Загруженные страницы остаются доступны при ошибке. */ }
      },
    }),
    searchChats: build.infiniteQuery(infinitePages((query) =>
      pagePath("/api/chat/chats/", new URLSearchParams({ q: query }).toString()), "ChatSearch")),
    getComments: build.infiniteQuery({
      ...infinitePages((postId) => pagePath(`/api/core/posts/${postId}/comments/`), "Comments"),
      async onQueryStarted(postId, { dispatch, getState, queryFulfilled }) {
        const session = getCacheSession();
        try {
          const { data } = await queryFulfilled;
          if (session !== getCacheSession()) return;
          pageRows(data).forEach((comment) => {
            if (comment.userId !== getState().user.user?.id || !comment.attempt_id) return;
            if (getState().outbox.comments.some((item) => item.postId === postId && item.attempt_id === comment.attempt_id)) {
              dispatch(confirmedComment(comment.attempt_id));
            }
          });
          const count = data.pages.at(-1)?.commentsCount;
          if (Number.isFinite(count)) dispatch(updateCachedPost(postId, (post) => ({
            commentsCount: Math.max(post.commentsCount || 0, count),
          }), session));
        } catch { /* Сохраняем кэш и очередь при ошибке загрузки. */ }
      },
    }),
    addComment: build.mutation({
      query: ({ postId, text, attemptId }) => ({
        path: `/api/core/posts/${postId}/comments/`,
        method: "POST",
        body: { text, attempt_id: attemptId },
      }),
      async onQueryStarted({ postId, text, attemptId }, { dispatch, getState, requestId, queryFulfilled }) {
        const session = getCacheSession();
        const attempt = attemptId || requestId;
        const author = getState().user.user;
        dispatch(sendingComment({ id: `pending:${attempt}`, attempt_id: attempt, postId,
          userId: author.id, author, text, date: new Date().toISOString() }));
        try {
          const { data: comment } = await queryFulfilled;
          // Старый GET не должен затереть отправленный комментарий.
          await dispatch(serverApi.util.getRunningQueryThunk("getComments", postId));
          if (session !== getCacheSession()) return;
          dispatch(serverApi.util.updateQueryData("getComments", postId, (comments) => {
            // Сортировка выполняется при выводе; push сохраняет ссылки на прежние строки.
            if (!pageRows(comments).some((item) => item.id === comment.id)) comments.pages[0]?.results.push(comment);
          }));
          dispatch(confirmedComment(attempt));
          if (Number.isFinite(comment.commentsCount)) dispatch(updateCachedPost(postId, (post) => ({
            commentsCount: Math.max(post.commentsCount || 0, comment.commentsCount),
          }), session));
        } catch (error) {
          if (session !== getCacheSession()) return;
          dispatch(failedComment({ attemptId: attempt,
            message: error.error?.message || "Не удалось подтвердить отправку" }));
        }
      },
    }),
    getPerson: build.query({
      async queryFn(id, { signal }) {
        try {
          return { data: await requestPerson(id, signal) };
        } catch (error) {
          return queryError(error);
        }
      },
      providesTags: (_data, _error, id) => [{ type: "Person", id }],
    }),
    getChat: build.query({
      query: (chatId) => ({ path: `/api/chat/chats/${chatId}/` }),
      providesTags: (_data, _error, id) => [{ type: "Chat", id }],
      merge(current, incoming) {
        if (!current || !incoming) return incoming;
        const members = incoming.members.map((member) => ({
          ...member,
          lastReadSequence: Math.max(member.lastReadSequence || 0,
            current.members.find((entry) => entry.userId === member.userId)?.lastReadSequence || 0),
        }));
        if (current.lastSequence > incoming.lastSequence) {
          incoming = { ...incoming, lastSequence: current.lastSequence,
            lastMessage: current.lastMessage, updatedAt: current.updatedAt };
        }
        Object.assign(current, incoming, { members });
      },
    }),
    getMessages: build.query({
      async queryFn({ chatId, query = "" }, queryApi, _extra, load) {
        const cached = serverApi.endpoints.getMessages.select({ chatId, query })(queryApi.getState()).data;
        let after = cached ? (cached.syncedSequence ?? cached.rows.at(-1)?.sequence ?? 0) : null;
        const rows = [];
        let older;
        let syncedSequence = after ?? 0;
        do {
          const params = new URLSearchParams({ q: query });
          if (after !== null) params.set("after", after);
          const result = await load({ path: `/api/chat/chats/${chatId}/messages/?${params}` });
          if (result.error) return result;
          const page = result.data;
          rows.push(...page.results);
          syncedSequence = page.results.at(-1)?.sequence ?? syncedSequence;
          if (after === null) {
            older = page.has_more;
            break;
          }
          if (!page.has_more || !page.results.length) break;
          after = page.results.at(-1).sequence;
        } while (!queryApi.signal.aborted);
        return { data: { rows, older, syncedSequence } };
      },
      merge(current, incoming) {
        if (incoming.rows.length) current.rows = mergeMessages(current.rows, incoming.rows);
        if (incoming.older !== undefined) current.older = incoming.older;
        current.syncedSequence = Math.max(current.syncedSequence || 0, incoming.syncedSequence);
      },
      async onQueryStarted(_args, { dispatch, getState, queryFulfilled }) {
        const session = getCacheSession();
        try {
          const { data } = await queryFulfilled;
          if (session !== getCacheSession()) return;
          data.rows.forEach((message) => confirmOutboxMessage(message, dispatch, getState));
        } catch { /* При ошибке продолжаем показывать историю из кэша. */ }
      },
    }),
    sendMessage: build.mutation({
      query: ({ chatId, text, file, attemptId }) => {
        const body = new FormData();
        body.set("text", text);
        body.set("attempt_id", attemptId);
        if (file) body.set("file", file);
        return { path: `/api/chat/chats/${chatId}/messages/`, method: "POST", body };
      },
      async onQueryStarted(args, { dispatch, getState, queryFulfilled }) {
        const session = getCacheSession();
        dispatch(sendingMessage({
          id: `pending:${args.attemptId}`, attempt_id: args.attemptId,
          chatId: args.chatId, authorId: getState().user.user.id,
          content: args.text.trim(), createdAt: new Date().toISOString(),
          attachment: rememberOutboxFile(args.attemptId, args.file),
        }));
        try {
          const { data: message } = await queryFulfilled;
          if (session === getCacheSession()) dispatch(applyIncomingMessage(message));
        } catch (error) {
          if (session !== getCacheSession()) return;
          dispatch(failedMessage({ attemptId: args.attemptId,
            message: error.error?.message || "Не удалось подтвердить отправку" }));
        }
      },
    }),
    loadOlderMessages: build.mutation({
      async queryFn(args, queryApi, _extra, load) {
        // Дожидаемся текущей загрузки, чтобы правильно выбрать границу истории.
        await queryApi.dispatch(serverApi.util.getRunningQueryThunk("getMessages", args));
        if (queryApi.signal.aborted) return queryError(new Error("Aborted"));
        const cached = serverApi.endpoints.getMessages.select(args)(queryApi.getState()).data;
        const before = cached?.rows[0]?.sequence;
        if (!before || !cached.older) return { data: null };
        const params = new URLSearchParams({ q: args.query || "", before });
        const result = await load({ path: `/api/chat/chats/${args.chatId}/messages/?${params}` });
        if (result.error) return result;
        if (queryApi.signal.aborted) return queryError(new Error("Aborted"));
        queryApi.dispatch(serverApi.util.updateQueryData("getMessages", args, (history) => {
          history.rows = mergeMessages(history.rows, result.data.results);
          history.older = result.data.has_more;
        }));
        return { data: null };
      },
    }),
  }),
});

// После текущего запроса забираем сообщения, пропущенные за время его выполнения.
export const refreshMessages = (args) => async (dispatch, getState) => {
  const session = getCacheSession();
  await dispatch(serverApi.util.getRunningQueryThunk("getMessages", args));
  if (!getState().user.user?.id || session !== getCacheSession()) return;
  return dispatch(serverApi.endpoints.getMessages.initiate(args, {
    subscribe: false,
    forceRefetch: true,
  }));
};

function confirmOutboxMessage(message, dispatch, getState) {
  if (message.authorId !== getState().user.user?.id || !message.attempt_id) return;
  if (!getState().outbox.items.some((item) => item.attempt_id === message.attempt_id && item.chatId === message.chatId)) return;
  dispatch(confirmedMessage(message.attempt_id));
  releaseOutboxFile(message.attempt_id);
}

function patchHistory(args, message, dispatch, getState) {
  const cached = serverApi.endpoints.getMessages.select(args)(getState()).data;
  if (!cached || (args.query && !message.content.toLowerCase().includes(args.query.toLowerCase()))) return;
  const head = cached.syncedSequence ?? cached.rows.at(-1)?.sequence ?? 0;
  if (cached.rows.some((item) => item.id === message.id)) {
    if (!args.query && message.sequence > head + 1) void dispatch(refreshMessages(args));
    return;
  }
  dispatch(serverApi.util.updateQueryData("getMessages", args, (history) => {
    // Точечная вставка сохраняет ссылки на неизменившиеся сообщения.
    const index = history.rows.findIndex((row) => row.sequence > message.sequence);
    if (index < 0) history.rows.push(message);
    else history.rows.splice(index, 0, message);
    if (!args.query) {
      const sequences = new Set(history.rows.map((item) => item.sequence));
      history.syncedSequence = head;
      while (sequences.has(history.syncedSequence + 1)) history.syncedSequence++;
    }
  }));
  // Пропущенное сообщение нужно получить до продвижения курсора.
  if (!args.query && message.sequence > head + 1) void dispatch(refreshMessages(args));
}

export const refreshChat = (chatId, forceRefetch = true) => async (dispatch, getState) => {
  const session = getCacheSession();
  const result = await dispatch(serverApi.endpoints.getChat.initiate(chatId, { subscribe: false, forceRefetch }));
  if (session === getCacheSession() && result.data && !result.error) {
    dispatch(upsertChat(result.data));
    if (getState().chats.needsUnread) void dispatch(refreshUnread());
  }
  return result;
};

function patchChatSummary(message, dispatch) {
  dispatch(serverApi.util.updateQueryData("getChat", message.chatId, (chat) => {
    if (chat && message.sequence > chat.lastSequence) {
      chat.lastSequence = message.sequence;
      chat.lastMessage = message;
      chat.updatedAt = message.createdAt;
    }
  }));
}

export const applyIncomingMessage = (message) => (dispatch, getState) => {
  if (!message?.id || !message.chatId || !Number.isSafeInteger(message.sequence) || message.sequence < 1) return;
  if (!getState().user.user?.id) return;
  const session = getCacheSession();
  confirmOutboxMessage(message, dispatch, getState);
  const known = getState().chats.items?.some((chat) => chat.id === message.chatId);
  dispatch(receivedMessage(message));
  if (!known) void dispatch(refreshChat(message.chatId, false)).then(() => {
    if (session !== getCacheSession()) return;
    dispatch(receivedMessage(message));
    patchChatSummary(message, dispatch);
    if (getState().chats.needsUnread) void dispatch(refreshUnread());
  });
  if (getState().chats.needsUnread) void dispatch(refreshUnread());
  patchChatSummary(message, dispatch);
  const chatRequest = dispatch(serverApi.util.getRunningQueryThunk("getChat", message.chatId));
  chatRequest?.then(() => {
    if (session === getCacheSession()) patchChatSummary(message, dispatch);
  });
  const args = serverApi.util.selectCachedArgsForQuery(getState(), "getMessages")
    .filter((item) => item.chatId === message.chatId);
  for (const item of args) {
    const cached = serverApi.endpoints.getMessages.select(item)(getState());
    if (cached.data) patchHistory(item, message, dispatch, getState);
    else {
      const running = dispatch(serverApi.util.getRunningQueryThunk("getMessages", item));
      running?.then(() => {
        if (session === getCacheSession()) patchHistory(item, message, dispatch, getState);
      });
    }
  }
};

export const applyReadToCache = (event) => (dispatch) => {
  dispatch(serverApi.util.updateQueryData("getChat", event.chat_id, (chat) => {
    const member = chat?.members.find((item) => item.userId === event.user_id);
    if (member) member.lastReadSequence = Math.max(member.lastReadSequence || 0, event.sequence);
  }));
  const running = dispatch(serverApi.util.getRunningQueryThunk("getChat", event.chat_id));
  const session = getCacheSession();
  running?.then(() => {
    if (session !== getCacheSession()) return;
    dispatch(serverApi.util.updateQueryData("getChat", event.chat_id, (chat) => {
      const member = chat?.members.find((item) => item.userId === event.user_id);
      if (member) member.lastReadSequence = Math.max(member.lastReadSequence || 0, event.sequence);
    }));
  });
};

export const submitMessage = (args) => (dispatch) => {
  const request = dispatch(serverApi.endpoints.sendMessage.initiate(args));
  void request.then(() => request.reset());
  return request;
};

export const retryMessage = (attemptId) => (dispatch, getState) => {
  const message = getState().outbox.items.find((item) => item.attempt_id === attemptId);
  if (!message || message.delivery !== "failed") return;
  return dispatch(submitMessage({ chatId: message.chatId, text: message.content,
    attemptId, file: getOutboxFile(attemptId) }));
};

export const updateCachedPost = (postId, update, session = getCacheSession()) => (dispatch, getState) => {
  if (session !== getCacheSession()) return;
  for (const args of serverApi.util.selectCachedArgsForQuery(getState(), "getPosts")) {
    dispatch(serverApi.util.updateQueryData("getPosts", args, (data) => {
      for (const page of data.pages) {
        const post = page.results.find((row) => row.id === postId);
        if (post) Object.assign(post, typeof update === "function" ? update(post) : update);
      }
    }));
  }
  dispatch(serverApi.util.updateQueryData("getPost", postId, (post) => {
    Object.assign(post, typeof update === "function" ? update(post) : update);
  }));
};

export const submitComment = ({ postId, text, attemptId = crypto.randomUUID() }) => (dispatch) => {
  const request = dispatch(serverApi.endpoints.addComment.initiate({ postId, text, attemptId }));
  void request.then(() => request.reset());
  return request;
};

export const retryComment = (attemptId) => (dispatch, getState) => {
  const comment = getState().outbox.comments.find((item) => item.attempt_id === attemptId);
  if (!comment || comment.delivery !== "failed") return;
  return dispatch(submitComment({ postId: comment.postId, text: comment.text, attemptId }));
};

import { createApi } from "@reduxjs/toolkit/query/react";
import { api, allPages } from "./client";
import { createPeopleBatcher } from "./peopleBatcher";

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
  tagTypes: ["Person", "Chat"],
  endpoints: (build) => ({
    getComments: build.query({
      query: (postId) => ({ path: `/api/core/posts/${postId}/comments/`, pages: true }),
    }),
    addComment: build.mutation({
      query: ({ postId, text }) => ({
        path: `/api/core/posts/${postId}/comments/`,
        method: "POST",
        body: { text },
      }),
      async onQueryStarted({ postId }, { dispatch, getState, requestId, queryFulfilled }) {
        try {
          const { data: comment } = await queryFulfilled;
          // A response from an earlier GET must not overwrite the new comment.
          await dispatch(serverApi.util.getRunningQueryThunk("getComments", postId));
          if (!getState()[serverApi.reducerPath].mutations[requestId]) return;
          dispatch(serverApi.util.updateQueryData("getComments", postId, (comments) => {
            if (!comments.some((item) => item.id === comment.id)) comments.push(comment);
          }));
        } catch {
          // The mutation exposes the error to the form; cached comments stay intact.
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
    }),
    getMessages: build.query({
      async queryFn({ chatId, query = "" }, queryApi, _extra, load) {
        const cached = serverApi.endpoints.getMessages.select({ chatId, query })(queryApi.getState()).data;
        let after = cached && !query ? (cached.rows.at(-1)?.sequence ?? 0) : null;
        const rows = [];
        let older;
        do {
          const params = new URLSearchParams({ q: query });
          if (after !== null) params.set("after", after);
          const result = await load({ path: `/api/chat/chats/${chatId}/messages/?${params}` });
          if (result.error) return result;
          const page = result.data;
          rows.push(...page.results);
          if (after === null) {
            older = page.has_more;
            break;
          }
          if (!page.has_more || !page.results.length) break;
          after = page.results.at(-1).sequence;
        } while (!queryApi.signal.aborted);
        return { data: { rows, older } };
      },
      merge(current, incoming, { arg }) {
        if (arg.query) current.rows = incoming.rows;
        else if (incoming.rows.length) current.rows = mergeMessages(current.rows, incoming.rows);
        if (incoming.older !== undefined) current.older = incoming.older;
      },
    }),
    loadOlderMessages: build.mutation({
      async queryFn(args, queryApi, _extra, load) {
        // Wait for initial load / delta sync before choosing the oldest sequence.
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

// Events arriving during a request get one more delta sync after it completes.
export const refreshMessages = (args) => async (dispatch, getState) => {
  const owner = getState().user.user?.id;
  await dispatch(serverApi.util.getRunningQueryThunk("getMessages", args));
  if (!owner || getState().user.user?.id !== owner) return;
  return dispatch(serverApi.endpoints.getMessages.initiate(args, {
    subscribe: false,
    forceRefetch: true,
  }));
};

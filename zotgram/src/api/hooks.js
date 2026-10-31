import statusText from "../utils/statusText";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { allPages } from "./client";
import { useDispatch, useSelector } from "react-redux";
import { loadChats, loadMoreChats } from "../store/chatsReducer";
import { createSelector } from "@reduxjs/toolkit";
import { serverApi, refreshMessages } from "./serverApi";
import { getPrivateFile, subscribePrivateFile } from "./privateFiles";
import { pageRows } from "./pagination";

export function useChats() {
  const dispatch = useDispatch();
  const userId = useSelector((state) => state.user.user?.id);
  const chats = useSelector((state) => state.chats);
  useEffect(() => {
    if (userId) void dispatch(loadChats());
  }, [dispatch, userId]);
  const reload = useCallback(() => dispatch(loadChats({ force: true, sync: true })), [dispatch]);
  const loadMore = useCallback(() => dispatch(loadMoreChats()), [dispatch]);
  return {
    data: chats.ownerId === userId ? chats.items : null,
    loading: chats.items === null && (chats.loading || !chats.error),
    error: chats.error,
    reload,
    hasMore: Boolean(chats.next),
    loadingMore: chats.loadingMore,
    moreError: chats.moreError,
    loadMore,
    unreadCount: chats.unreadCount,
    unreadCounts: chats.unreadCounts,
    systemChats: chats.systemChats,
  };
}

function usePageResults(state, comments = false) {
  const denied = accessDenied(state.error);
  const data = useMemo(() => {
    const rows = pageRows(state.currentData);
    if (comments) rows.sort((a, b) => (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id)));
    return rows;
  }, [state.currentData, comments]);
  return {
    data: denied ? [] : data,
    loading: state.isLoading,
    error: !state.currentData || denied ? (state.error?.message || "") : "",
    moreError: state.currentData && !denied ? (state.error?.message || "") : "",
    hasMore: !denied && Boolean(state.hasNextPage),
    loadingMore: state.isFetching,
    loadMore: () => { if (!state.isFetching) void state.fetchNextPage(); },
    reload: state.refetch,
    retryMore: state.isFetchNextPageError ? state.fetchNextPage : state.refetch,
  };
}

export function usePosts(query = "") {
  return usePageResults(serverApi.useGetPostsInfiniteQuery(query, { refetchOnMountOrArgChange: 60 }));
}

export function useDirectory(query = "", enabled = true) {
  return usePageResults(serverApi.useGetUsersInfiniteQuery(query, { skip: !enabled, refetchOnMountOrArgChange: 300 }));
}

export function useChatSearch(query) {
  return usePageResults(serverApi.useSearchChatsInfiniteQuery(query, { skip: !query, refetchOnMountOrArgChange: 30 }));
}

export function useComments(postId) {
  return usePageResults(serverApi.useGetCommentsInfiniteQuery(postId, { refetchOnMountOrArgChange: 60 }), true);
}

export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useQuery(loader, key, topics = "") {
  const latest = useRef(loader);
  // Метка меняется вместе с ключом, чтобы не показывать данные старого запроса.
  const request = useMemo(() => ({ key }), [key]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({
    request: null,
    version: -1,
    data: null,
    error: "",
  });
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    latest.current = loader;
  }, [loader]);
  useEffect(() => {
    const handle = (event) => {
      if (topics.split(" ").includes(event.detail.topic)) reload();
    };
    window.addEventListener("zotgram:changed", handle);
    return () => window.removeEventListener("zotgram:changed", handle);
  }, [topics, reload]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await latest.current();
        if (active) setState({ request, version, data, error: "" });
      } catch (error) {
        if (active)
          setState((previous) => ({
            request,
            version,
            data: previous.request === request ? previous.data : null,
            error: statusText(error.message),
          }));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [request, version]);
  const sameRequest = state.request === request;
  const settled = sameRequest && state.version === version;
  return {
    data: sameRequest ? state.data : null,
    loading: !settled && (!sameRequest || state.data === null),
    error: settled ? state.error : "",
    reload,
  };
}

export function usePeople(ids) {
  const dispatch = useDispatch();
  const owner = useSelector((state) => state.user.user?.id);
  const key = [...new Set(ids.filter(Boolean).map(String))].sort().join(",");
  const list = useMemo(() => key ? key.split(",") : [], [key]);
  const selectPeople = useMemo(() => createSelector(
    list.length
      ? list.map((id) => serverApi.endpoints.getPerson.select(id))
      : [() => null],
    (...results) => {
      const queries = results.filter(Boolean);
      return {
        data: queries.flatMap((result) => result.data && !accessDenied(result.error) ? [result.data] : []),
        loading: queries.some((result) => !result.data && !result.isError),
        error: queries.find((result) => result.error)?.error?.message || "",
      };
    },
  ), [list]);
  const state = useSelector(selectPeople);
  useEffect(() => {
    if (!owner) return;
    const requests = list.map((id) => dispatch(serverApi.endpoints.getPerson.initiate(id, {
      forceRefetch: 300,
    })));
    return () => requests.forEach((request) => request.unsubscribe());
  }, [dispatch, list, owner]);
  const reload = useCallback(() => {
    dispatch(serverApi.util.invalidateTags(list.map((id) => ({ type: "Person", id }))));
  }, [dispatch, list]);
  return { ...state, reload };
}

export function usePrivateFile(url) {
  return useSyncExternalStore(
    useCallback((listener) => subscribePrivateFile(url, listener), [url]),
    useCallback(() => getPrivateFile(url), [url]),
    () => "",
  );
}

const accessDenied = (error) => [401, 403, 404].includes(error?.status);

export function useChat(chatId) {
  const state = serverApi.useGetChatQuery(chatId, { refetchOnMountOrArgChange: 30 });
  return {
    data: accessDenied(state.error) ? null : state.currentData,
    loading: state.isLoading,
    error: state.error?.message || "",
    reload: state.refetch,
  };
}

export function useMessages(chatId, query = "") {
  const dispatch = useDispatch();
  const args = useMemo(() => ({ chatId, query }), [chatId, query]);
  const state = serverApi.useGetMessagesQuery(args, { refetchOnMountOrArgChange: true });
  const [loadOlder, olderState] = serverApi.useLoadOlderMessagesMutation();
  const outbox = useSelector((state) => state.outbox.items);
  useEffect(() => {
    const handle = ({ detail: { topic, event } }) => {
      if (topic === "messages" && event?.type !== "message.created" &&
          (!event?.chat_id || event.chat_id === chatId)) {
        void dispatch(refreshMessages(args));
      }
    };
    window.addEventListener("zotgram:changed", handle);
    return () => window.removeEventListener("zotgram:changed", handle);
  }, [dispatch, args, chatId]);
  const denied = accessDenied(state.error) || accessDenied(olderState.error);
  const rows = useMemo(() => [
    ...(state.currentData?.rows || []),
    ...outbox.filter((item) => item.chatId === chatId &&
      (!query || item.content.toLowerCase().includes(query.toLowerCase()))),
  ], [state.currentData?.rows, outbox, chatId, query]);
  return {
    rows: denied ? [] : rows,
    latestSequence: denied ? 0 : (state.currentData?.syncedSequence || 0),
    older: !denied && Boolean(state.currentData?.older),
    error: state.error?.message || olderState.error?.message || "",
    loading: state.isLoading,
    loadingOlder: olderState.isLoading,
    reload: () => {
      olderState.reset();
      return dispatch(refreshMessages(args));
    },
    loadOlder: () => {
      if (!olderState.isLoading) void loadOlder(args);
    },
  };
}

export { allPages };

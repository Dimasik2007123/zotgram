import statusText from "../utils/statusText";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { allPages } from "./client";
import { useDispatch, useSelector } from "react-redux";
import { loadChats } from "../store/chatsReducer";
import { createSelector } from "@reduxjs/toolkit";
import { serverApi, refreshMessages } from "./serverApi";
import { getPrivateFile, subscribePrivateFile } from "./privateFiles";

export function useChats() {
  const dispatch = useDispatch();
  const userId = useSelector((state) => state.user.user?.id);
  const chats = useSelector((state) => state.chats);
  useEffect(() => {
    if (userId) void dispatch(loadChats());
  }, [dispatch, userId]);
  const reload = useCallback(() => dispatch(loadChats({ force: true, sync: true })), [dispatch]);
  return {
    data: chats.ownerId === userId ? chats.items : null,
    loading: chats.items === null && (chats.loading || !chats.error),
    error: chats.error,
    reload,
  };
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
  useEffect(() => {
    const handle = ({ detail: { topic, event } }) => {
      if (topic === "messages" && (!event?.chat_id || event.chat_id === chatId)) {
        void dispatch(refreshMessages(args));
      }
    };
    window.addEventListener("zotgram:changed", handle);
    return () => window.removeEventListener("zotgram:changed", handle);
  }, [dispatch, args, chatId]);
  const denied = accessDenied(state.error) || accessDenied(olderState.error);
  return {
    rows: denied ? [] : (state.currentData?.rows || []),
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

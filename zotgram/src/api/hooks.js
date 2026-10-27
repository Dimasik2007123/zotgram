import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, allPages } from "./client";

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
            error: error.message,
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
  // Загрузка вычисляется из запроса и результата, отдельный setLoading не нужен.
  return {
    data: sameRequest ? state.data : null,
    loading: !settled && (!sameRequest || state.data === null),
    error: settled ? state.error : "",
    reload,
  };
}

export function usePeople(ids) {
  const key = [...new Set(ids.filter(Boolean).map(String))].sort().join(",");
  return useQuery(
    async () => {
      const list = key ? key.split(",") : [];
      const rows = [];
      for (let offset = 0; offset < list.length; offset += 100) {
        rows.push(
          ...(await api(
            `/api/core/users/batch/?ids=${list.slice(offset, offset + 100).join(",")}`,
          )),
        );
      }
      return rows;
    },
    key,
    "profiles",
  );
}

export function usePrivateFile(url) {
  // При смене адреса прежняя Blob-ссылка сразу скрывается.
  const request = useMemo(() => ({ url }), [url]);
  const [state, setState] = useState({ request: null, value: "" });
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (request.url)
      api(request.url, { blob: true })
        .then((blob) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setState({ request, value: objectUrl });
        })
        .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [request]);
  return state.request === request ? state.value : "";
}

export function useMessages(chatId, query = "") {
  const request = useMemo(() => ({ chatId, query }), [chatId, query]);
  const [state, setState] = useState({
    request: null,
    rows: [],
    older: false,
    error: "",
    loading: true,
  });
  const reloadRef = useRef(null);
  useEffect(() => {
    const { chatId, query } = request;
    let active = true,
      running = false,
      queued = false,
      initialized = false;
    let current = [];
    const update = (patch) => {
      if (!active) return;
      setState((previous) => ({
        ...(previous.request === request
          ? previous
          : { request, rows: [], older: false, error: "", loading: true }),
        ...patch,
      }));
    };
    const merge = (next) => {
      const map = new Map(current.map((row) => [row.id, row]));
      next.forEach((row) => map.set(row.id, row));
      current = [...map.values()].sort((a, b) => a.sequence - b.sequence);
      update({ rows: current });
    };
    const fetchRows = async (before) => {
      if (!active) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        let after =
          initialized && !before && !query
            ? (current.at(-1)?.sequence ?? 0)
            : null;
        do {
          const params = new URLSearchParams({ q: query });
          if (before) params.set("before", before);
          if (after !== null) params.set("after", after);
          const page = await api(
            `/api/chat/chats/${chatId}/messages/?${params}`,
          );
          if (!active) return;
          if (query && !before) current = [];
          merge(page.results);
          if (after === null) {
            update({ older: page.has_more });
            break;
          }
          if (!page.has_more || !page.results.length) break;
          after = page.results.at(-1).sequence;
        } while (active);
        initialized = true;
        update({ error: "" });
      } catch (err) {
        update({ error: err.message });
      } finally {
        running = false;
        if (active) {
          update({ loading: false });
          if (queued) {
            queued = false;
            void fetchRows();
          }
        }
      }
    };
    reloadRef.current = {
      reload: () => fetchRows(),
      loadOlder: () => fetchRows(current[0]?.sequence),
    };
    const event = (e) => {
      if (e.detail.topic === "messages") void fetchRows();
    };
    window.addEventListener("zotgram:changed", event);
    void fetchRows();
    return () => {
      active = false;
      reloadRef.current = null;
      window.removeEventListener("zotgram:changed", event);
    };
  }, [request]);
  const sameRequest = state.request === request;
  return {
    rows: sameRequest ? state.rows : [],
    older: sameRequest ? state.older : false,
    error: sameRequest ? state.error : "",
    loading: sameRequest ? state.loading : true,
    reload: () => reloadRef.current?.reload(),
    loadOlder: () => reloadRef.current?.loadOlder(),
  };
}

export { allPages };

export function nextApiPath(next) {
  if (!next) return null;
  const url = new URL(next, "http://localhost");
  if (!url.pathname.startsWith("/api/")) throw new Error("Неверный адрес следующей страницы");
  return url.pathname + url.search;
}

export function pagePath(path, query = "") {
  const params = new URLSearchParams(query);
  params.delete("page");
  params.delete("cursor");
  params.set("page_size", "20");
  return `${path}?${params}`;
}

export function pageRows(data) {
  const rows = new Map();
  data?.pages.forEach((page) => page.results.forEach((row) => rows.set(row.id, row)));
  return [...rows.values()];
}

export const infinitePages = (initialPath, tag) => ({
  infiniteQueryOptions: {
    initialPageParam: null,
    getNextPageParam: (lastPage) => nextApiPath(lastPage.next) || undefined,
  },
  query: ({ queryArg, pageParam }) => ({ path: pageParam || initialPath(queryArg) }),
  providesTags: [tag],
});

import { getAccess, readResponse, refreshAccess } from "./session";

export async function api(path, options = {}) {
  if (!path.startsWith("/")) throw new Error("Path must start with /");
  const { body, blob = false, ...rest } = options;
  const attempt = async (retry = true) => {
    const headers = new Headers(rest.headers);
    if (getAccess()) headers.set("Authorization", `Bearer ${getAccess()}`);
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm)
      headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
      ...rest,
      headers,
      credentials: "same-origin",
      body:
        body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    if (response.status === 401 && retry) {
      await refreshAccess();
      return attempt(false);
    }
    if (blob && response.ok) return response.blob();
    return readResponse(response);
  };
  return attempt(true);
}

export async function allPages(path, options = {}) {
  let url = path;
  const rows = [];
  while (url) {
    const page = await api(url, options);
    rows.push(...page.results);
    const next = page.next && new URL(page.next, location.origin);
    url = next ? next.pathname + next.search : null;
  }
  return rows;
}

export const queryString = (values) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== "" && value != null) params.set(key, value);
  });
  return params.toString();
};

export const changed = (topic, event = null) =>
  window.dispatchEvent(
    new CustomEvent("zotgram:changed", { detail: { topic, event } }),
  );

let access = null;
let refreshPromise = null;
let csrfPromise = null;
const authListeners = new Set();
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("zotgram-auth")
    : null;

export const getAccess = () => access;
export const setAccess = (value) => {
  access = value;
};
export function onSessionEnd(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}
function endLocal() {
  access = null;
  authListeners.forEach((listener) => listener());
}
channel?.addEventListener("message", (event) => {
  if (event.data === "logout") endLocal();
});

export async function readResponse(response) {
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.detail || (data ? JSON.stringify(data) : `HTTP ${response.status}`),
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

export function csrfToken() {
  if (!csrfPromise)
    csrfPromise = fetch("/api/core/auth/csrf/", { credentials: "same-origin" })
      .then(readResponse)
      .then((data) => data.csrfToken)
      .catch((error) => {
        csrfPromise = null;
        throw error;
      });
  return csrfPromise;
}

export async function authPost(path, body = {}) {
  const response = await fetch(`/api/core/auth/${path}/`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": await csrfToken(),
    },
    body: JSON.stringify(body),
  });
  return readResponse(response);
}

export function refreshAccess() {
  if (!refreshPromise) {
    const refresh = async () => {
      try {
        const data = await authPost("refresh");
        access = data.access;
        return access;
      } catch (error) {
        endLocal();
        throw error;
      }
    };
    // Web Locks сериализует ротацию cookie между вкладками одного origin.
    refreshPromise = (
      navigator.locks
        ? navigator.locks.request("zotgram-refresh", refresh)
        : refresh()
    ).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function logoutSession() {
  await authPost("logout");
  endLocal();
  channel?.postMessage("logout");
}

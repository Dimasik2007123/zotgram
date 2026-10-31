import assert from "node:assert/strict";
import { test, beforeEach, afterEach, after } from "node:test";
import { createServer } from "vite";

// Vite resolves the application's extensionless imports without another test dependency.
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null },
  ssr: { external: ["react", "react-dom", "react-redux", "@reduxjs/toolkit", "@reduxjs/toolkit/query/react"] },
  logLevel: "error",
});
const originalFetch = globalThis.fetch;
const originalChannel = globalThis.BroadcastChannel;
globalThis.BroadcastChannel = undefined;
const { serverApi, refreshMessages } = await vite.ssrLoadModule("/src/api/serverApi.js");
const { store } = await vite.ssrLoadModule("/src/store/index.js");
const { login, logout } = await vite.ssrLoadModule("/src/store/userReducer.js");
const { setAccess } = await vite.ssrLoadModule("/src/api/session.js");
const { subscribePrivateFile, getPrivateFile, chatAvatarUrl } = await vite.ssrLoadModule("/src/api/privateFiles.js");

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const waitFor = async (condition) => {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for cache update");
};
const query = (name, args, options = {}) => store.dispatch(
  serverApi.endpoints[name].initiate(args, { subscribe: false, ...options }),
);
const cached = (name, args) => serverApi.endpoints[name].select(args)(store.getState());
const historyArgs = { chatId: "chat-a", query: "" };
const message = (sequence) => ({ id: `message-${sequence}`, sequence, content: `Text ${sequence}` });

beforeEach(() => {
  setAccess("test-access");
  store.dispatch(login({ id: "owner-a" }));
  globalThis.fetch = () => { throw new Error("Unexpected network request"); };
});
afterEach(() => store.dispatch(logout()));
after(async () => {
  globalThis.fetch = originalFetch;
  globalThis.BroadcastChannel = originalChannel;
  await vite.close();
});

test("comments share in-flight requests and survive close/reopen; posts stay separate", async () => {
  const requests = [];
  globalThis.fetch = async (path) => {
    requests.push(path);
    return json({ results: [{ id: path }], next: null });
  };
  const first = query("getComments", "post-a", { subscribe: true });
  const second = query("getComments", "post-a", { subscribe: true });
  await Promise.all([first, second]);
  first.unsubscribe();
  second.unsubscribe();
  await query("getComments", "post-a");
  assert.equal(requests.length, 1);
  await query("getComments", "post-b");
  assert.equal(requests.length, 2);
  assert.notDeepEqual(cached("getComments", "post-a").data, cached("getComments", "post-b").data);
});

test("adding a comment uses the POST response without reloading the list", async () => {
  const requests = [];
  globalThis.fetch = async (_path, options) => {
    requests.push(options.method || "GET");
    return options.method === "POST"
      ? json({ id: "new-comment", text: "Hello" }, 201)
      : json({ results: [{ id: "old-comment" }], next: null });
  };
  await query("getComments", "post-a");
  await query("addComment", { postId: "post-a", text: "Hello" }).unwrap();
  await waitFor(() => cached("getComments", "post-a").data.length === 2);
  assert.deepEqual(requests, ["GET", "POST"]);
});

test("an overlapping GET cannot overwrite a newly submitted comment", async () => {
  const response = deferred();
  globalThis.fetch = async (_path, options) => options.method === "POST"
    ? json({ id: "new-comment" }, 201) : response.promise;
  const initial = query("getComments", "post-a");
  await query("addComment", { postId: "post-a", text: "Hello" }).unwrap();
  response.resolve(json({ results: [{ id: "old-comment" }], next: null }));
  await initial;
  await waitFor(() => cached("getComments", "post-a").data.length === 2);
  assert.deepEqual(cached("getComments", "post-a").data.map((item) => item.id), ["old-comment", "new-comment"]);
});

test("failed comment submissions preserve the existing list", async () => {
  globalThis.fetch = async (_path, options) => options.method === "POST"
    ? json({ detail: "Unavailable" }, 503)
    : json({ results: [{ id: "existing" }], next: null });
  await query("getComments", "post-a");
  await assert.rejects(query("addComment", { postId: "post-a", text: "Hello" }).unwrap());
  assert.deepEqual(cached("getComments", "post-a").data, [{ id: "existing" }]);
});

test("people are batched across consumers, deduplicated by ID, and limited to 100 per request", async () => {
  const batches = [];
  globalThis.fetch = async (path) => {
    const ids = new URL(path, "http://localhost").searchParams.get("ids").split(",");
    batches.push(ids);
    return json(ids.map((id) => ({ id, name: `Person ${id}` })));
  };
  const requests = Array.from({ length: 150 }, (_, index) => query("getPerson", String(index)));
  requests.push(query("getPerson", "1"));
  await Promise.all(requests);
  await query("getPerson", "1");
  assert.equal(batches.length, 2);
  assert.ok(batches.every((ids) => ids.length <= 100));
  assert.equal(batches.flat().filter((id) => id === "1").length, 1);
  assert.equal(cached("getPerson", "1").data.name, "Person 1");
});

test("profile changes invalidate shared user entries", async () => {
  let count = 0;
  globalThis.fetch = async () => json([{ id: "person", name: `Version ${++count}` }]);
  const request = query("getPerson", "person", { subscribe: true });
  await request;
  store.dispatch(serverApi.util.invalidateTags(["Person"]));
  await waitFor(() => cached("getPerson", "person").data?.name === "Version 2");
  request.unsubscribe();
});

test("reopening a chat retains older history and fetches only missing messages", async () => {
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    const params = new URL(path, "http://localhost").searchParams;
    if (params.has("before")) return json({ results: [message(1), message(2)], has_more: false });
    if (params.has("after")) return json({ results: [message(4)], has_more: false });
    return json({ results: [message(3)], has_more: true });
  };
  const first = query("getMessages", historyArgs, { subscribe: true });
  await first;
  await query("loadOlderMessages", historyArgs).unwrap();
  first.unsubscribe();
  const reopened = query("getMessages", historyArgs, { forceRefetch: true });
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2, 3]);
  await reopened;
  assert.ok(paths.at(-1).includes("after=3"));
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2, 3, 4]);
  assert.equal(cached("getMessages", historyArgs).data.older, false);
});

test("delta sync follows all missed pages without duplicates", async () => {
  globalThis.fetch = async () => json({ results: [message(1)], has_more: false });
  await query("getMessages", historyArgs);
  const afterValues = [];
  globalThis.fetch = async (path) => {
    const after = new URL(path, "http://localhost").searchParams.get("after");
    afterValues.push(after);
    return json({ results: after === "1" ? [message(2)] : [message(3)], has_more: after === "1" });
  };
  await query("getMessages", historyArgs, { forceRefetch: true });
  assert.deepEqual(afterValues, ["1", "2"]);
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2, 3]);
});

test("empty background sync preserves the existing message array", async () => {
  globalThis.fetch = async () => json({ results: [message(1)], has_more: false });
  await query("getMessages", historyArgs);
  const rows = cached("getMessages", historyArgs).data.rows;
  globalThis.fetch = async () => json({ results: [], has_more: false });
  await query("getMessages", historyArgs, { forceRefetch: true });
  assert.equal(cached("getMessages", historyArgs).data.rows, rows);
});

test("events received during initial loading trigger a follow-up delta sync", async () => {
  const response = deferred();
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return path.includes("after=")
      ? json({ results: [message(2)], has_more: false }) : response.promise;
  };
  const initial = query("getMessages", historyArgs);
  const refresh = store.dispatch(refreshMessages(historyArgs));
  response.resolve(json({ results: [message(1)], has_more: false }));
  await Promise.all([initial, refresh]);
  assert.equal(paths.length, 2);
  assert.ok(paths[1].includes("after=1"));
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2]);
});

test("older-history loading and incoming-message sync cannot overwrite one another", async () => {
  globalThis.fetch = async () => json({ results: [message(3)], has_more: true });
  await query("getMessages", historyArgs);
  const olderResponse = deferred();
  let olderStarted = false;
  globalThis.fetch = async (path) => {
    if (path.includes("before=")) { olderStarted = true; return olderResponse.promise; }
    return json({ results: [message(4)], has_more: false });
  };
  const older = query("loadOlderMessages", historyArgs);
  await waitFor(() => olderStarted);
  await query("getMessages", historyArgs, { forceRefetch: true });
  olderResponse.resolve(json({ results: [message(1), message(2), message(3)], has_more: false }));
  await older;
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2, 3, 4]);
});

test("searches and chats have separate history entries; network failures retain cached history", async () => {
  globalThis.fetch = async (path) => json({ results: [{ ...message(1), content: path }], has_more: false });
  await query("getMessages", historyArgs);
  const searchArgs = { ...historyArgs, query: "hello" };
  const otherArgs = { chatId: "chat-b", query: "" };
  await query("getMessages", searchArgs);
  await query("getMessages", otherArgs);
  assert.notEqual(cached("getMessages", historyArgs).data.rows[0].content, cached("getMessages", searchArgs).data.rows[0].content);
  assert.notEqual(cached("getMessages", historyArgs).data.rows[0].content, cached("getMessages", otherArgs).data.rows[0].content);
  globalThis.fetch = async () => json({ detail: "Unavailable" }, 503);
  await query("getMessages", historyArgs, { forceRefetch: true });
  assert.equal(cached("getMessages", historyArgs).error.status, 503);
  assert.equal(cached("getMessages", historyArgs).data.rows.length, 1);
});

test("private files share downloads and Blob URLs across mounts, then are revoked on logout", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(new Blob(["avatar"])); };
  const first = subscribePrivateFile("/avatar", () => {});
  const second = subscribePrivateFile("/avatar", () => {});
  await waitFor(() => Boolean(getPrivateFile("/avatar")));
  const url = getPrivateFile("/avatar");
  first();
  second();
  const third = subscribePrivateFile("/avatar", () => {});
  assert.equal(getPrivateFile("/avatar"), url);
  assert.equal(requests, 1);
  third();
  store.dispatch(logout());
  assert.equal(getPrivateFile("/avatar"), "");
  await assert.rejects(originalFetch(url));
});

test("avatar versions change only with the uploaded image", () => {
  const chat = { avatar: "/avatar", avatarVersion: "upload-a", updatedAt: "before" };
  assert.equal(chatAvatarUrl(chat), chatAvatarUrl({ ...chat, updatedAt: "after" }));
  assert.notEqual(chatAvatarUrl(chat), chatAvatarUrl({ ...chat, avatarVersion: "upload-b" }));
});

test("failed private downloads can retry without losing existing subscribers", async () => {
  let requests = 0;
  let notifications = 0;
  globalThis.fetch = async () => ++requests === 1
    ? json({ detail: "Unavailable" }, 503) : new Response(new Blob(["avatar"]));
  const first = subscribePrivateFile("/avatar", () => { notifications++; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = subscribePrivateFile("/avatar", () => { notifications++; });
  await waitFor(() => Boolean(getPrivateFile("/avatar")));
  assert.equal(requests, 2);
  assert.equal(notifications, 2);
  first();
  second();
});

test("idle private files are evicted when the entry limit is exceeded", async () => {
  globalThis.fetch = async () => new Response(new Blob(["small image"]));
  const releases = Array.from({ length: 101 }, (_, index) =>
    subscribePrivateFile(`/avatar-${index}`, () => {}));
  await waitFor(() => releases.every((_release, index) => getPrivateFile(`/avatar-${index}`)));
  const firstUrl = getPrivateFile("/avatar-0");
  releases[0]();
  assert.equal(getPrivateFile("/avatar-0"), "");
  await assert.rejects(originalFetch(firstUrl));
  releases.slice(1).forEach((release) => release());
});

test("logout cancels batched profile HTTP requests as well as their cache entries", async () => {
  const response = deferred();
  let signal;
  globalThis.fetch = (_path, options) => { signal = options.signal; return response.promise; };
  const request = query("getPerson", "person");
  await waitFor(() => Boolean(signal));
  store.dispatch(logout());
  assert.equal(signal.aborted, true);
  response.resolve(json([{ id: "person", name: "Old account" }]));
  await request;
  assert.equal(cached("getPerson", "person").data, undefined);
});

test("logout aborts in-flight work and late responses cannot populate the next account", async () => {
  const response = deferred();
  globalThis.fetch = () => response.promise;
  const request = query("getComments", "private-post");
  store.dispatch(logout());
  store.dispatch(login({ id: "owner-b" }));
  response.resolve(json({ results: [{ id: "private-comment" }], next: null }));
  await request;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(cached("getComments", "private-post").data, undefined);
  assert.equal(Object.keys(store.getState().serverApi.queries).length, 0);
});

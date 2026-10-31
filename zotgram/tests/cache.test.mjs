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
const { serverApi, refreshMessages, applyIncomingMessage, submitMessage, retryMessage, updateCachedPost,
  submitComment, retryComment, refreshChat } = await vite.ssrLoadModule("/src/api/serverApi.js");
const { store } = await vite.ssrLoadModule("/src/store/index.js");
const { login, logout } = await vite.ssrLoadModule("/src/store/userReducer.js");
const { setAccess } = await vite.ssrLoadModule("/src/api/session.js");
const { subscribePrivateFile, getPrivateFile, chatAvatarUrl } = await vite.ssrLoadModule("/src/api/privateFiles.js");
const { upsertChat, loadChats, loadMoreChats, refreshUnread } = await vite.ssrLoadModule("/src/store/chatsReducer.js");
const { pageRows } = await vite.ssrLoadModule("/src/api/pagination.js");
const { peopleSelector, outboxSelector } = await vite.ssrLoadModule("/src/api/selectors.js");
const { discardComment } = await vite.ssrLoadModule("/src/store/outboxReducer.js");
const { startChatUpdates } = await vite.ssrLoadModule("/src/api/chatUpdates.js");
const { startRealtime } = await vite.ssrLoadModule("/src/api/realtime.js");
const { startMessageNotifications } = await vite.ssrLoadModule("/src/api/notifications.js");
const { changed } = await vite.ssrLoadModule("/src/api/client.js");
const { getOutboxFile } = await vite.ssrLoadModule("/src/api/outboxFiles.js");
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocation = globalThis.location;

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
const comments = (postId = "post-a") => pageRows(cached("getComments", postId).data);
const historyArgs = { chatId: "chat-a", query: "" };
const message = (sequence, overrides = {}) => ({
  id: `message-${sequence}`, sequence, content: `Text ${sequence}`, chatId: "chat-a", authorId: "person",
  createdAt: new Date(1793437200000 + sequence * 1000).toISOString(), attempt_id: `attempt-${sequence}`, ...overrides,
});
const chat = (overrides = {}) => ({
  id: "chat-a", name: "Test chat", type: "group", participants: ["owner-a", "person"],
  members: [{ userId: "owner-a", lastReadSequence: 0 }, { userId: "person", lastReadSequence: 0 }],
  lastSequence: 1, lastReadSequence: 0, unreadCount: 1, lastMessage: message(1),
  updatedAt: message(1).createdAt, ...overrides,
});
const seedChat = async () => {
  store.dispatch(upsertChat(chat()));
  await store.dispatch(serverApi.util.upsertQueryData("getChat", "chat-a", chat()));
  await store.dispatch(serverApi.util.upsertQueryData("getMessages", historyArgs, {
    rows: [message(1)], older: false, syncedSequence: 1,
  }));
};
let unexpectedRequests;

beforeEach(() => {
  setAccess("test-access");
  store.dispatch(login({ id: "owner-a" }));
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  globalThis.document.visibilityState = "visible";
  globalThis.location = new URL("http://localhost/");
  window.location = globalThis.location;
  unexpectedRequests = [];
  globalThis.fetch = (path) => {
    unexpectedRequests.push(path);
    throw new Error("Unexpected network request");
  };
});
afterEach(() => {
  store.dispatch(logout());
  assert.deepEqual(unexpectedRequests, [], "Unexpected HTTP requests escaped the scenario");
});
after(async () => {
  globalThis.fetch = originalFetch;
  globalThis.BroadcastChannel = originalChannel;
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.location = originalLocation;
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
  await waitFor(() => comments().length === 2);
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
  await waitFor(() => comments().length === 2);
  assert.deepEqual(comments().map((item) => item.id).sort(), ["new-comment", "old-comment"]);
});

test("failed comment submissions preserve the existing list", async () => {
  globalThis.fetch = async (_path, options) => options.method === "POST"
    ? json({ detail: "Unavailable" }, 503)
    : json({ results: [{ id: "existing" }], next: null });
  await query("getComments", "post-a");
  await assert.rejects(query("addComment", { postId: "post-a", text: "Hello" }).unwrap());
  assert.deepEqual(comments(), [{ id: "existing" }]);
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

test("message events update cached chats and history without HTTP; duplicates do not change unread counts", async (t) => {
  await seedChat();
  const other = chat({ id: "chat-b" });
  store.dispatch(upsertChat(other));
  const untouched = store.getState().chats.items.find((item) => item.id === "chat-b");
  const stop = startChatUpdates(store.dispatch);
  t.after(stop);
  const event = { type: "message.created", chat_id: "chat-a", message: message(2) };
  changed("messages", event);
  const rows = cached("getMessages", historyArgs).data.rows;
  changed("messages", event);
  assert.equal(store.getState().chats.items[0].id, "chat-a");
  assert.equal(store.getState().chats.items[0].unreadCount, 2);
  assert.equal(store.getState().chats.items[0].lastSequence, 2);
  assert.equal(cached("getChat", "chat-a").data.lastMessage.id, "message-2");
  assert.equal(cached("getMessages", historyArgs).data.syncedSequence, 2);
  assert.equal(cached("getMessages", historyArgs).data.rows, rows);
  assert.equal(store.getState().chats.items.find((item) => item.id === "chat-b"), untouched);
});

test("unknown chats fetch only their metadata and replay the arriving message over an older snapshot", async () => {
  const paths = [];
  globalThis.fetch = async (path) => { paths.push(path); return json(chat()); };
  store.dispatch(applyIncomingMessage(message(2)));
  await waitFor(() => store.getState().chats.items?.[0]?.lastSequence === 2);
  assert.deepEqual(paths, ["/api/chat/chats/chat-a/"]);
  assert.equal(cached("getChat", "chat-a").data.lastSequence, 2);
  assert.equal(store.getState().chats.items[0].unreadCount, 2);
});

test("out-of-order events repair missing messages from the contiguous cursor", async () => {
  await seedChat();
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    if (path.includes("/unread/")) return json({ chats: [{ id: "chat-a", lastSequence: 4, lastReadSequence: 0, unreadCount: 4 }] });
    return json({ results: [message(2), message(3), message(4)], has_more: false });
  };
  store.dispatch(applyIncomingMessage(message(4)));
  assert.equal(cached("getMessages", historyArgs).data.syncedSequence, 1);
  await waitFor(() => cached("getMessages", historyArgs).data.syncedSequence === 4);
  await waitFor(() => store.getState().chats.items[0].unreadCount === 4);
  assert.ok(paths.some((path) => path.includes("after=1")));
  assert.ok(paths.every((path) => !path.includes("after=4")));
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2, 3, 4]);
});

test("message events update matching search results without fetching and leave other searches alone", async () => {
  await seedChat();
  const args = { ...historyArgs, query: "hello" };
  await store.dispatch(serverApi.util.upsertQueryData("getMessages", args, {
    rows: [], older: false, syncedSequence: 0,
  }));
  store.dispatch(applyIncomingMessage(message(2, { content: "HELLO new" })));
  store.dispatch(applyIncomingMessage(message(3, { content: "Another message" })));
  assert.deepEqual(cached("getMessages", args).data.rows.map((item) => item.sequence), [2]);
  assert.equal(cached("getMessages", args).data.syncedSequence, 0);
  assert.equal(cached("getMessages", historyArgs).data.syncedSequence, 3);
});

test("events received before the initial history response are replayed without an extra GET", async () => {
  store.dispatch(upsertChat(chat()));
  const response = deferred();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return response.promise; };
  const initial = query("getMessages", historyArgs);
  store.dispatch(applyIncomingMessage(message(2)));
  response.resolve(json({ results: [message(1)], has_more: false }));
  await initial;
  await waitFor(() => cached("getMessages", historyArgs).data.syncedSequence === 2);
  assert.equal(requests, 1);
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2]);
});

test("a slow delta response does not overwrite newer events already applied to the cache", async () => {
  await seedChat();
  const response = deferred();
  globalThis.fetch = async () => response.promise;
  const refresh = query("getMessages", historyArgs, { forceRefetch: true });
  store.dispatch(applyIncomingMessage(message(2)));
  response.resolve(json({ results: [], has_more: false }));
  await refresh;
  assert.equal(cached("getMessages", historyArgs).data.syncedSequence, 2);
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2]);
});

test("read receipts update members and own unread counts without requesting chat metadata", async (t) => {
  await seedChat();
  t.after(startChatUpdates(store.dispatch));
  changed("reads", { type: "read.updated", chat_id: "chat-a", user_id: "person", sequence: 1 });
  assert.equal(cached("getChat", "chat-a").data.members[1].lastReadSequence, 1);
  assert.equal(store.getState().chats.items[0].members[1].lastReadSequence, 1);
  changed("reads", { type: "read.updated", chat_id: "chat-a", user_id: "owner-a", sequence: 1, last_sequence: 1, unread_count: 0 });
  assert.equal(store.getState().chats.items[0].unreadCount, 0);
  changed("reads", { type: "read.updated", chat_id: "chat-a", user_id: "owner-a", sequence: 0, last_sequence: 1, unread_count: 1 });
  assert.equal(store.getState().chats.items[0].unreadCount, 0);
});

test("stale full-list responses cannot undo newer messages, read receipts, additions, or removals", async (t) => {
  await seedChat();
  t.after(startChatUpdates(store.dispatch));
  const response = deferred();
  globalThis.fetch = async (path) => path.includes("/unread/")
    ? json({ chats: [{ id: "chat-a", lastSequence: 2, lastReadSequence: 2, unreadCount: 0 },
      { id: "new-chat", lastSequence: 1, lastReadSequence: 0, unreadCount: 1 }] })
    : response.promise;
  const loading = store.dispatch(loadChats({ force: true }));
  store.dispatch(applyIncomingMessage(message(2)));
  changed("reads", { type: "read.updated", chat_id: "chat-a", user_id: "owner-a", sequence: 2, last_sequence: 2, unread_count: 0 });
  changed("reads", { type: "read.updated", chat_id: "chat-a", user_id: "person", sequence: 2 });
  store.dispatch(upsertChat(chat({ id: "new-chat" })));
  changed("chats", { type: "chat.removed", chat_id: "deleted-chat" });
  response.resolve(json({ results: [chat(), chat({ id: "deleted-chat" })], next: null }));
  await loading;
  const item = store.getState().chats.items.find((entry) => entry.id === "chat-a");
  assert.equal(item.lastMessage.id, "message-2");
  assert.equal(item.lastReadSequence, 2);
  assert.equal(item.unreadCount, 0);
  assert.equal(item.members[1].lastReadSequence, 2);
  assert.ok(store.getState().chats.items.some((entry) => entry.id === "new-chat"));
  assert.ok(!store.getState().chats.items.some((entry) => entry.id === "deleted-chat"));
});

test("optimistic messages appear before HTTP completion and successful sends need no GET", async () => {
  await seedChat();
  const responses = [deferred(), deferred()];
  let requests = 0;
  globalThis.fetch = async (_path, options) => {
    assert.equal(options.method, "POST");
    return responses[requests++].promise;
  };
  const first = store.dispatch(submitMessage({ chatId: "chat-a", text: "First", attemptId: "send-1" }));
  const second = store.dispatch(submitMessage({ chatId: "chat-a", text: "Second", attemptId: "send-2" }));
  assert.equal(store.getState().outbox.items.length, 2);
  assert.ok(store.getState().outbox.items.every((item) => item.delivery === "sending"));
  responses[0].resolve(json(message(2, { authorId: "owner-a", attempt_id: "send-1" }), 201));
  await first;
  responses[1].resolve(json(message(3, { authorId: "owner-a", attempt_id: "send-2" }), 201));
  await second;
  await waitFor(() => store.getState().outbox.items.length === 0);
  assert.equal(requests, 2);
  assert.equal(store.getState().chats.items[0].unreadCount, 1);
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2, 3]);
});

test("failed sends retain the original file and retry with the same attempt ID", async () => {
  await seedChat();
  const file = new File(["file content"], "example.txt", { type: "text/plain" });
  const attempts = [];
  globalThis.fetch = async (_path, options) => {
    attempts.push({ id: options.body.get("attempt_id"), file: options.body.get("file") });
    return attempts.length === 1 ? json({ detail: "Unavailable" }, 503)
      : json(message(2, { authorId: "owner-a", attempt_id: "retry-me" }), 200);
  };
  await store.dispatch(submitMessage({ chatId: "chat-a", text: "With file", file, attemptId: "retry-me" }));
  await waitFor(() => store.getState().outbox.items[0]?.delivery === "failed");
  const preview = store.getState().outbox.items[0].attachment.localUrl;
  assert.equal(getOutboxFile("retry-me"), file);
  await store.dispatch(retryMessage("retry-me"));
  await waitFor(() => store.getState().outbox.items.length === 0);
  assert.deepEqual(attempts.map((attempt) => attempt.id), ["retry-me", "retry-me"]);
  assert.ok(attempts.every((attempt) => attempt.file.name === "example.txt" && attempt.file.size === file.size));
  assert.equal(getOutboxFile("retry-me"), undefined);
  await assert.rejects(originalFetch(preview));
  assert.equal(cached("getMessages", historyArgs).data.rows.length, 2);
});

test("a WebSocket acknowledgement before HTTP failure confirms the message exactly once", async (t) => {
  await seedChat();
  t.after(startChatUpdates(store.dispatch));
  const response = deferred();
  globalThis.fetch = async () => response.promise;
  const request = store.dispatch(submitMessage({ chatId: "chat-a", text: "Hello", attemptId: "early-ack" }));
  changed("messages", { type: "message.created", chat_id: "chat-a",
    message: message(2, { authorId: "owner-a", attempt_id: "early-ack" }) });
  assert.equal(store.getState().outbox.items.length, 0);
  response.resolve(json({ detail: "Unavailable" }, 503));
  await request;
  assert.equal(store.getState().outbox.items.length, 0);
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1, 2]);
});

test("an uncertain send is confirmed later by HTTP history reconciliation", async () => {
  await seedChat();
  globalThis.fetch = async () => json({ detail: "Unavailable" }, 503);
  await store.dispatch(submitMessage({ chatId: "chat-a", text: "Hello", attemptId: "lost-response" }));
  await waitFor(() => store.getState().outbox.items[0]?.delivery === "failed");
  globalThis.fetch = async () => json({ results: [message(2, { authorId: "owner-a", attempt_id: "lost-response" })], has_more: false });
  await query("getMessages", historyArgs, { forceRefetch: true });
  await waitFor(() => store.getState().outbox.items.length === 0);
});

test("another author cannot acknowledge an outgoing attempt with the same ID", async () => {
  await seedChat();
  const response = deferred();
  globalThis.fetch = async () => response.promise;
  const request = store.dispatch(submitMessage({ chatId: "chat-a", text: "Hello", attemptId: "same-id" }));
  store.dispatch(applyIncomingMessage(message(2, { attempt_id: "same-id" })));
  assert.equal(store.getState().outbox.items.length, 1);
  response.resolve(json(message(3, { authorId: "owner-a", attempt_id: "same-id" }), 201));
  await request;
  await waitFor(() => store.getState().outbox.items.length === 0);
});

test("logout clears pending uploads and old responses cannot affect a new login of the same account", async () => {
  await seedChat();
  const response = deferred();
  globalThis.fetch = async () => response.promise;
  const file = new File(["private file"], "private.txt");
  const request = store.dispatch(submitMessage({ chatId: "chat-a", text: "Private", file, attemptId: "old-session" }));
  const preview = store.getState().outbox.items[0].attachment.localUrl;
  store.dispatch(logout());
  store.dispatch(login({ id: "owner-a" }));
  await seedChat();
  response.resolve(json(message(2, { authorId: "owner-a", attempt_id: "old-session" }), 201));
  await request;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(store.getState().outbox.items.length, 0);
  assert.equal(getOutboxFile("old-session"), undefined);
  assert.deepEqual(cached("getMessages", historyArgs).data.rows.map((item) => item.sequence), [1]);
  await assert.rejects(originalFetch(preview));
});

test("a stale unread response is retried when newer events have already advanced its sequence", async () => {
  await seedChat();
  const response = deferred();
  let counters = 0;
  globalThis.fetch = async (path) => {
    if (path.includes("/unread/")) return ++counters === 1 ? response.promise
      : json({ chats: [{ id: "chat-a", lastSequence: 4, lastReadSequence: 0, unreadCount: 4 }] });
    return json({ results: [message(2), message(3)], has_more: false });
  };
  store.dispatch(applyIncomingMessage(message(3)));
  await waitFor(() => cached("getMessages", historyArgs).data.syncedSequence === 3);
  store.dispatch(applyIncomingMessage(message(4)));
  response.resolve(json({ chats: [{ id: "chat-a", lastSequence: 3, lastReadSequence: 0, unreadCount: 3 }] }));
  await waitFor(() => store.getState().chats.items[0].unreadCount === 4);
  assert.equal(counters, 2);
});

test("a removed chat is not resurrected by a late metadata response or an older read receipt", async (t) => {
  await seedChat();
  t.after(startChatUpdates(store.dispatch));
  const response = deferred();
  globalThis.fetch = async () => response.promise;
  changed("chats", { type: "chat.updated", chat_id: "chat-a" });
  changed("chats", { type: "chat.removed", chat_id: "chat-a" });
  changed("reads", { type: "read.updated", chat_id: "chat-a", user_id: "person", sequence: 1 });
  response.resolve(json(chat()));
  await waitFor(() => cached("getChat", "chat-a").data === null);
  assert.ok(!store.getState().chats.items.some((item) => item.id === "chat-a"));
});

test("notifications reuse cached authors and chat metadata", async (t) => {
  await seedChat();
  await store.dispatch(serverApi.util.upsertQueryData("getPerson", "person", { id: "person", name: "Anna" }));
  const originalNotification = globalThis.Notification;
  const shown = [];
  class FakeNotification {
    static permission = "granted";
    constructor(title, options) { shown.push({ title, options }); }
    close() {}
  }
  globalThis.Notification = FakeNotification;
  window.Notification = FakeNotification;
  window.isSecureContext = true;
  t.after(() => { globalThis.Notification = originalNotification; });
  t.after(startMessageNotifications("owner-a", () => {}));
  changed("messages", { type: "message.created", chat_id: "chat-a", message: message(2) });
  await waitFor(() => shown.length === 1);
  assert.equal(shown[0].title, "ZotGram — Test chat");
  assert.ok(shown[0].options.body.includes("Anna"));
});

test("heartbeats avoid HTTP refreshes on each pong while periodic reconciliation remains enabled", async (t) => {
  let clock = 1000000;
  t.mock.method(Date, "now", () => clock);
  let heartbeat;
  t.mock.method(globalThis, "setInterval", (handler) => { heartbeat = handler; return 123; });
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor() { sockets.push(this); }
    send(payload) { this.sent.push(JSON.parse(payload)); }
    close() { this.onclose?.(); }
    receive(payload) { this.onmessage({ data: JSON.stringify(payload) }); }
  }
  const originalSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  t.after(() => { globalThis.WebSocket = originalSocket; });
  const events = [];
  window.addEventListener("zotgram:changed", (event) => events.push(event.detail));
  globalThis.fetch = async () => json({ ticket: "test" });
  const stop = startRealtime();
  t.after(stop);
  await waitFor(() => sockets.length > 0);
  const socket = sockets[0];
  socket.onopen();
  socket.receive({ type: "auth.ready" });
  assert.equal(events.length, 2);
  for (let index = 0; index < 4; index++) {
    clock += 25000;
    heartbeat();
    socket.receive({ type: "pong" });
  }
  assert.equal(events.length, 2);
  clock += 25000;
  socket.receive({ type: "pong" });
  assert.equal(events.length, 4);
  assert.deepEqual(events[2], { topic: "chats", event: { sync: false } });
  clock += 200000;
  socket.receive({ type: "pong" });
  assert.deepEqual(events.at(-2), { topic: "chats", event: { sync: true } });
  const count = events.length;
  socket.receive({ type: "message.created", chat_id: "chat-a", message: message(2) });
  assert.equal(events.length, count + 1);
  assert.equal(events.at(-1).topic, "messages");
  // A socket that authenticates again must repair membership changes as well.
  socket.receive({ type: "auth.ready" });
  assert.deepEqual(events.at(-2), { topic: "chats", event: { sync: true } });
  const finalCount = events.length;
  stop();
  socket.receive({ type: "message.created", chat_id: "chat-a", message: message(3) });
  assert.equal(events.length, finalCount);
});

test("post pages load on demand, deduplicate overlapping results, and share the cache on reopen", async () => {
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return path.includes('page=2')
      ? json({ results: [{ id: 'post-b' }, { id: 'post-c' }], next: null })
      : json({ results: [{ id: 'post-a' }, { id: 'post-b' }], next: 'http://localhost/api/core/posts/?page=2&page_size=20' });
  };
  await query('getPosts', 'q=test');
  assert.equal(paths.length, 1);
  assert.deepEqual(pageRows(cached('getPosts', 'q=test').data).map(row => row.id), ['post-a', 'post-b']);
  await Promise.all([query('getPosts', 'q=test', { direction: 'forward' }), query('getPosts', 'q=test', { direction: 'forward' })]);
  assert.equal(paths.length, 2);
  assert.deepEqual(pageRows(cached('getPosts', 'q=test').data).map(row => row.id), ['post-a', 'post-b', 'post-c']);
  await query('getPosts', 'q=test');
  assert.equal(paths.length, 2);
});

test("a failed next page leaves earlier posts visible and retries the same cursor", async () => {
  let fail = true;
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    if (!path.includes('page=2')) return json({ results: [{ id: 'first' }], next: '/api/core/posts/?page=2' });
    return fail ? json({ detail: 'Unavailable' }, 503) : json({ results: [{ id: 'second' }], next: null });
  };
  await query('getPosts', '');
  await query('getPosts', '', { direction: 'forward' });
  assert.deepEqual(pageRows(cached('getPosts', '').data), [{ id: 'first' }]);
  assert.equal(cached('getPosts', '').isFetchNextPageError, true);
  fail = false;
  await query('getPosts', '', { direction: 'forward' });
  assert.equal(paths[1], paths[2]);
  assert.deepEqual(pageRows(cached('getPosts', '').data), [{ id: 'first' }, { id: 'second' }]);
});

test("post searches, profile posts, and chat searches keep separate page caches", async () => {
  globalThis.fetch = async (path) => json({ results: [{ id: path }], next: null });
  for (const args of ['', 'q=hello', 'author=other']) await query('getPosts', args);
  await query('searchChats', 'hello');
  await query('searchChats', 'other');
  assert.notDeepEqual(cached('getPosts', '').data, cached('getPosts', 'q=hello').data);
  assert.notDeepEqual(cached('getPosts', 'q=hello').data, cached('getPosts', 'author=other').data);
  assert.notDeepEqual(cached('searchChats', 'hello').data, cached('searchChats', 'other').data);
});

test("directory pages seed user caches and do not fetch the whole directory", async () => {
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return json({ results: [{ id: 'person', name: 'Anna' }], next: '/api/core/users/?page=2' });
  };
  await query('getUsers', '');
  await waitFor(() => cached('getPerson', 'person').data?.name === 'Anna');
  await query('getPerson', 'person');
  assert.equal(paths.length, 1);
  assert.ok(paths[0].includes('page_size=20'));
});

test("new comments stay visible while older pages are loaded, without a full refetch", async () => {
  const paths = [];
  globalThis.fetch = async (path, options) => {
    paths.push(path);
    if (options.method === 'POST') return json({ id: 'comment-4' }, 201);
    return path.includes('cursor=older')
      ? json({ results: [{ id: 'comment-1' }], next: null })
      : json({ results: [{ id: 'comment-3' }, { id: 'comment-2' }], next: '/api/core/posts/post-a/comments/?cursor=older' });
  };
  await query('getComments', 'post-a');
  assert.equal(paths.length, 1);
  await query('addComment', { postId: 'post-a', text: 'New' });
  await waitFor(() => comments().length === 3);
  await query('getComments', 'post-a', { direction: 'forward' });
  assert.deepEqual(comments().map(row => row.id).sort(), ['comment-1', 'comment-2', 'comment-3', 'comment-4']);
  assert.equal(paths.length, 3);
});

test("a next-page response cannot populate a new account after logout", async () => {
  globalThis.fetch = async () => json({ results: [{ id: 'first' }], next: '/api/core/posts/?page=2' });
  await query('getPosts', '');
  const response = deferred();
  globalThis.fetch = () => response.promise;
  const next = query('getPosts', '', { direction: 'forward' });
  store.dispatch(logout());
  store.dispatch(login({ id: 'owner-b' }));
  response.resolve(json({ results: [{ id: 'private-post' }], next: null }));
  await next;
  assert.equal(cached('getPosts', '').data, undefined);
});

const summary = (rows) => ({ chats: rows.map(row => ({ id: row.id, unreadCount: row.unreadCount,
  lastReadSequence: row.lastReadSequence, lastSequence: row.lastSequence })),
  systemChats: rows.filter(row => row.systemKey).map(row => ({ id: row.id, systemKey: row.systemKey, departmentId: row.departmentId })),
});

test("chat lists load one page while totals and department links cover all visible chats", async () => {
  const all = [chat(), chat({ id: 'chat-b' }), chat({ id: 'chat-c', systemKey: 'general' })];
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return path.includes('/unread/') ? json(summary(all))
      : json({ results: [all[0]], next: '/api/chat/chats/?cursor=second' });
  };
  await store.dispatch(loadChats());
  await waitFor(() => store.getState().chats.unreadCount === 3);
  assert.equal(store.getState().chats.items.length, 1);
  assert.equal(store.getState().chats.systemChats[0].id, 'chat-c');
  assert.equal(paths.length, 2);
  assert.ok(!paths.some(path => path.includes('cursor=second')));
});

test("loading the next chat page merges duplicates and stops at the last page", async () => {
  const all = [chat(), chat({ id: 'chat-b' })];
  let requests = 0;
  globalThis.fetch = async (path) => {
    requests++;
    if (path.includes('/unread/')) return json(summary(all));
    return json({ results: path.includes('cursor=second') ? all : [all[0]],
      next: path.includes('cursor=second') ? null : '/api/chat/chats/?cursor=second' });
  };
  await store.dispatch(loadChats());
  await waitFor(() => !store.getState().chats.unreadLoading);
  await store.dispatch(loadMoreChats());
  const before = requests;
  await store.dispatch(loadMoreChats());
  assert.equal(store.getState().chats.items.length, 2);
  assert.equal(store.getState().chats.unreadCount, 2);
  assert.equal(store.getState().chats.next, null);
  assert.equal(requests, before);
});

test("failed chat pages retain items, keep the cursor, and allow retry", async () => {
  const all = [chat(), chat({ id: 'chat-b' })];
  let fail = true;
  globalThis.fetch = async (path) => {
    if (path.includes('/unread/')) return json(summary(all));
    if (path.includes('cursor=second')) return fail ? json({ detail: 'Unavailable' }, 503) : json({ results: [all[1]], next: null });
    return json({ results: [all[0]], next: '/api/chat/chats/?cursor=second' });
  };
  await store.dispatch(loadChats());
  await waitFor(() => !store.getState().chats.unreadLoading);
  await store.dispatch(loadMoreChats());
  assert.equal(store.getState().chats.items.length, 1);
  assert.ok(store.getState().chats.moreError);
  assert.equal(store.getState().chats.next, '/api/chat/chats/?cursor=second');
  fail = false;
  await store.dispatch(loadMoreChats());
  assert.equal(store.getState().chats.items.length, 2);
  assert.equal(store.getState().chats.moreError, '');
});

test("background chat refresh preserves loaded older pages and their next cursor", async () => {
  const all = [chat(), chat({ id: 'chat-b' }), chat({ id: 'chat-c' })];
  globalThis.fetch = async (path) => {
    if (path.includes('/unread/')) return json(summary(all));
    return path.includes('cursor=second') ? json({ results: [all[1]], next: '/api/chat/chats/?cursor=third' })
      : json({ results: [all[0]], next: '/api/chat/chats/?cursor=second' });
  };
  await store.dispatch(loadChats());
  await waitFor(() => !store.getState().chats.unreadLoading);
  await store.dispatch(loadMoreChats());
  await store.dispatch(loadChats({ force: true }));
  await waitFor(() => !store.getState().chats.unreadLoading);
  assert.equal(store.getState().chats.items.length, 2);
  assert.equal(store.getState().chats.next, '/api/chat/chats/?cursor=third');
  assert.equal(store.getState().chats.unreadCount, 3);
});

test("read events for unloaded chats update the global total without loading their metadata", async (t) => {
  const all = [chat(), chat({ id: 'chat-b' })];
  globalThis.fetch = async (path) => path.includes('/unread/') ? json(summary(all)) : json({ results: [all[0]], next: '/api/chat/chats/?cursor=second' });
  await store.dispatch(loadChats());
  await waitFor(() => !store.getState().chats.unreadLoading);
  globalThis.fetch = (path) => { unexpectedRequests.push(path); throw new Error('Unexpected request'); };
  t.after(startChatUpdates(store.dispatch));
  changed('reads', { type: 'read.updated', chat_id: 'chat-b', user_id: 'owner-a', sequence: 1, last_sequence: 1, unread_count: 0 });
  assert.equal(store.getState().chats.unreadCount, 1);
  assert.equal(store.getState().chats.items.length, 1);
});

test("unread refresh removes inaccessible chats and ignores a chat removed during that refresh", async (t) => {
  await seedChat();
  store.dispatch(upsertChat(chat({ id: 'chat-b' })));
  const response = deferred();
  globalThis.fetch = () => response.promise;
  const loading = store.dispatch(refreshUnread());
  t.after(startChatUpdates(store.dispatch));
  changed('chats', { type: 'chat.removed', chat_id: 'chat-a' });
  response.resolve(json(summary([chat()])));
  await loading;
  assert.equal(store.getState().chats.unreadCount, 0);
  assert.equal(store.getState().chats.items.length, 0);
});

test("post actions persist across feed and profile caches without overwriting comment counts", async () => {
  globalThis.fetch = async () => json({ results: [{ id: 'post-a', isLiked: false, likesCount: 0, commentsCount: 1 }], next: null });
  await query('getPosts', '');
  await query('getPosts', 'author=person');
  store.dispatch(updateCachedPost('post-a', { isLiked: true, likesCount: 1 }));
  store.dispatch(updateCachedPost('post-a', post => ({ commentsCount: post.commentsCount + 1 })));
  store.dispatch(updateCachedPost('post-a', { isLiked: false, likesCount: 0 }));
  for (const args of ['', 'author=person']) {
    const post = pageRows(cached('getPosts', args).data)[0];
    assert.equal(post.likesCount, 0);
    assert.equal(post.isLiked, false);
    assert.equal(post.commentsCount, 2);
  }
});

test("a successful comment submission still updates the cache after its form unmounts", async () => {
  globalThis.fetch = async () => json({ results: [{ id: 'old' }], next: null });
  await query('getComments', 'post-a');
  const response = deferred();
  globalThis.fetch = () => response.promise;
  const request = query('addComment', { postId: 'post-a', text: 'New' });
  request.reset();
  response.resolve(json({ id: 'new' }, 201));
  await request;
  await waitFor(() => comments().length === 2);
  assert.deepEqual(comments().map(row => row.id).sort(), ['new', 'old']);
});

test("a slow next chat page cannot undo an event applied while that page was loading", async () => {
  const all = [chat(), chat({ id: 'chat-b' })];
  const response = deferred();
  let latest = all;
  globalThis.fetch = async (path) => {
    if (path.includes('/unread/')) return json(summary(latest));
    if (path.includes('cursor=second')) return response.promise;
    return json({ results: [all[0]], next: '/api/chat/chats/?cursor=second' });
  };
  await store.dispatch(loadChats());
  await waitFor(() => !store.getState().chats.unreadLoading);
  const more = store.dispatch(loadMoreChats());
  store.dispatch(applyIncomingMessage(message(2)));
  latest = [chat({ lastSequence: 2, unreadCount: 2 }), all[1]];
  response.resolve(json({ results: all, next: null }));
  await more;
  await waitFor(() => !store.getState().chats.unreadLoading);
  const row = store.getState().chats.items.find(item => item.id === 'chat-a');
  assert.equal(row.lastMessage.id, 'message-2');
  assert.equal(row.unreadCount, 2);
  assert.equal(store.getState().chats.unreadCount, 3);
  assert.equal(store.getState().chats.items.length, 2);
});

const seedComments = async () => {
  await store.dispatch(serverApi.util.upsertQueryData('getComments', 'post-a', {
    pages: [{results:[{id:'existing',userId:'person',text:'Existing',date:message(1).createdAt}],next:null,commentsCount:1}], pageParams:[null],
  }));
  await store.dispatch(serverApi.util.upsertQueryData('getPost', 'post-a', {id:'post-a',commentsCount:1}));
};

test("comments appear in the outbox before HTTP completion and confirm without a list GET", async () => {
  await seedComments();
  const response = deferred();
  const requests = [];
  globalThis.fetch = async (path, options) => {
    requests.push({path,method:options.method,body:JSON.parse(options.body)});
    return response.promise;
  };
  const request = store.dispatch(submitComment({postId:'post-a',text:'Immediate',attemptId:'comment-attempt'}));
  assert.equal(store.getState().outbox.comments[0].delivery, 'sending');
  assert.equal(store.getState().outbox.comments[0].text, 'Immediate');
  response.resolve(json({id:'confirmed',userId:'owner-a',attempt_id:'comment-attempt',text:'Immediate',commentsCount:2},201));
  await request;
  await waitFor(() => !store.getState().outbox.comments.length);
  assert.equal(comments().length, 2);
  assert.equal(cached('getPost','post-a').data.commentsCount, 2);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.attempt_id, 'comment-attempt');
});

test("failed comments preserve text and retry with the original attempt ID", async () => {
  await seedComments();
  const attempts = [];
  globalThis.fetch = async (_path, options) => {
    attempts.push(JSON.parse(options.body).attempt_id);
    return attempts.length === 1 ? json({detail:'Unavailable'},503)
      : json({id:'confirmed',attempt_id:'retry-comment',userId:'owner-a',commentsCount:2});
  };
  await store.dispatch(submitComment({postId:'post-a',text:'Keep this text',attemptId:'retry-comment'}));
  await waitFor(() => store.getState().outbox.comments[0]?.delivery === 'failed');
  assert.equal(store.getState().outbox.comments[0].text, 'Keep this text');
  assert.equal(cached('getPost','post-a').data.commentsCount, 1);
  const retry = store.dispatch(retryComment('retry-comment'));
  assert.equal(store.dispatch(retryComment('retry-comment')), undefined);
  await retry;
  await waitFor(() => !store.getState().outbox.comments.length);
  assert.deepEqual(attempts, ['retry-comment','retry-comment']);
  assert.equal(comments().filter(row => row.id === 'confirmed').length, 1);
  assert.equal(cached('getPost','post-a').data.commentsCount, 2);
});

test("a history response confirms a comment whose POST acknowledgement was lost", async () => {
  await seedComments();
  const response = deferred();
  globalThis.fetch = async (_path, options) => options.method === 'POST' ? response.promise
    : json({results:[{id:'confirmed',attempt_id:'lost-comment',userId:'owner-a'}],next:null,commentsCount:2});
  const sending = store.dispatch(submitComment({postId:'post-a',text:'Hello',attemptId:'lost-comment'}));
  await query('getComments','post-a',{forceRefetch:true});
  await waitFor(() => !store.getState().outbox.comments.length);
  response.resolve(json({detail:'Lost reply'},503));
  await sending;
  assert.equal(store.getState().outbox.comments.length, 0);
  assert.equal(cached('getPost','post-a').data.commentsCount, 2);
});

test("out-of-order comment responses do not rewind confirmed counts", async () => {
  await seedComments();
  const responses = [deferred(),deferred()];
  let index = 0;
  globalThis.fetch = () => responses[index++].promise;
  const first = store.dispatch(submitComment({postId:'post-a',text:'First',attemptId:'first-comment'}));
  const second = store.dispatch(submitComment({postId:'post-a',text:'Second',attemptId:'second-comment'}));
  responses[1].resolve(json({id:'second',attempt_id:'second-comment',userId:'owner-a',commentsCount:3},201));
  await second;
  responses[0].resolve(json({id:'first',attempt_id:'first-comment',userId:'owner-a',commentsCount:2},201));
  await first;
  await waitFor(() => !store.getState().outbox.comments.length);
  assert.equal(cached('getPost','post-a').data.commentsCount, 3);
  assert.equal(comments().length, 3);
});

test("another author cannot confirm an outgoing comment with the same attempt ID", async () => {
  await seedComments();
  const response = deferred();
  globalThis.fetch = async (_path, options) => options.method === 'POST' ? response.promise
    : json({results:[{id:'other',attempt_id:'shared-id',userId:'person'}],next:null,commentsCount:2});
  const sending = store.dispatch(submitComment({postId:'post-a',text:'Mine',attemptId:'shared-id'}));
  await query('getComments','post-a',{forceRefetch:true});
  assert.equal(store.getState().outbox.comments.length, 1);
  response.resolve(json({detail:'Unavailable'},503));
  await sending;
  await waitFor(() => store.getState().outbox.comments[0]?.delivery === 'failed');
});

test("pending comments survive an overlapping initial GET, without mutating previous rows", async () => {
  const response = deferred();
  globalThis.fetch = async (_path, options) => options.method === 'POST'
    ? json({id:'new',userId:'owner-a',attempt_id:'overlap',commentsCount:2},201) : response.promise;
  const initial = query('getComments','post-a');
  const sending = store.dispatch(submitComment({postId:'post-a',text:'Hello',attemptId:'overlap'}));
  assert.equal(store.getState().outbox.comments[0].delivery, 'sending');
  response.resolve(json({results:[{id:'old'}],next:null,commentsCount:1}));
  await Promise.all([initial,sending]);
  await waitFor(() => comments().length === 2);
  assert.equal(store.getState().outbox.comments.length, 0);
});

test("logout discards optimistic comments and late responses cannot populate a new session", async () => {
  await seedComments();
  const response = deferred();
  globalThis.fetch = () => response.promise;
  const sending = store.dispatch(submitComment({postId:'post-a',text:'Private',attemptId:'old-comment'}));
  store.dispatch(logout());
  store.dispatch(login({id:'owner-a'}));
  await seedComments();
  response.resolve(json({id:'private',userId:'owner-a',attempt_id:'old-comment',commentsCount:2},201));
  await sending;
  await new Promise(resolve => setTimeout(resolve,10));
  assert.equal(store.getState().outbox.comments.length, 0);
  assert.equal(comments().length, 1);
  assert.equal(cached('getPost','post-a').data.commentsCount, 1);
});

test("only failed comments can be discarded, without changing confirmed comments", async () => {
  await seedComments();
  const response = deferred();
  globalThis.fetch = () => response.promise;
  const sending = store.dispatch(submitComment({postId:'post-a',text:'Hello',attemptId:'discard-me'}));
  store.dispatch(discardComment('discard-me'));
  assert.equal(store.getState().outbox.comments.length, 1);
  response.resolve(json({detail:'Unavailable'},503));
  await sending;
  store.dispatch(discardComment('discard-me'));
  assert.equal(store.getState().outbox.comments.length, 0);
  assert.equal(comments().length, 1);
});

test("unrelated outbox changes preserve the selected comments array", async () => {
  const select = outboxSelector('comments','postId','post-a');
  const previous = select(store.getState());
  globalThis.fetch = async () => json({detail:'Unavailable'},503);
  await store.dispatch(submitComment({postId:'post-b',text:'Other post',attemptId:'other-post'}));
  assert.equal(select(store.getState()), previous);
});

test("cached user selectors retain references during unchanged background refreshes", async () => {
  await store.dispatch(serverApi.util.upsertQueryData('getPerson','person',{id:'person',name:'Anna'}));
  const select = peopleSelector(['person'],serverApi.endpoints.getPerson);
  const previous = select(store.getState());
  const response = deferred();
  globalThis.fetch = () => response.promise;
  const refresh = query('getPerson','person',{forceRefetch:true});
  assert.equal(select(store.getState()), previous);
  response.resolve(json([{id:'person',name:'Anna'}]));
  await refresh;
  assert.equal(select(store.getState()), previous);
});

test("receiving a new message preserves the previous message objects", async () => {
  await seedChat();
  const first = cached('getMessages',historyArgs).data.rows[0];
  store.dispatch(applyIncomingMessage(message(2)));
  assert.equal(cached('getMessages',historyArgs).data.rows[0], first);
});

test("unchanged metadata refreshes preserve chat row identity", async () => {
  await seedChat();
  const previous = store.getState().chats.items[0];
  globalThis.fetch = async () => json(chat());
  await store.dispatch(refreshChat('chat-a'));
  assert.equal(store.getState().chats.items[0], previous);
});

test("confirming a new comment preserves the previous comment objects", async () => {
  await seedComments();
  const first = comments()[0];
  globalThis.fetch = async () => json({id:'new',userId:'owner-a',attempt_id:'append',commentsCount:2},201);
  await store.dispatch(submitComment({postId:'post-a',text:'New',attemptId:'append'}));
  await waitFor(() => comments().length === 2);
  assert.equal(comments()[0], first);
});

import { api } from "./client";

const files = new Map();
const idleLifetime = 5 * 60 * 1000;
const maxBytes = 50 * 1024 * 1024;
const maxEntries = 100;

function remove(url, entry) {
  clearTimeout(entry.timer);
  entry.controller.abort();
  if (entry.value) URL.revokeObjectURL(entry.value);
  files.delete(url);
  entry.listeners.forEach((listener) => listener());
}

function prune() {
  let bytes = [...files.values()].reduce((sum, entry) => sum + entry.size, 0);
  for (const [url, entry] of files) {
    if (bytes <= maxBytes && files.size <= maxEntries) break;
    if (entry.listeners.size) continue;
    bytes -= entry.size;
    remove(url, entry);
  }
}

export const getPrivateFile = (url) => files.get(url)?.value || "";

function download(url, entry) {
  entry.failed = false;
  api(url, { blob: true, signal: entry.controller.signal }).then((blob) => {
    if (files.get(url) !== entry) return;
    entry.value = URL.createObjectURL(blob);
    entry.size = blob.size;
    entry.listeners.forEach((notify) => notify());
    prune();
  }).catch(() => {
    if (files.get(url) === entry) entry.failed = true;
  });
}

export function subscribePrivateFile(url, listener) {
  if (!url) return () => {};
  let entry = files.get(url);
  if (!entry) {
    entry = { value: "", size: 0, listeners: new Set(), controller: new AbortController() };
    files.set(url, entry);
    download(url, entry);
  } else if (entry.failed) {
    entry.controller = new AbortController();
    download(url, entry);
  }
  clearTimeout(entry.timer);
  entry.listeners.add(listener);
  // Refresh insertion order for eviction of the least recently used idle files.
  files.delete(url);
  files.set(url, entry);
  prune();
  return () => {
    entry.listeners.delete(listener);
    if (files.get(url) !== entry || entry.listeners.size) return;
    entry.timer = setTimeout(() => remove(url, entry), idleLifetime);
    prune();
  };
}

export function clearPrivateFiles() {
  for (const [url, entry] of files) remove(url, entry);
}

export function chatAvatarUrl(chat) {
  if (!chat?.avatar) return "";
  return `${chat.avatar}?v=${encodeURIComponent(chat.avatarVersion || chat.updatedAt)}`;
}

const files = new Map();

export function rememberOutboxFile(attemptId, file) {
  if (!file) return null;
  if (!files.has(attemptId)) files.set(attemptId, { file, url: URL.createObjectURL(file) });
  return { name: file.name, mime: file.type, url: "", localUrl: files.get(attemptId).url };
}

export const getOutboxFile = (attemptId) => files.get(attemptId)?.file;

export function releaseOutboxFile(attemptId) {
  const entry = files.get(attemptId);
  if (entry) URL.revokeObjectURL(entry.url);
  files.delete(attemptId);
}

export function clearOutboxFiles() {
  for (const attemptId of files.keys()) releaseOutboxFile(attemptId);
}

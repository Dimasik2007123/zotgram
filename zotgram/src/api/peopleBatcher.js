// Individual RTK Query entries share one HTTP batch, including across chat rows.
export function createPeopleBatcher(load) {
  let pending = [];
  let timer;

  const flush = () => {
    const batch = pending;
    pending = [];
    timer = undefined;
    const active = batch.filter((item) => !item.signal.aborted);
    batch.filter((item) => item.signal.aborted).forEach((item) => {
      item.reject(new DOMException("Aborted", "AbortError"));
    });
    const ids = [...new Set(active.map((item) => item.id))];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      const requests = active.filter((item) => chunk.includes(item.id));
      const controller = new AbortController();
      const abortIfUnused = () => {
        if (requests.every((item) => item.signal.aborted)) controller.abort();
      };
      requests.forEach((item) => item.signal.addEventListener("abort", abortIfUnused, { once: true }));
      Promise.resolve().then(() => load(chunk, controller.signal)).then((people) => {
        const byId = new Map(people.map((person) => [String(person.id), person]));
        requests.forEach(({ id, resolve, reject, signal }) => {
          if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
          else if (byId.has(id)) resolve(byId.get(id));
          else reject(Object.assign(new Error("Пользователь недоступен"), { status: 404 }));
        });
      }).catch((error) => requests.forEach((item) => item.reject(error))).finally(() => {
        requests.forEach((item) => item.signal.removeEventListener("abort", abortIfUnused));
      });
    }
  };

  return (id, signal) => new Promise((resolve, reject) => {
    pending.push({ id: String(id), signal, resolve, reject });
    timer ??= setTimeout(flush, 0);
  });
}

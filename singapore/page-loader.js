// Shared by both readers. Only requested windows are loaded; urgent requests
// move ahead of queued prefetches, without duplicating in-flight downloads.
export function createPageLoader({ count, load, concurrency = 4 }) {
  const entries = new Map();
  let queue = [];
  let active = 0;
  const valid = (indices) => [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < count);
  function pump() {
    while (active < concurrency && queue.length) {
      const index = queue.shift();
      const entry = entries.get(index);
      entry.state = "loading";
      active++;
      Promise.resolve().then(() => load(index)).then(value => {
        entry.state = "ready";
        entry.resolve(value);
      }, error => {
        entries.delete(index); // The next explicit request can retry.
        entry.reject(error);
      }).finally(() => { active--; pump(); });
    }
  }
  function ensure(indices, urgent = true) {
    const wanted = valid(indices);
    for (const index of wanted) {
      if (entries.has(index)) continue;
      const entry = { state: "queued" };
      entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
      entries.set(index, entry);
      queue.push(index);
    }
    if (urgent) {
      const priority = new Set(wanted);
      queue = [...queue.filter(i => priority.has(i)), ...queue.filter(i => !priority.has(i))];
    }
    const result = Promise.all(wanted.map(i => entries.get(i).promise));
    pump();
    return result;
  }
  return {
    ensure,
    ready: indices => valid(indices).every(i => entries.get(i)?.state === "ready"),
    prefetch: indices => { void ensure(indices, false).catch(() => {}); },
  };
}

// Page 0 is the front cover; an open spread has faces 2*k-1 and 2*k.
export function pageWindow(spread, count, radius = 2) {
  return pageRange(2 * spread - 1 - 2 * radius, 2 * spread + 2 * radius, count);
}

export function pageRange(first, last, count) {
  const start = Math.max(0, first);
  const end = Math.min(count - 1, last);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

export function transitionPages(from, to, count) {
  return pageRange(2 * Math.min(from, to) - 1, 2 * Math.max(from, to), count);
}

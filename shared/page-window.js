// Keep only the current neighbourhood resident; urgent pages precede prefetches.
export function spreadFaces(spread, count, radius = 0) {
  const result = [];
  for (let distance = 0; distance <= radius; distance++) {
    for (const position of distance ? [spread + distance, spread - distance] : [spread]) {
      for (const index of [position * 2 - 1, position * 2]) {
        if (index >= 0 && index < count && !result.includes(index)) result.push(index);
      }
    }
  }
  return result;
}

export function createPageWindow({ load, apply, release, onChange = () => {}, onError = () => {}, concurrency = 2 }) {
  const entries = new Map();
  let wanted = new Set();
  let priority = [];
  let active = 0;

  function pump() {
    while (active < concurrency) {
      const index = priority.find(index => entries.get(index)?.state === "queued");
      if (index === undefined) return;
      const entry = entries.get(index);
      entry.state = "loading";
      active++;
      Promise.resolve().then(() => load(index)).then(asset => {
        if (!wanted.has(index)) {
          release(index, asset);
          entries.delete(index);
          entry.resolve(false);
          return;
        }
        entry.asset = asset;
        apply(index, asset);
        entry.state = "ready";
        entry.resolve(true);
        onChange();
      }).catch(error => {
        if (entry.asset) release(index, entry.asset);
        entry.state = "error";
        entry.resolve(false);
        if (wanted.has(index)) onError(index, error);
      }).finally(() => {
        active--;
        pump();
      });
    }
  }

  function focus(required, nearby = []) {
    priority = [...new Set([...required, ...nearby])];
    wanted = new Set(priority);
    for (const [index, entry] of entries) {
      if (entry.state === "loading") continue;
      if (!wanted.has(index) || entry.state === "error") {
        if (entry.state === "ready") release(index, entry.asset);
        else entry.resolve(false);
        entries.delete(index);
      }
    }
    for (const index of priority) {
      if (entries.has(index)) continue;
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      entries.set(index, { state: "queued", promise, resolve });
    }
    const result = Promise.all(required.map(index => entries.get(index).promise)).then(results => results.every(Boolean));
    pump();
    return result;
  }

  return {
    focus,
    isReady: indices => indices.every(index => entries.get(index)?.state === "ready"),
  };
}

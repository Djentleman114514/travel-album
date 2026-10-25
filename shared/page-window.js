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

// Fetch in reading order: four spreads ahead, two behind. Readiness only
// depends on the visible faces, never on this speculative work.
export function nearbyFaces(spread, count, direction = 1) {
  const positions = [1, 2, -1, 3, -2, 4];
  return positions.flatMap(offset => spreadFaces(spread + offset * direction, count));
}

export function createPageWindow({ load, apply, release, onChange = () => {}, onError = () => {},
  concurrency = 4, prefetchConcurrency = 2, maxResident = 24 }) {
  const entries = new Map();
  let wanted = new Set(), required = new Set(), priority = [];
  let active = 0, background = 0, clock = 0;

  function discard(index, entry) {
    entries.delete(index);
    if (entry.state === "ready") release(index, entry.asset);
    else { entry.controller?.abort(); entry.resolve(false); }
  }

  function trim() {
    const ready = [...entries].filter(([, entry]) => entry.state === "ready");
    const spare = ready.filter(([index]) => !wanted.has(index))
      .sort((a, b) => a[1].used - b[1].used);
    let excess = ready.length - maxResident;
    for (const [index, entry] of spare) {
      if (excess-- <= 0) break;
      discard(index, entry);
    }
  }

  function pump() {
    while (active < concurrency) {
      const missing = [...required].some(index => entries.get(index)?.state !== "ready");
      const index = priority.find(index => entries.get(index)?.state === "queued"
        && (required.has(index) || (!missing && background < prefetchConcurrency)));
      if (index === undefined) return;
      const entry = entries.get(index);
      const speculative = !required.has(index);
      entry.state = "loading";
      entry.controller = new AbortController();
      active++;
      if (speculative) background++;
      // Start requests immediately, before the readers construct page geometry.
      let job;
      try { job = load(index, { signal: entry.controller.signal, priority: speculative ? "low" : "high" }); }
      catch (error) { job = Promise.reject(error); }
      Promise.resolve(job).then(asset => {
        if (entries.get(index) !== entry) {
          release(index, asset);
          return;
        }
        entry.asset = asset;
        apply(index, asset);
        entry.state = "ready";
        entry.used = ++clock;
        entry.resolve(true);
        trim();
        // Background image downloads do not change the visible spread.
        if (required.has(index)) onChange();
      }).catch(error => {
        if (entries.get(index) !== entry) return;
        if (entry.asset) release(index, entry.asset);
        entry.state = "error";
        entry.resolve(false);
        if (required.has(index)) onError(index, error);
      }).finally(() => {
        active--;
        if (speculative) background--;
        pump();
      });
    }
  }

  function focus(visible, nearby = []) {
    required = new Set(visible);
    priority = [...new Set([...visible, ...nearby])];
    wanted = new Set(priority);
    for (const [index, entry] of entries) {
      if (!priority.length || entry.state === "error"
        || (!wanted.has(index) && entry.state !== "ready")) discard(index, entry);
    }
    for (const index of priority) {
      if (entries.has(index)) { entries.get(index).used = ++clock; continue; }
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      entries.set(index, { state: "queued", promise, resolve, used: ++clock });
    }
    trim();
    const result = Promise.all(visible.map(index => entries.get(index).promise)).then(results => results.every(Boolean));
    pump();
    return result;
  }

  return {
    focus,
    isReady: indices => indices.every(index => entries.get(index)?.state === "ready"),
  };
}

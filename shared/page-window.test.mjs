import assert from "node:assert/strict";
import test from "node:test";
import { createPageWindow, spreadFaces, nearbyFaces } from "./page-window.js";

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(options = {}) {
  const started = [], applied = [], released = [], errors = [], canceled = [], jobs = new Map();
  const cache = createPageWindow({
    load(index, { signal, priority }) {
      started.push(index);
      return new Promise((resolve, reject) => {
        jobs.set(index, { resolve, reject, priority });
        signal.addEventListener("abort", () => { canceled.push(index); reject(new Error("aborted")); }, { once: true });
      });
    },
    apply: index => applied.push(index),
    release: index => released.push(index),
    onError: index => errors.push(index),
    ...options,
  });
  return { cache, started, applied, released, errors, canceled, jobs };
}

test("cover, interior and back-cover windows have valid faces in reading priority", () => {
  assert.deepEqual(spreadFaces(0, 46), [0]);
  assert.deepEqual(spreadFaces(0, 46, 1), [0, 1, 2]);
  assert.deepEqual(spreadFaces(2, 46, 1), [3, 4, 5, 6, 1, 2]);
  assert.deepEqual(spreadFaces(23, 46, 1), [45, 43, 44]);
  assert.deepEqual(nearbyFaces(0, 46), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(nearbyFaces(23, 46, -1), [43, 44, 41, 42, 39, 40, 37, 38]);
});

test("cover readiness never waits for neighbours or shares its initial bandwidth", async () => {
  const h = harness();
  const ready = h.cache.focus([0], nearbyFaces(0, 46));
  assert.deepEqual(h.started, [0]);
  h.jobs.get(0).resolve({});
  assert.equal(await ready, true);
  await tick();
  assert.deepEqual(h.started, [0, 1, 2]);
  assert.equal(h.cache.isReady([0]), true);
  assert.equal(h.cache.isReady([1, 2]), false);
  assert.equal(h.jobs.get(0).priority, "high");
  assert.equal(h.jobs.get(1).priority, "low");
});

test("urgent faces start immediately alongside slow prefetches, with at most four in flight", async () => {
  const h = harness();
  const first = h.cache.focus([0], [1, 2, 3, 4]);
  h.jobs.get(0).resolve({});
  await first;
  await tick();
  assert.deepEqual(h.started, [0, 1, 2]);
  const ready = h.cache.focus([3, 4], [0, 1, 2]);
  assert.deepEqual(h.started, [0, 1, 2, 3, 4]);
  h.jobs.get(3).resolve({});
  h.jobs.get(4).resolve({});
  assert.equal(await ready, true);
  assert.equal(h.cache.isReady([1, 2]), false);
});

test("a distant jump aborts obsolete requests and starts its destination without waiting for the network", async () => {
  const h = harness();
  const old = h.cache.focus([0, 1], [2, 3]);
  const destination = h.cache.focus([30, 31], [32]);
  assert.equal(await old, false);
  await tick();
  assert.deepEqual(h.canceled, [0, 1]);
  assert.deepEqual(h.started, [0, 1, 30, 31]);
  h.jobs.get(30).resolve({});
  h.jobs.get(31).resolve({});
  assert.equal(await destination, true);
  assert.deepEqual(h.applied, [30, 31]);
});

test("recent faces survive a quick return, and the least recently used faces are released at the limit", async () => {
  const h = harness({ maxResident: 3 });
  for (const index of [0, 1, 2]) {
    const ready = h.cache.focus([index]);
    h.jobs.get(index).resolve({});
    await ready;
    await tick();
  }
  assert.equal(await h.cache.focus([0]), true);
  assert.deepEqual(h.started, [0, 1, 2]);
  const ready = h.cache.focus([3]);
  h.jobs.get(3).resolve({});
  await ready;
  assert.deepEqual(h.released, [1]);
  assert.equal(h.cache.isReady([0, 2, 3]), true);
  await h.cache.focus([]);
  assert.equal(h.cache.isReady([0]), false);
  assert.deepEqual(h.released, [1, 0, 2, 3]);
});

test("a failed page can be retried without reloading successful neighbours", async () => {
  const h = harness();
  const first = h.cache.focus([0, 1]);
  h.jobs.get(0).reject(new Error("offline"));
  h.jobs.get(1).resolve({});
  assert.equal(await first, false);
  assert.deepEqual(h.errors, [0]);
  const retry = h.cache.focus([0, 1]);
  assert.deepEqual(h.started, [0, 1, 0]);
  h.jobs.get(0).resolve({});
  assert.equal(await retry, true);
});

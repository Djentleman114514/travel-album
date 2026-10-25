import assert from "node:assert/strict";
import test from "node:test";
import { createPageWindow, spreadFaces } from "./page-window.js";

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const started = [], applied = [], released = [], errors = [], jobs = new Map();
  const cache = createPageWindow({
    load(index) {
      started.push(index);
      return new Promise((resolve, reject) => jobs.set(index, { resolve, reject }));
    },
    apply: index => applied.push(index),
    release: index => released.push(index),
    onError: index => errors.push(index),
  });
  return { cache, started, applied, released, errors, jobs };
}

test("cover, interior and back-cover windows have valid faces in reading priority", () => {
  assert.deepEqual(spreadFaces(0, 46, 1), [0, 1, 2]);
  assert.deepEqual(spreadFaces(2, 46, 1), [3, 4, 5, 6, 1, 2]);
  assert.deepEqual(spreadFaces(23, 46, 1), [45, 43, 44]);
});

test("required faces finish before a slow prefetch, with at most two in flight", async () => {
  const h = harness();
  const ready = h.cache.focus([0, 1], [2, 3]);
  await tick();
  assert.deepEqual(h.started, [0, 1]);
  h.jobs.get(0).resolve({});
  await tick();
  assert.deepEqual(h.started, [0, 1, 2]);
  h.jobs.get(1).resolve({});
  assert.equal(await ready, true);
  assert.equal(h.cache.isReady([0, 1]), true);
  assert.equal(h.cache.isReady([2]), false);
});

test("a fast distant jump cancels queued neighbours and disposes stale completions", async () => {
  const h = harness();
  const old = h.cache.focus([0, 1], [2, 3]);
  await tick();
  const destination = h.cache.focus([30, 31], [32]);
  h.jobs.get(0).resolve({});
  h.jobs.get(1).resolve({});
  assert.equal(await old, false);
  await tick();
  assert.deepEqual(h.started, [0, 1, 30, 31]);
  assert.deepEqual(h.released, [0, 1]);
  h.jobs.get(30).resolve({});
  h.jobs.get(31).resolve({});
  assert.equal(await destination, true);
  assert.deepEqual(h.applied, [30, 31]);
  h.cache.focus([31]);
  assert.ok(h.released.includes(30));
});

test("a failed page can be retried without reloading successful neighbours", async () => {
  const h = harness();
  const first = h.cache.focus([0, 1]);
  await tick();
  h.jobs.get(0).reject(new Error("offline"));
  h.jobs.get(1).resolve({});
  assert.equal(await first, false);
  assert.deepEqual(h.errors, [0]);
  const retry = h.cache.focus([0, 1]);
  await tick();
  assert.deepEqual(h.started, [0, 1, 0]);
  h.jobs.get(0).resolve({});
  assert.equal(await retry, true);
});

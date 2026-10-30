import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createPageLoader, pageWindow, transitionPages } from "./page-loader.js";

test("bounded prefetch deduplicates and lets urgent pages overtake queued work", async () => {
  const started = [], pending = new Map();
  const loader = createPageLoader({ count: 100, concurrency: 2, load: index => {
    started.push(index);
    return new Promise(resolve => pending.set(index, resolve));
  } });
  loader.prefetch([0, 1, 2, 3]);
  await setImmediate();
  assert.deepEqual(started, [0, 1]);
  const urgent = loader.ensure([1, 90, 90]);
  pending.get(0)();
  await setImmediate();
  assert.deepEqual(started, [0, 1, 90]);
  pending.get(90)(); pending.get(1)();
  await urgent;
  await setImmediate();
  assert.equal(loader.ready([1, 90]), true);
  assert.deepEqual(started, [0, 1, 90, 2, 3]);
  pending.get(2)(); pending.get(3)();
  await loader.ensure([0, 1, 2, 3, 90]);
  assert.equal(started.length, 5);
});

test("failed prefetch is retryable and does not mark a page ready", async () => {
  let attempts = 0;
  const loader = createPageLoader({ count: 1, load: () => {
    if (++attempts === 1) throw new Error("offline");
    return "image";
  } });
  loader.prefetch([0]);
  await setImmediate();
  assert.equal(loader.ready([0]), false);
  await loader.ensure([0]);
  assert.equal(loader.ready([0]), true);
  assert.equal(attempts, 2);
});

test("windows cover both sides of turns and clamp at front and back covers", () => {
  assert.deepEqual(pageWindow(0, 108), [0, 1, 2, 3, 4]);
  assert.deepEqual(pageWindow(54, 108), [103, 104, 105, 106, 107]);
  assert.deepEqual(transitionPages(2, 3, 108), [3, 4, 5, 6]);
  assert.deepEqual(transitionPages(3, 2, 108), [3, 4, 5, 6]);
  assert.deepEqual(transitionPages(0, 54, 108), Array.from({ length: 108 }, (_, i) => i));
});

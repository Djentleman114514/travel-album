import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { pageWindow } from "./page-loader.js";

const source = await readFile(new URL("./book.js", import.meta.url), "utf8");
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  let pending = deferred();
  let timer;
  let turned = false;
  const prefetched = [];
  const elements = new Map();
  for (const id of ["#loader", "#page-wait", "#page-wait-copy", "#page-wait-retry", "#prev", "#next"]) {
    elements.set(id, { hidden: true, disabled: false, textContent: "", setAttribute() {} });
  }
  const classes = new Set(["done"]);
  elements.get("#loader").classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
  const context = {
    pageFiles: Array(30).fill("page"), pageWindow, NL: 15, spreadIndex: () => 2,
    pagesLoading: false, waitSequence: 0, retryLoad: null, needsRender: false,
    retryButton: { hidden: true },
    $: id => elements.get(id),
    setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => {},
    pageLoader: { ready: () => false, ensure: () => pending.promise, prefetch: indices => prefetched.push(indices) },
  };
  runInNewContext([
    source.slice(source.indexOf("  function setNavigationDisabled("), source.indexOf("  function prepareTurn(")),
    "globalThis.wait = waitForPages;",
  ].join("\n"), context);
  return { context, elements, classes, prefetched,
    wait: () => context.wait([5, 6], () => { turned = true; }),
    showHint: () => timer(),
    resolve: () => pending.resolve(),
    reject: () => pending.reject(new Error("offline")),
    newAttempt: () => { pending = deferred(); },
    didTurn: () => turned };
}

test("a slow turn keeps the current page visible and continues after loading", async () => {
  const r = setup();
  const waiting = r.wait();
  assert.equal(r.classes.has("done"), true);
  assert.equal(r.didTurn(), false);
  r.showHint();
  assert.equal(r.elements.get("#page-wait").hidden, false);
  assert.equal(r.elements.get("#page-wait-retry").hidden, true);
  r.resolve();
  await waiting;
  assert.equal(r.didTurn(), true);
  assert.equal(r.elements.get("#page-wait").hidden, true);
  assert.equal(r.context.pagesLoading, false);
  assert.deepEqual(Array.from(r.prefetched[0]), pageWindow(2, 30, 8));
});

test("a failed turn offers an inline retry and resumes when the page arrives", async () => {
  const r = setup();
  const waiting = r.wait();
  r.reject();
  await waiting;
  assert.equal(r.didTurn(), false);
  assert.equal(r.classes.has("done"), true);
  assert.equal(r.elements.get("#page-wait-retry").hidden, false);
  assert.equal(r.elements.get("#page-wait").hidden, false);
  r.newAttempt();
  const retry = r.context.retryLoad();
  r.resolve();
  await retry;
  assert.equal(r.didTurn(), true);
  assert.equal(r.elements.get("#page-wait").hidden, true);
});

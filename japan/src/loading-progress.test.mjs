import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createPageLoader, pageRange, transitionPages } from "../../singapore/page-loader.js";

const main = await readFile(new URL("./main.js", import.meta.url), "utf8");
function reader() {
  const pending = new Map();
  const progress = [];
  let assigned;
  const context = {
    selectedBook: {}, loadToken: 0, waitSequence: 0, pageLoader: null, loading: false, retryLoad: null,
    retryButton: { hidden: true }, pageWait: { hidden: true }, pageWaitCopy: {}, pageWaitRetry: {}, chinese: false, pointerStart: null,
    setTimeout, clearTimeout,
    loadingTitle: {}, loadingCopy: {}, loadingPercent: {}, loadingFill: { style: {} },
    loadingProgress: { setAttribute: (_, value) => progress.push(Number(value)) },
    readerText: { preparing: title => title, loading: "Preparing", pageLoading: "Preparing page", pageFailed: "Page failed", loadingPages: (done, total) => `${done}/${total}` },
    bookTitle: book => book.title, document: { querySelector: () => ({ hidden: true }) },
    setLoading: (value, _, initial = true) => { context.loading = value; context.overlay = value && initial; context.pageWait.hidden = true; },
    makePaperMaterial: () => ({ map: null }),
    pageMaterial: (_, source) => new Promise((resolve, reject) => pending.set(source, { resolve, reject })),
    createPageLoader, pageRange, transitionPages,
    flipBook: { scale: {}, progress: 0, currentPage: 0, totalPages: 108,
      setPages: pages => { assigned = pages; }, traverse: () => {} },
    bookRig: { position: {} }, PAGE_STACK_SPACING: 0.0012,
  };
  for (const name of ["clearEdgePreview", "renderLibrary", "resize", "memoizeSheetDeformation", "refreshAllPageNormals", "rememberBook", "updateStatus", "requestRender"]) context[name] = () => {};
  runInNewContext([
    main.slice(main.indexOf("function updateLoadingProgress("), main.indexOf("function renderLibrary(")),
    main.slice(main.indexOf("async function selectBook("), main.indexOf("function refreshAllPageNormals(")),
    "globalThis.loadBook = selectBook; globalThis.navigate = navigateToPage;",
  ].join("\n"), context);
  return { context, pending, progress, materials: () => assigned,
    resolve: source => pending.get(source).resolve({ map: source }) };
}
const book = { id: "test", title: "Japan", ratio: 0.75, pages: Array.from({ length: 108 }, (_, i) => `page-${i}`) };

async function loadAllExcept(r, excluded, finished = new Set()) {
  while (finished.size < book.pages.length - (excluded === null ? 0 : 1)) {
    await setImmediate();
    for (let i = 0; i < book.pages.length; i++) {
      const source = `page-${i}`;
      if (i === excluded || finished.has(i) || !r.pending.has(source)) continue;
      r.resolve(source);
      finished.add(i);
    }
  }
  await setImmediate();
}

test("reader opens only after every face has loaded, even if they finish out of order", async () => {
  const r = reader();
  const loading = r.context.loadBook(book);
  await setImmediate();
  assert.equal(r.context.loading, true);
  assert.equal(r.context.overlay, true);
  assert.equal(r.context.loadingPercent.textContent, "0%");
  assert.equal(r.pending.size, 4);
  r.resolve("page-2");
  const finished = new Set([2]);
  await loadAllExcept(r, 107, finished);
  assert.equal(r.context.loading, true, "the last face is still pending");
  assert.equal(r.context.loadingPercent.textContent, "99%");
  assert.equal(r.pending.size, 108);
  r.resolve("page-107");
  await loading;
  assert.equal(r.context.loading, false);
  assert.equal(r.context.loadingPercent.textContent, "100%");
  assert.equal(r.materials().length, 108);
  assert.deepEqual(Array.from(r.materials(), m => m.map), book.pages);
});

test("a failed initial face can be retried without opening an incomplete book", async () => {
  const r = reader();
  const loading = r.context.loadBook(book);
  await setImmediate();
  r.pending.get("page-1").reject(new Error("offline"));
  await loading;
  assert.equal(r.context.loading, true);
  assert.equal(r.context.retryButton.hidden, false);
  await loadAllExcept(r, 1);
  const retry = r.context.retryLoad();
  await setImmediate();
  r.resolve("page-1");
  await retry;
  assert.equal(r.context.loading, false);
  assert.equal(r.context.retryButton.hidden, true);
});

test("a jump after opening does not request more page images or show loading", async () => {
  const r = reader();
  const loading = r.context.loadBook(book);
  await loadAllExcept(r, null);
  await loading;
  assert.equal(r.pending.size, 108);
  r.context.navigate(12);
  assert.equal(r.context.flipBook.currentPage, 12);
  assert.equal(r.context.loading, false);
  assert.equal(r.context.overlay, false);
  assert.equal(r.pending.size, 108);
});

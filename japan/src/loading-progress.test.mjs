import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createPageLoader, pageWindow, transitionPages } from "../../singapore/page-loader.js";

const main = await readFile(new URL("./main.js", import.meta.url), "utf8");
function reader() {
  const pending = new Map();
  const progress = [];
  let assigned;
  const context = {
    selectedBook: {}, loadToken: 0, pageLoader: null, loading: false, retryLoad: null,
    retryButton: { hidden: true }, chinese: false, pointerStart: null,
    loadingTitle: {}, loadingCopy: {}, loadingPercent: {}, loadingFill: { style: {} },
    loadingProgress: { setAttribute: (_, value) => progress.push(Number(value)) },
    readerText: { preparing: title => title, loadingPages: (done, total) => `${done}/${total}` },
    bookTitle: book => book.title, document: { querySelector: () => ({ hidden: true }) },
    setLoading: value => { context.loading = value; },
    makePaperMaterial: () => ({ map: null }),
    pageMaterial: (_, source) => new Promise((resolve, reject) => pending.set(source, { resolve, reject })),
    createPageLoader, pageWindow, transitionPages,
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

test("reader opens after five faces, preserving out-of-order assignments and the complete book", async () => {
  const r = reader();
  const loading = r.context.loadBook(book);
  await setImmediate();
  assert.equal(r.context.loading, true);
  assert.equal(r.context.loadingPercent.textContent, "0%");
  assert.equal(r.pending.size, 4);
  r.resolve("page-2");
  await setImmediate();
  assert.equal(r.context.loadingPercent.textContent, "20%");
  assert.equal(r.pending.size, 5);
  for (const i of [4, 0, 3, 1]) r.resolve(`page-${i}`);
  await loading;
  assert.deepEqual(r.progress, [0, 20, 40, 60, 80, 100]);
  assert.equal(r.context.loading, false);
  assert.equal(r.pending.size, 5);
  assert.equal(r.materials().length, 108);
  assert.deepEqual(Array.from(r.materials().slice(0, 5), m => m.map), book.pages.slice(0, 5));
  assert.equal(r.materials()[5].map, null);
});

test("failed initial face offers retry and does not open on incomplete artwork", async () => {
  const r = reader();
  const loading = r.context.loadBook(book);
  await setImmediate();
  r.pending.get("page-1").reject(new Error("offline"));
  await setImmediate();
  for (const i of [0, 2, 3, 4]) r.resolve(`page-${i}`);
  await loading;
  assert.equal(r.context.loading, true);
  assert.equal(r.context.retryButton.hidden, false);
  const retry = r.context.retryLoad();
  await setImmediate();
  r.resolve("page-1");
  await retry;
  assert.equal(r.context.loading, false);
  assert.equal(r.context.retryButton.hidden, true);
});

test("jump waits for every swept face before moving the book", async () => {
  const r = reader();
  const loading = r.context.loadBook(book);
  await setImmediate();
  for (let i = 0; i < 5; i++) { r.resolve(`page-${i}`); await setImmediate(); }
  await loading;
  r.context.navigate(12);
  await setImmediate();
  assert.equal(r.context.flipBook.currentPage, 0);
  assert.equal(r.context.loading, true);
  for (let i = 5; i <= 12; i++) { r.resolve(`page-${i}`); await setImmediate(); }
  assert.equal(r.context.flipBook.currentPage, 12);
  assert.equal(r.context.loading, false);
});

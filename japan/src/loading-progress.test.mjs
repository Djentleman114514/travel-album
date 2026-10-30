import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

const main = await readFile(new URL("./main.js", import.meta.url), "utf8");

test("loading progress follows completed pages while keeping reading order", async () => {
  const pending = new Map();
  const progress = [];
  let assigned;
  let visible;
  const context = {
    selectedBook: {}, loadToken: 0,
    loadingTitle: {}, loadingCopy: {}, loadingPercent: {},
    loadingFill: { style: {} },
    loadingProgress: { setAttribute: (_, value) => progress.push(Number(value)) },
    readerText: { preparing: title => title, loadingPages: (done, total) => `${done}/${total}` },
    bookTitle: book => book.title,
    setLoading: value => { visible = value; },
    pageMaterial: (_, source) => new Promise(resolve => pending.set(source, resolve)),
    flipBook: { scale: {}, setPages: pages => { assigned = pages; }, traverse: () => {} },
    bookRig: { position: {} }, PAGE_STACK_SPACING: 0.0012,
  };
  for (const name of ["clearEdgePreview", "renderLibrary", "resize", "memoizeSheetDeformation", "refreshAllPageNormals", "rememberBook", "updateStatus", "requestRender"]) context[name] = () => {};
  runInNewContext([
    main.slice(main.indexOf("function updateLoadingProgress("), main.indexOf("function renderLibrary(")),
    main.slice(main.indexOf("async function selectBook("), main.indexOf("function refreshAllPageNormals(")),
    "globalThis.loadBook = selectBook;",
  ].join("\n"), context);
  const loading = context.loadBook({ id: "test", title: "Japan", ratio: 0.75, pages: ["cover", "left", "right"] });
  assert.equal(visible, true);
  assert.equal(context.loadingPercent.textContent, "0%");
  pending.get("right")("right-material");
  await setImmediate();
  assert.equal(context.loadingPercent.textContent, "33%");
  assert.equal(context.loadingCopy.textContent, "1/3");
  assert.equal(visible, true);
  pending.get("cover")("cover-material");
  pending.get("left")("left-material");
  await loading;
  assert.deepEqual(progress, [0, 33, 66, 100]);
  assert.deepEqual(Array.from(assigned), ["cover-material", "left-material", "right-material"]);
  assert.equal(visible, false);
});

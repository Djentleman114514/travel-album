import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { books, bookUrl, selectedBook } from "./books.js";
import { restoreOrder } from "./shelf-order.js";
import { runInNewContext } from "node:vm";

test("Singapore packages exactly the accepted sequence and all 46 leaf faces", async () => {
  const base = new URL("albums/singapore/", import.meta.url);
  const context = { window: {} };
  runInNewContext(await readFile(new URL("book-data.js", base), "utf8"), context);
  const book = context.window.PHOTOBOOK;
  assert.equal(book.spreads.length, 22);
  assert.equal(book.faithfulDisplay, true);
  assert.equal(book.pageWidth, 768);
  assert.equal(book.pageHeight, 1024);
  assert.equal(book.frontCover.file, "cover-right.webp");
  assert.equal(book.backCover.file, "cover-left.webp");
  assert.deepEqual(Array.from(book.spreads, x => x.id), [
    "s02", "s03", "s04", "s04b", "s05", "s06", "s06b", "s07", "s07b", "s08a", "s08",
    "s09", "s10", "s10b", "s11", "s12", "s13", "s14", "s15", "s16", "s17", "s18",
  ]);
  const faces = [book.frontCover, ...Array.from(book.spreads).flatMap(x => [x.left, x.right]), book.backCover];
  assert.equal(new Set(faces.map(x => x.file)).size, 46);
  for (const face of faces) {
    const path = "assets/pages/" + face.file;
    assert.match(face.file, /^[\w-]+\.webp$/);
    const bytes = await readFile(new URL(path, base));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    const deployed = await readFile(new URL("site/albums/singapore/" + path, import.meta.url));
    assert.ok(bytes.equals(deployed), `missing or stale deployed page: ${path}`);
  }
  assert.deepEqual((await readdir(new URL("assets/pages/", base))).sort(), faces.map(x => x.file).sort());
  const shelf = books.find(x => x.id === "between-facades");
  assert.equal(shelf.pageCount, 46);
  assert.equal(shelf.reader, "albums/singapore/index.html");
  assert.equal(shelf.cover, "albums/singapore/assets/pages/cover-right.webp");
});

test("Singapore deploys its scripts, styles, fonts, and texture dependencies", async () => {
  const base = new URL("site/albums/singapore/", import.meta.url);
  const html = await readFile(new URL("index.html", base), "utf8");
  const css = await readFile(new URL("book.css", base), "utf8");
  const references = [
    ...[...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map(x => x[1]),
    ...[...css.matchAll(/url\("([^"]+)"\)/g)].map(x => x[1]),
    "assets/paper/felt.webp", "assets/paper/cloth.webp",
    "assets/fonts/OFL.txt", "assets/vendor/THREE-LICENSE.txt",
  ];
  for (const reference of references) {
    if (reference.startsWith("data:")) continue;
    assert.ok((await stat(new URL(reference, base))).isFile(), `missing Singapore dependency: ${reference}`);
  }
});

test("the three shelf books have unique IDs and working reader destinations", async () => {
  assert.equal(books.length, 3);
  assert.equal(new Set(books.map((book) => book.id)).size, 3);
  for (const book of books) {
    if (!book.reader) assert.deepEqual(book.pages, []);
    const url = new URL(bookUrl(book.id), import.meta.url);
    assert.equal(selectedBook(url.search), book);
    assert.ok((await stat(new URL(url.pathname, url))).isFile());
  }
});

test("the real photobook's reader, cover, page count, and built assets are available locally", async () => {
  const { books: editions } = await import("./japan-book-art-edition/src/books.js");
  const book = books.find((item) => item.reader);
  assert.ok(book);
  assert.equal(book.pageCount, editions[0].pages.length);
  assert.ok((await stat(new URL(book.cover, import.meta.url))).isFile());
  const reader = new URL(book.reader, import.meta.url);
  const html = await readFile(reader, "utf8");
  const assets = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((match) => match[1]);
  assert.ok(assets.some((asset) => asset.endsWith(".js")));
  for (const asset of assets) {
    assert.ok((await stat(new URL(asset, reader))).isFile(), `missing reader asset: ${asset}`);
  }
});

test("missing and unknown reader IDs do not silently select a different book", () => {
  for (const search of ["", "?book=", "?book=missing", "?book=../outside", "?book=%3Cscript%3E"]) {
    assert.equal(selectedBook(search), null);
  }
});

test("saved arrangements ignore stale IDs and duplicates, appending newly added books", () => {
  const ids = ["a", "b", "c", "new"];
  const saved = ["removed", "c", "c", null, "a", { id: "b" }];
  assert.deepEqual(restoreOrder(ids, saved), ["c", "a", "b", "new"]);
  assert.deepEqual(ids, ["a", "b", "c", "new"]);
  assert.deepEqual(saved, ["removed", "c", "c", null, "a", { id: "b" }]);
});

test("absent or malformed saved arrangements retain the catalog order", () => {
  for (const saved of [null, undefined, false, 12, "c,a,b", { a: 1 }, []]) {
    assert.deepEqual(restoreOrder(["a", "b", "c"], saved), ["a", "b", "c"]);
  }
  assert.deepEqual(restoreOrder([], ["removed"]), []);
});

test("HTML assets, return links, and module imports resolve locally", async () => {
  for (const filename of ["index.html", "book.html", "collection.js", "book.js", "books.js", "shelf-order.js"]) {
    const base = new URL(filename, import.meta.url);
    const source = await readFile(base, "utf8");
    const references = filename.endsWith(".html")
      ? [...source.matchAll(/(?:href|src)="([^"#]+)"/g)].map((match) => match[1])
      : [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      if (reference.startsWith("data:")) continue;
      const url = new URL(reference, base);
      assert.equal(url.protocol, "file:", `${filename}: unexpected external dependency ${reference}`);
      assert.ok((await stat(url)).isFile(), `${filename}: missing ${reference}`);
    }
  }
});

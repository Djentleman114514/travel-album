import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { books, bookUrl, selectedBook } from "./homepage/books.js";
import { restoreOrder } from "./homepage/shelf-order.js";
import { runInNewContext } from "node:vm";

test("Singapore packages exactly the accepted sequence and all 46 leaf faces", async () => {
  const base = new URL("singapore/", import.meta.url);
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

test("Singapore edge previews keep the sheet above the next page at the binding", async () => {
  const base = new URL("singapore/", import.meta.url);
  const source = await readFile(new URL("book.js", base), "utf8");
  const context = { window: {} };
  runInNewContext(await readFile(new URL("book-data.js", base), "utf8"), context);
  runInNewContext(await readFile(new URL("assets/vendor/three-r128.min.js", base), "utf8"), context);
  // Exercise the reader's real geometry and deformation, without a WebGL renderer.
  runInNewContext([
    "const BOOK = window.PHOTOBOOK, PI = Math.PI;",
    "const clamp = (v, a, b) => Math.min(b, Math.max(a, v));",
    "const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };",
    source.slice(source.indexOf("  const H ="), source.indexOf("  // Every visible face")),
    source.slice(source.indexOf("  function leafGeometry"), source.indexOf("  function faceMap")),
    source.slice(source.indexOf("  const phiR ="), source.indexOf("  // ---------- state")),
    `globalThis.physics = { deformPage, PT, HUMP, COLS, ROWS,
      createLeaf: (te, curl = 0, grabY = 0) => ({
        te, curl, grabY, ds: DS, dy: 0, wave: new Float32Array(ROWS + 1),
        geo: leafGeometry().front, rib: ribbonGeometry(), maps: [null, null], edge: { material: {} },
      }),
    };`,
  ].join("\n"), context);
  const { deformPage, createLeaf, PT, HUMP, COLS, ROWS } = context.physics;
  const pageCount = context.window.PHOTOBOOK.spreads.length - 1;
  const peek = Number(source.match(/L\.kind === "board" \? [\d.]+ : ([\d.]+);/)[1]);
  const curl = Number(source.match(/L\.curlTarget = side \* ([\d.]+)/)[1]);

  for (let i = 1; i <= pageCount; i++) {
    const hR = (pageCount - i + 0.5) * PT, hL = (i - 0.5) * PT;
    for (const side of [1, -1]) {
      if ((side === 1 && i === pageCount) || (side === -1 && i === 1)) continue;
      const below = createLeaf(side === 1 ? 0 : 1);
      deformPage(below, hR - (side === 1 ? PT : 0), hL - (side === -1 ? PT : 0), HUMP, HUMP);
      const stack = below.geo.attributes.position.array;
      for (const grabY of [-0.9, 0, 0.9]) {
        for (const amount of [peek / 4, peek / 2, peek]) {
          const leaf = createLeaf(side === 1 ? amount : 1 - amount, side * curl, grabY);
          deformPage(leaf, hR, hL, HUMP, HUMP);
          const positions = leaf.geo.attributes.position.array;
          let minGap = Infinity;
          for (let row = 0; row <= ROWS; row++) {
            let col = 0;
            for (let x = 0; x <= COLS; x++) {
              const k = (row * (COLS + 1) + x) * 3;
              // Match world-space x, because a bent page contracts horizontally.
              while (col < COLS - 1 && side * stack[(row * (COLS + 1) + col + 1) * 3] < side * positions[k]) col++;
              const j = (row * (COLS + 1) + col) * 3;
              const u = (positions[k] - stack[j]) / (stack[j + 3] - stack[j]);
              if (u < 0 || u > 1) continue;
              const z = stack[j + 2] + u * (stack[j + 5] - stack[j + 2]);
              minGap = Math.min(minGap, positions[k + 2] - z);
            }
          }
          assert.ok(Number.isFinite(minGap) && minGap > 0, `page ${i}, side ${side}, grab ${grabY}, peek ${amount}: gap ${minGap}`);
          leaf.geo.dispose();
          leaf.rib.dispose();
        }
      }
      below.geo.dispose();
      below.rib.dispose();
    }
  }
});

test("the three shelf books have unique IDs and working reader destinations", async () => {
  const deployed = new URL("site/", import.meta.url);
  assert.equal(books.length, 3);
  assert.equal(new Set(books.map((book) => book.id)).size, 3);
  for (const book of books) {
    if (!book.reader) assert.deepEqual(book.pages, []);
    const url = new URL(bookUrl(book.id), deployed);
    assert.equal(selectedBook(url.search), book);
    assert.ok((await stat(new URL(url.pathname, url))).isFile());
  }
});

test("the real photobook's reader, cover, page count, and built assets are available locally", async () => {
  const { books: editions } = await import("./japan/src/books.js");
  const deployed = new URL("site/", import.meta.url);
  const book = books.find((item) => item.id === "after-the-lights");
  assert.ok(book);
  assert.equal(book.pageCount, editions[0].pages.length);
  assert.ok((await stat(new URL(book.cover, deployed))).isFile());
  const reader = new URL(book.reader, deployed);
  const html = await readFile(reader, "utf8");
  const assets = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((match) => match[1]);
  assert.ok(assets.some((asset) => asset.endsWith(".js")));
  for (const asset of assets) {
    assert.ok((await stat(new URL(asset, reader))).isFile(), `missing reader asset: ${asset}`);
  }
});

test("Japan deploys chapter artwork overrides and the matching reader leaves", async () => {
  const { books: editions } = await import("./japan/src/books.js");
  const book = editions[0];
  const base = new URL("japan/public/", import.meta.url);
  const deployed = new URL("site/japan-book-art-edition/dist/", import.meta.url);
  const replacements = book.chapters.filter((item) => item.id.startsWith("new-"));
  assert.equal(replacements.length, 42);
  assert.deepEqual(book.pages.slice(0, 1), ["assets/pages/cover-right.webp"]);
  assert.equal(book.pages.at(-1), "assets/pages/cover-left.webp");
  for (const id of ["morning-panorama", "festival-panorama", "cab-panorama", ...Array.from({ length: 8 }, (_, index) => `yn0${index + 1}`)]) {
    assert.ok(book.chapters.some((item) => item.id === id), `missing retained spread: ${id}`);
  }
  for (const chapter of replacements) {
    assert.equal(chapter.artwork, `assets/spreads/${chapter.id}.webp`);
    for (const side of ["left", "right"]) {
      assert.ok(book.pages.includes(`assets/pages/${chapter.id}-${side}.webp`));
    }
  }
  for (const path of [
    ...book.chapters.map((item) => item.artwork || `assets/spreads/${item.id}.png`),
    ...book.pages,
  ]) {
    const bytes = await readFile(new URL(path, base));
    assert.ok(bytes.equals(await readFile(new URL(path, deployed))), `stale Japan artwork: ${path}`);
    if (path.endsWith(".webp")) {
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    }
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
    const base = new URL("homepage/" + filename, import.meta.url);
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { constrainTurningPage, settlePage } from "./page-collision.js";

// Load the installed engine with its CommonJS modifier dependency, matching
// Vite's interop without requiring a browser or substituting fake geometry.
const modifiers = createRequire(import.meta.url)("three.modifiers");
const context = { h: THREE, _: mergeGeometries, n: modifiers, m: modifiers.UserDefined, c: modifiers.ModConstant };
const source = (await readFile(new URL("../node_modules/quick_flipbook/dist/flipbook.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace(/export \{[\s\S]*$/, "globalThis.FlipBook = y;");
runInNewContext(source, context);

function createBook() {
  const book = new context.FlipBook({ yBetweenPages: 0.0012, pageSubdivisions: 16 });
  book.setPages(Array(108).fill(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })));
  for (const sheet of book) {
    const flip = sheet.flip.bind(sheet);
    sheet.flip = (progress, direction, intensity) => {
      flip(progress, direction, intensity);
      settlePage(sheet, progress);
    };
  }
  return book;
}

function intersections(book) {
  book.updateMatrixWorld(true);
  const sheets = [...book];
  const index = Math.floor(book.progress);
  const moving = sheets[index].page;
  const supports = [sheets[index - 1]?.page, sheets[index + 1]?.page].filter(Boolean);
  const positions = moving.geometry.attributes.position;
  const point = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let collisions = 0;
  // Sample full rows at the top, center and bottom against actual triangles.
  for (const row of [0, 8, 16]) {
    for (let column = 0; column <= 16; column += 1) {
      point.fromBufferAttribute(positions, row * 17 + column).applyMatrix4(moving.matrixWorld);
      ray.set(new THREE.Vector3(point.x, 2, point.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(supports, false)[0];
      if (hit && point.y < hit.point.y - 1e-6) collisions += 1;
    }
  }
  return collisions;
}

test("turning pages stay above the resting stacks in both directions, including hover lifts", () => {
  const book = createBook();
  let originalCollisions = 0;
  for (const index of [0, 1, 13, 27, 41, 53]) {
    for (const fraction of [0.055, 0.25, 0.5, 0.75, 0.945]) {
      for (const direction of [-1, 1]) {
        book.progress = direction > 0 ? index : index + 1;
        book.progress = index + fraction;
        originalCollisions += intersections(book);
        constrainTurningPage(book);
        assert.equal(intersections(book), 0, `sheet ${index}, fraction ${fraction}, direction ${direction}`);
      }
    }
  }
  assert.ok(originalCollisions > 0, "the regression must reproduce the engine's original paper intersections");
});

test("resting paper has the same geometry after forward and backward turns", () => {
  const book = createBook();
  book.progress = 40;
  book.progress = 41;
  const forward = [...book].map(sheet => Array.from(sheet.page.geometry.attributes.position.array));
  book.progress = 42;
  book.progress = 41;
  [...book].forEach((sheet, index) => {
    assert.deepEqual(Array.from(sheet.page.geometry.attributes.position.array), forward[index]);
  });
  assert.equal(constrainTurningPage(book), false);
});

test("coastal spread has no triangle interiors poking through near the spine", () => {
  const book = createBook();
  const ray = new THREE.Raycaster();
  for (const progress of [42.945, 42.99, 43.055]) {
    for (const direction of [-1, 1]) {
      book.progress = direction > 0 ? Math.floor(progress) : Math.ceil(progress);
      book.progress = progress;
      constrainTurningPage(book);
      book.updateMatrixWorld(true);
      const sheets = [...book];
      const index = Math.floor(progress);
      const moving = sheets[index].page;
      const supports = [sheets[index - 1]?.page, sheets[index + 1]?.page].filter(Boolean);
      // Probe between mesh vertices: vertex-only tests missed this defect.
      for (const z of [-0.49, 0, 0.49]) {
        for (let x = -0.99; x <= 0.99; x += 0.005) {
          ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
          const paper = ray.intersectObject(moving, false)[0];
          const support = ray.intersectObjects(supports, false)[0];
          if (paper && support) {
            assert.ok(paper.point.y >= support.point.y - 1e-6,
              `progress ${progress}, direction ${direction}, x ${x}, z ${z}`);
          }
        }
      }
      assert.equal(constrainTurningPage(book), false, "a parked hover must not keep lifting the page");
    }
  }
});

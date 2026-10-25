import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const album = join(root, "japan-book-art-edition");
const site = join(root, "site");

rmSync(site, { recursive: true, force: true });
if (!existsSync(join(album, "node_modules", "vite"))) {
  execFileSync("npm", ["ci"], { cwd: album, stdio: "inherit" });
}
execFileSync("npm", ["run", "build"], { cwd: album, stdio: "inherit" });

mkdirSync(site, { recursive: true });
for (const file of [
  "index.html",
  "collection.css",
  "collection.js",
  "shelf-order.js",
  "books.js",
  "book.html",
  "book.js",
  "book.css",
]) {
  copyFileSync(join(root, file), join(site, file));
}

const albumOutput = join(site, "japan-book-art-edition", "dist");
mkdirSync(dirname(albumOutput), { recursive: true });
cpSync(join(album, "dist"), albumOutput, { recursive: true });
const albums = join(root, "albums");
if (existsSync(albums)) cpSync(albums, join(site, "albums"), { recursive: true });
console.log(`Website built to ${site}`);

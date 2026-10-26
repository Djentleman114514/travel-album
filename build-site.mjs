import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const homepage = join(root, "homepage");
const japan = join(root, "japan");
const singapore = join(root, "singapore");
const site = join(root, "site");

rmSync(site, { recursive: true, force: true });
if (!existsSync(join(japan, "node_modules", "vite"))) {
  execFileSync("npm", ["ci"], { cwd: japan, stdio: "inherit" });
}
execFileSync("npm", ["run", "build"], { cwd: japan, stdio: "inherit" });

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
  copyFileSync(join(homepage, file), join(site, file));
}

const albumOutput = join(site, "japan-book-art-edition", "dist");
mkdirSync(dirname(albumOutput), { recursive: true });
cpSync(join(japan, "dist"), albumOutput, { recursive: true });
cpSync(singapore, join(site, "albums", "singapore"), { recursive: true });
console.log(`Website built to ${site}`);

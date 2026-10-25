import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

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
cpSync(join(root, "shared"), join(site, "shared"), {
  recursive: true,
  filter: source => !source.endsWith(".test.mjs"),
});

// Version every published dependency, including unchanged filenames in public/.
// Image bytes are copied unchanged; only their request URLs receive a version.
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)]);
}
const files = filesIn(site);
const hash = createHash("sha256");
for (const file of files) hash.update(relative(site, file)).update("\0").update(readFileSync(file));
const version = hash.digest("hex").slice(0, 16);
for (const file of files) {
  if (!/\.(?:html|css|js)$/.test(file)) continue;
  let text = readFileSync(file, "utf8").replaceAll("__SITE_ASSET_VERSION__", version);
  if (file.endsWith(".html")) {
    text = text.replace(/((?:href|src)=["'])([^"'?]+\.(?:js|css|woff2?|ttf|svg|png|webp))(["'])/g,
      (_, prefix, url, quote) => `${prefix}${url}?v=${version}${quote}`);
  } else if (file.endsWith(".js")) {
    text = text.replace(/(\bfrom\s*["']|\bimport\s*["'])(\.[^"'?]+\.js)(["'])/g,
      (_, prefix, url, quote) => `${prefix}${url}?v=${version}${quote}`);
  } else {
    text = text.replace(/(url\(["']?)([^)'"?]+\.(?:woff2?|ttf|svg|png|webp))(["']?\))/g,
      (_, prefix, url, suffix) => `${prefix}${url}?v=${version}${suffix}`);
  }
  writeFileSync(file, text);
}
console.log(`Website built to ${site}`);

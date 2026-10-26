# Repository Guidelines

## Project Structure & Module Organization

- `homepage/` contains the bookshelf UI, shared reader shell, and album catalog (`books.js`).
- `japan/src/` contains the Vite/Three.js/Quick FlipBook reader and its tests. Published artwork lives in `japan/public/assets/`; editable PNG pages live in `japan/source-assets/pages-png/`.
- `singapore/` contains a standalone reader, `book-data.js`, and bundled WebP pages, fonts, textures, and vendor scripts.
- `build-site.mjs` assembles `site/`. Treat `site/` and `japan/dist/` as generated output; edit their source directories instead.
- `.local-workspace/` and `.work/` hold ignored local materials.

## Build, Test, and Development Commands

Use Node.js/npm and Python 3.9+; run commands from the repository root unless noted.

- `npm run build`: installs Japan dependencies with `npm ci` when needed, builds that reader, and assembles the complete website.
- `npm run dev`: builds the website and serves it at `http://127.0.0.1:4180/`.
- `python3 serve.py --no-browser`: serves an existing build without opening a browser.
- `npm test`: runs root integration and catalog tests.
- `npm --prefix japan run dev`: starts Vite for Japan-only development after installing its dependencies.
- `npm --prefix japan test`: runs reader interaction and dependency-contract tests.

## Coding Style & Naming Conventions

Follow surrounding code: JavaScript uses two-space indentation, double quotes, semicolons, and camelCase identifiers; Python uses four spaces. Preserve existing ES-module boundaries and Singapore's `window.PHOTOBOOK` data interface. No formatter or linter is configured.

Use lowercase, hyphenated album IDs and asset names such as `cover-right.webp` or `s04b-left.webp`. Keep left/right page pairs and explicit reading order consistent with album data.

## Testing Guidelines

Tests use Node's built-in `node:test` and strict assertions. Root checks live in `test.mjs`; Japan tests use `src/*.test.mjs`. Build before running root tests because they inspect deployed assets. No coverage threshold is configured. Add regression checks for changed behavior, and manually preview layout, cover selection, page turns, and bookshelf navigation for visual changes.

## Commit & Pull Request Guidelines

History uses imperative summaries and occasional prefixes such as `docs:` and `refactor:`. Write focused commits describing the change. PRs should explain the result, link related issues when applicable, list validation commands and results, and include screenshots for visual changes.

## Assets & Deployment

Register albums in `homepage/books.js` and update build copying for new directories. Preserve published reader URLs and root-relative catalog paths. Deploy from the repository root using `vercel.json`. Keep private originals out of Git and retain bundled third-party licenses.

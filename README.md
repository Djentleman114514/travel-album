# Travel Album

A Vite-powered 3D photo album built with Three.js and Quick FlipBook.

## Run locally

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

The static site is generated in `dist/`.

## Deploy with Vercel

Import this repository in Vercel. Use the repository root as the project root. Vercel detects Vite; the build command is `npm run build` and the output directory is `dist`.

## Album content

Book chapter data is in `src/books.js`. The reader uses spread artwork from `public/assets/spreads/` and page images from `public/assets/pages/`. Add new chapter data and its images there to extend the album.

The published version contains designed album artwork. It does not include the source photographs.

## Licenses

See `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES/` for dependency notices and license texts.

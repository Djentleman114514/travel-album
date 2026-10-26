// Finished local photobooks and one remaining sample volume.
export const books = [
    {
    id: "between-facades",
    title: "Singapore",
    paper: "#e6dcc7",
    ink: "#21534d",
    height: 0.78,
    cover: "albums/singapore/assets/pages/cover-right.webp",
    reader: "albums/singapore/index.html",
    pageCount: 46,
    description: "Singapore, March 2026",
  },
  {
    id: "after-the-lights",
    title: "Japan",
    paper: "#4b4453",
    ink: "#b0a8b9",
    height: 0.91,
    cover: "japan-book-art-edition/dist/assets/pages/cover-right.webp",
    reader: "japan-book-art-edition/dist/index.html",
    pageCount: 72,
    description: "Japan, August 2026",
  },
  {
    id: "book-03",
    title: "Book 03",
    paper: "#d34530",
    ink: "#171916",
    height: 0.6,
    pages: [],
    description: "示例书 · 暂无内容",
  },
];

export function bookUrl(id) {
  return `book.html?book=${encodeURIComponent(id)}`;
}

export function selectedBook(search) {
  const id = new URLSearchParams(search).get("book");
  return books.find((book) => book.id === id) ?? null;
}

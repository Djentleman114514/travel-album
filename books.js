// The first volume opens the existing local 3D photobook. The other two are samples.
export const books = [
  {
    id: "after-the-lights",
    title: "After the Lights",
    paper: "#d9dcc7",
    ink: "#294438",
    height: 0.78,
    cover: "japan-book-art-edition/dist/assets/pages/cover-right.webp",
    reader: "japan-book-art-edition/dist/index.html",
    pageCount: 72,
    description: "Japan, August 2026",
  },
  {
    id: "book-02",
    title: "Book 02",
    paper: "#232b2c",
    ink: "#ece9dd",
    height: 0.91,
    pages: [],
    description: "示例书 · 暂无内容",
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

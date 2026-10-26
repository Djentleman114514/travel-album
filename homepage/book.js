import { selectedBook } from "./books.js";

const book = selectedBook(window.location.search);
const title = book?.title ?? "未找到这本书";

document.title = `${title} — Photo Books Library`;
document.querySelector("#reader-title").textContent = title;
document.querySelector("#empty-title").textContent = book ? book.title : title;
document.querySelector("#empty-description").textContent = book
  ? "这是一本示例书，尚未添加照片。"
  : "请返回书架，选择一本相册。";

if (book?.reader) {
  const frame = document.querySelector("#book-frame");
  frame.title = `${book.title} — 3D 相册阅读器`;
  frame.src = book.reader;
  frame.hidden = false;
  document.querySelector(".empty-book").hidden = true;
  document.body.classList.add("has-reader");
}

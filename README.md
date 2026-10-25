# 私人照片书架

这个仓库是一整个网站。访问网站根地址会先打开书架目录；目前书架收录日本旅行相册 “After the Lights” 与新加坡相册 “Between facades”。日本源码在 `japan-book-art-edition/` 子目录，新加坡阅读器在 `albums/singapore/`，包含35张照片、46面，使用固定无涂层纸的3D阅读器。新加坡页图为原尺寸 768 × 1024 的 Q92 WebP；原始 PNG、照片和历史母版留在本地创作工作区。

## 本地运行

在仓库根目录运行：

```sh
npm run dev
```

需要 Python 3.9 或更高版本。访问 <http://127.0.0.1:4180/>，也可双击 `打开书架.command`。

## 新增一本相册

1. 把相册源码放进自己的子目录，例如 `albums/taiwan/`；构建后的阅读器和图片也保存在这个目录下。
2. 在根目录 `books.js` 的 `books` 数组添加一项，设置唯一的 `id`、`title`、`paper`、`ink`、`height`、`cover`、`reader`、`pageCount` 和 `description`。
3. `cover` 和 `reader` 使用相对于网站根目录的路径。用 `npm run build` 构建，再运行 `npm test` 确认书架链接有效。
4. 把更新提交并推送到 `main`。Vercel 会构建网站并自动发布。

## 构建和发布

`npm run build` 会先安装并构建 `japan-book-art-edition/` 相册，再将书架首页、日本相册和 `albums/` 下的本地阅读器组装到 `site/`。Vercel 使用仓库根目录的 `vercel.json`，将 `site/` 发布为网站根目录。不要将相册子目录单独设为 Vercel 的项目根目录。

## 目录说明

- 根目录的 `index.html`、`books.js`、`collection.*`、`book.*` 和 `shelf-order.js`：书架网站。
- `japan-book-art-edition/`：当前日本旅行相册源码、设计资源和依赖配置。
- `albums/singapore/`：新加坡阅读器、46 张 WebP 页图和运行所需的字体、脚本、纹理及许可证。
- `japan-book-art-edition/dist/`、`site/`：构建生成内容，不手工编辑。
- `文件清单.md`：主要文件和目录的用途索引。

来源和许可证：书架使用的上游 MIT 许可证见 `LICENSE-library`；相册的第三方许可见 `japan-book-art-edition/THIRD_PARTY_NOTICES.md`。

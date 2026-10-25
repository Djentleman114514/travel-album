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

两本相册共用 `shared/page-window.js`：仅等待当前可见页图；封面在 HTML 中提前请求，并在构造页片前启动加载。当前页完成后，按阅读方向预取前方四跨页和后方两跨页，后台最多两张并发，总并发最多四张，给临时需要的可见页保留请求容量。近期读过的最多24面纹理继续缓存，超限后释放窗口外最久未用的纹理。新加坡的纸纹在相册出现后再加载，字体和纸纹不阻塞封面。目录中的远距离跳转直接显示目标跨页，不会翻过尚未加载的整段页面。加载失败时可以点击 Retry 重试。手机使用较低的像素比、阴影分辨率和页面细分，新加坡阅读器静止时也会停止动画循环。

现有 WebP 文件在构建时原样复制。构建程序根据发布内容计算版本号，给脚本、样式、字体和图片 URL 添加 `?v=`；Vercel 只对带有效版本号的静态资源设置长期缓存。更新相册后版本号会变，HTML 页面保持正常更新策略。`npm test` 检查发布资源和加载调度；日本阅读器的手势与渲染检查可用 `npm test --prefix japan-book-art-edition` 运行。

## 目录说明

- 根目录的 `index.html`、`books.js`、`collection.*`、`book.*` 和 `shelf-order.js`：书架网站。
- `japan-book-art-edition/`：当前日本旅行相册源码、设计资源和依赖配置。
- `albums/singapore/`：新加坡阅读器、46 张 WebP 页图和运行所需的字体、脚本、纹理及许可证。
- `japan-book-art-edition/dist/`、`site/`：构建生成内容，不手工编辑。
- `文件清单.md`：主要文件和目录的用途索引。

来源和许可证：书架使用的上游 MIT 许可证见 `LICENSE-library`；相册的第三方许可见 `japan-book-art-edition/THIRD_PARTY_NOTICES.md`。

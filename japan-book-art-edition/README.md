# 日本旅行相册子项目

这是整站中的一本摄影相册，使用 Vite、Three.js 和 Quick FlipBook 构建。网站首页是仓库根目录的书架；不要把本子目录单独设成线上网站根目录。

## 本地运行

```sh
npm install
npm run dev
```

## 构建

```sh
npm run build
```

静态构建文件会生成在 `dist/` 目录中。

## 部署到 Vercel

网站统一从仓库根目录构建与部署。运行 `npm run build` 会调用本子项目的 Vite 构建，并将结果放入 `dist/`，再由根目录的 `build-site.mjs` 组装到网站发布目录。

## 相册内容

章节数据位于 `src/books.js`。相册使用 `public/assets/spreads/` 中的跨页作品图，以及 `public/assets/pages/` 中的页面图片。可以在对应目录添加图片，并更新章节数据来扩展相册。

已发布的相册包含设计完成的作品图，不包含原始照片。

## 许可证

第三方依赖的声明和许可证文本见 `THIRD_PARTY_NOTICES.md` 与 `THIRD_PARTY_LICENSES/`。项目模板许可证见 `LICENSE-template`。

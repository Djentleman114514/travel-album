# 日本旅行相册

这是一个使用 Vite、Three.js 和 Quick FlipBook 构建的 3D 互动照片书项目。

**在线体验：** [www.mochaweb.top](https://www.mochaweb.top/)

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

在 Vercel 中导入此 GitHub 仓库，并将仓库根目录设为项目目录。Vercel 会识别这是一个 Vite 项目；构建命令使用 `npm run build`，输出目录使用 `dist`。

项目连接到 GitHub 后，推送到 Vercel 生产分支的修改会自动触发部署。部署成功后，线上网站会更新。

## 相册内容

章节数据位于 `src/books.js`。相册使用 `public/assets/spreads/` 中的跨页作品图，以及 `public/assets/pages/` 中的页面图片。可以在对应目录添加图片，并更新章节数据来扩展相册。

已发布的相册包含设计完成的作品图，不包含原始照片。

## 许可证

第三方依赖的声明和许可证文本见 `THIRD_PARTY_NOTICES.md` 与 `THIRD_PARTY_LICENSES/`。项目模板许可证见 `LICENSE-template`。

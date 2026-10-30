# 私人照片书架

这是相册网站的统一仓库。访问网站根地址会打开书架首页，目前收录日本旅行相册 “After the Lights” 与新加坡相册 “Between facades”。源码分在 `homepage/`、`japan/`、`singapore/` 三个目录。网站发布路径保持原样；原始照片和制作草稿留在本地资料区。

## 本地运行

在仓库根目录运行：

```sh
npm run dev
```

需要 Python 3.9 或更高版本。访问 <http://127.0.0.1:4180/>，也可双击 `打开书架.command`。

## 新增一本相册

1. 把相册源码放进一个独立目录，例如 `taiwan/`。
2. 在 `homepage/books.js` 的 `books` 数组添加一项，设置唯一的 `id`、`title`、`paper`、`ink`、`height`、`cover`、`reader`、`pageCount` 和 `description`。
3. `cover` 和 `reader` 使用相对于网站根目录的路径。用 `npm run build` 构建，再运行 `npm test` 确认书架链接有效。
4. 把更新提交并推送到 `main`。Vercel 会构建网站并自动发布。

## 构建和发布

`npm run build` 会先安装并构建 `japan/`，再将首页、日本相册和新加坡相册组装到 `site/`，并保持现有网站 URL。Vercel 使用仓库根目录的 `vercel.json`，将 `site/` 发布为网站根目录。不要将某一本相册子目录单独设为 Vercel 项目根目录。

## 目录说明

- `homepage/`：书架首页源码。
- `japan/`：日本旅行相册源码、设计资源和依赖配置。
- `singapore/`：新加坡阅读器、46 张 WebP 页图及运行所需的字体、脚本、纹理和许可证。
- `japan/dist/`、`site/`：构建生成内容，不手工编辑。
- `.local-workspace/`：本机原图、制作稿和旧工作区备份；已加入 Git 忽略规则。
- `文件清单.md`：主要文件和目录的用途索引。

来源和许可证：书架使用的上游 MIT 许可证见 `LICENSE-library`；日本相册的第三方许可见 `japan/THIRD_PARTY_NOTICES.md`。

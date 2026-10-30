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

## 阅读器图片与按需加载

两套阅读器共用 `singapore/page-loader.js`：封面入口先加载 5 张页图，随后在后台预取当前位置前后各 8 组跨页，最多同时请求 4 张。翻页所需图片未完成时会保留当前画面，短暂显示状态并等待；跨多页的跳转会先加载动画经过的页面。等待可取消，加载失败可重试，阅读版缺失时自动回退到原有页图。新加坡册从章节链接进入时，只加载目标章节附近的页面；字体不阻塞阅读入口。

`assets/pages-reader/` 保存 Q85 WebP 阅读版，尺寸保持 768 × 1024；原有 `assets/pages/`、放大跨页和原照片图库继续保留。当前页图总量：日本 25.55 → 17.09 MiB，新加坡 11.73 → 8.09 MiB；封面入口的前 5 张分别为 0.83、0.88 MiB。这些是资源体积，不代表线上实测耗时。

更新原有页图或阅读顺序后，用 Python + Pillow 重新生成阅读版：

```sh
python3 scripts/prepare-reader-pages.py
npm run build
npm test
npm --prefix japan test
```

导出脚本优先使用能精确复现原 Q92 页图的本地 PNG；没有匹配 PNG 时从现有 WebP 导出，不覆盖原件。当前日本册 24 张、新加坡册 46 张使用 PNG 来源，日本册其余 84 张使用现有 WebP。导出来源报告保存在忽略的 `.work/reader-assets-report.json`；公开的 `pages-reader/manifest.json` 只包含文件哈希，测试会检查阅读版是否与原件版本匹配。阅读版随仓库提交，正常部署不依赖 Pillow 或本地 PNG。

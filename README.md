# Huayu · 个人博客

一个使用原生 HTML、CSS、JavaScript 搭建的静态个人博客，直接部署在 GitHub Pages 上。

- 没有构建步骤，推送到 `main` 分支即可发布。
- 把 Markdown 文件放进 `notes/` 文件夹，网站会自动发现并展示。
- 支持深色模式、全文搜索、标签筛选、文章目录、代码高亮、Mermaid 图表和阅读进度。
- Markdown 解析、语法高亮等依赖已经放在本地，不依赖外部 CDN。

## 写一篇新笔记

1. 在 `notes/` 中新建一个 `.md` 文件。
2. 可以直接写正文，也可以加上一段可选的 frontmatter：

```yaml
---
title: 今天学到的一件事
date: 2026-10-27
tags:
  - 随想
  - 学习
description: 一两句话介绍这篇笔记。
---

正文从这里开始。
```

3. 提交并推送：

```bash
git add notes
git commit -m "add a new note"
git push
```

刷新网站即可看到。只有 `title` 是建议填写的，其他字段都可以省略。完整说明见 [`notes/README.md`](notes/README.md)。

## 本地预览

因为笔记是通过 `fetch` 读取的，本地预览时需要启动一个静态服务器，不能直接双击打开 `index.html`：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000>。

> 在本地新增但还没有推送的笔记，GitHub API 还看不到它。推送到 GitHub 后会自动出现；若只是想在本地测试，可以手动把这条记录加入 `notes/_index.json`，或临时修改 `assets/js/app.js` 中的读取逻辑。

## 自定义站点

- **站点名称、简介、文案**：主要位于 `index.html` 和 `assets/js/app.js` 的页面模板中。
- **GitHub 仓库 / 分支**：在 `assets/js/app.js` 顶部的 `CONFIG` 中修改 `repo`、`branch` 和 `notesDir`。
- **颜色、字体、间距**：在 `assets/css/style.css` 顶部的 CSS 变量中修改。
- **示例笔记**：可以直接删除 `notes/welcome.md` 和 `notes/markdown-guide.md`，同时可以清理 `notes/_index.json` 中的后备记录。

## 笔记自动发现原理

页面加载时，会请求 GitHub 的仓库文件树接口，找出 `notes/` 下所有公开的 `.md` / `.markdown` 文件，再读取每篇文件的 frontmatter 生成列表。文件以 `.` 或 `_` 开头，或位于 `drafts/` 中，以及 `README.md`，都不会显示。

GitHub API 无法访问时，会使用 `notes/_index.json` 作为后备目录。这个文件不需要在每次添加笔记时手动更新；它主要保证在网络受限时，已有内容仍然能展示。若你希望后备目录也始终完整，可以在新增笔记后顺手更新它。

## 技术说明

- Markdown：[marked](https://github.com/markedjs/marked)（本地文件）
- HTML 安全过滤：[DOMPurify](https://github.com/cure53/DOMPurify)（本地文件）
- 代码高亮：[highlight.js](https://highlightjs.org/)（本地文件）
- 图表渲染：[Mermaid](https://mermaid.js.org/)（本地文件，仅在笔记包含图表时加载）
- 字体使用系统字体，不加载外部资源
- 所有依赖许可证位于 `assets/vendor/`

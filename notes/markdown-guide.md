---
title: Markdown 写作小抄
date: 2026-10-24
tags:
  - Markdown
  - 指南
description: 一份给这个博客准备的 Markdown 速查笔记，也顺便展示页面里的各种排版样式。
---

这份笔记有两个用途：一是记录 Markdown 的常用写法，二是让这个博客的标题、代码、表格和引用都出来露个面。

## 标题与段落

用一到六个 `#` 标记不同层级的标题：

```markdown
# 一级标题
## 二级标题
### 三级标题
```

段落之间空一行即可。需要换行时，可以在行末留两个空格，或者使用 HTML 的 `<br>`。

## 强调与链接

你可以写 **粗体**、*斜体*、~~删除线~~，以及 `行内代码`。

链接也很简单：

```markdown
[GitHub](https://github.com/huayu-L)
```

也可以链接到另一篇笔记，例如 [写在开始](./welcome.md)。网站会自动把它转换成站内链接。

## 列表

无序列表：

- 一张纸
- 一支笔
- 一个安静的下午

有序列表：

1. 打开编辑器
2. 写下第一行
3. 发布

任务列表也很适合用来记录进度：

- [x] 搭好博客
- [x] 写下第一篇笔记
- [ ] 慢慢填满这里

## 引用

> 我们写作，是为了更好地思考。
>
> 引用可以很长，也可以嵌套其他 Markdown 元素，比如 **粗体** 和 [链接](https://developer.mozilla.org/zh-CN/docs/Web/HTML)。

## 代码

行内代码适合写 `const answer = 42` 这样的句子。多行代码会带上语言标签和复制按钮：

```js
function greet(name) {
  const message = `你好，${name}。`;
  console.log(message);
  return message;
}

greet('未来的自己');
```

```css
.article-title {
  font-family: var(--serif);
  letter-spacing: -0.05em;
}
```

```bash
git add .
git commit -m "add a new note"
git push
```

## 表格

| 语法 | 作用 | 例子 |
| --- | --- | --- |
| `**文字**` | 加粗 | **重点** |
| `*文字*` | 斜体 | *轻声说* |
| `` `代码` `` | 行内代码 | `npm run` |
| `> 文字` | 引用 | 见上文 |

## 图片

如果图片和笔记放在一起，可以直接用相对路径引用：

```markdown
![一张图片](./images/example.jpg)
```

建议把图片放在 `notes/images/` 文件夹里。图片会自动延迟加载，并适配页面宽度。

## 分割线

---

## 一点排版建议

1. 每篇笔记最好有一个清晰的主标题。
2. 摘要不必很长，一两句话就够。
3. 小标题之间留出呼吸感，别让页面太拥挤。
4. 发布之前，自己完整读一遍。

写下来，比写得完美更重要。

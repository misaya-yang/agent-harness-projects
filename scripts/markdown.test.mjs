import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown.mjs";

test("matrix rows and multiple worked-example anchors survive Markdown rendering", () => {
  const source = String.raw`## 1. 投影

$$
Q=\begin{bmatrix}Q_T\\Q_I\end{bmatrix}
$$

### 数值复算 · 计算量

### 数值复算 · 条件门`;
  const html = renderMarkdown(source, { id: "4.4" }).parts[0].html;
  assert.equal((html.match(/<mtr>/g) ?? []).length, 2);
  assert.equal((html.match(/id="worked-example"/g) ?? []).length, 1);
  assert.match(html, /id="worked-example-2"/);
});

test("double-escaped commands from older exports still render", () => {
  const html = renderMarkdown(String.raw`## 1. 比例

$$
\\frac{1}{2}
$$`, { id: "0.1" }).parts[0].html;
  assert.match(html, /<mfrac>/);
});

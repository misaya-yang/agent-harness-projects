# Self-hosted typefaces

All families are SIL Open Font License 1.1 (OFL), which permits web
embedding and redistribution. Files are the `latin` and `latin-ext`
`unicode-range` slices of the variable builds served by Google Fonts; the
`latin-ext` slices only download when the page actually renders those
codepoints.

| File | Family | Axes | Role |
|---|---|---|---|
| `unbounded-*.woff2` | Unbounded | `wght` 200–900 | public display: brand, page titles, section heads |
| `geist-*.woff2` | Geist | `wght` 100–900 | text: reading, interface, article titles (site-wide) |
| `geist-mono-*.woff2` | Geist Mono | `wght` 100–900 | kickers, dates, counts, tags, code |
| `jetbrains-mono-*.woff2` | JetBrains Mono | `wght` 400–700 | fallback for glyphs Geist Mono lacks |

Chinese is intentionally **not** a webfont: a usable Han family is several MB
even sliced. Every role names the platform Hei faces (PingFang SC, Hiragino
Sans GB, Source Han Sans SC, Noto Sans CJK SC, Microsoft YaHei) explicitly,
Latin family first, so Latin glyphs never come from a Han face.

Re-fetch: request
`https://fonts.googleapis.com/css2?family=Unbounded:wght@200..900&family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap`
with a modern browser user agent and download the `latin` and `latin-ext`
`src` URLs it lists.

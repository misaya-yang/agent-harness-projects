import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const serverEntry = fileURLToPath(new URL("../dist/server/index.js", import.meta.url));
const textAssets = {};
const binaryAssets = {};

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const key = `/${relative(dist, path).split(sep).join("/")}`;
    if (key.startsWith("/server/") || key.startsWith("/.openai/")) continue;
    if (entry.isDirectory()) {
      await collect(path);
      continue;
    }
    const extension = extname(entry.name).toLowerCase();
    if ([".html", ".css", ".js", ".json", ".svg", ".txt"].includes(extension)) {
      textAssets[key] = await readFile(path, "utf8");
    } else {
      binaryAssets[key] = (await readFile(path)).toString("base64");
    }
  }
}

await collect(dist);

const source = `
const textAssets = ${JSON.stringify(textAssets)};
const binaryAssets = ${JSON.stringify(binaryAssets)};
const types = ${JSON.stringify({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
})};

function contentType(path) {
  const dot = path.lastIndexOf(".");
  return types[dot >= 0 ? path.slice(dot) : ""] || "application/octet-stream";
}

function decodeBase64(value) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const routeAliases = { "/": "/index.html", "/codex": "/codex.html", "/grok": "/grok.html", "/deepseek": "/deepseek.html", "/pi": "/pi.html", "/opencode": "/opencode.html", "/openclaw": "/openclaw.html", "/hermes": "/hermes.html" };
    const path = routeAliases[url.pathname] || url.pathname;
    const headers = {
      "content-type": contentType(path),
      "x-content-type-options": "nosniff",
      "cache-control": path.endsWith(".html") ? "public, max-age=60" : "public, max-age=31536000, immutable",
    };
    if (Object.hasOwn(textAssets, path)) return new Response(textAssets[path], { headers });
    if (Object.hasOwn(binaryAssets, path)) return new Response(decodeBase64(binaryAssets[path]), { headers });
    return new Response("Not Found", { status: 404 });
  },
};
`;

await writeFile(serverEntry, source.trimStart());

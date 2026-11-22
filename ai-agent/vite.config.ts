import { defineConfig, loadEnv } from "vite";
import { sites } from "@openai/sites-vite-plugin";

export default defineConfig(({ mode }) => {
  const netlify = mode === "netlify";
  const origin = netlify ? new URL(loadEnv(mode, ".", "URL").URL || "https://misaya-agent-atlas.netlify.app").origin : "https://harness.lvy-u.chatgpt.site";
  return {
    plugins: [
      ...(netlify ? [] : [sites()]),
      {
        name: "atlas-canonical-origin",
        transformIndexHtml(html: string) {
          return html.replaceAll("https://harness.lvy-u.chatgpt.site", origin);
        },
      },
    ],
    server: { port: 5173, strictPort: true, host: "127.0.0.1" },
    build: {
      outDir: netlify ? "dist-netlify" : "dist",
      target: "es2022",
      cssCodeSplit: true,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        input: {
          app: "index.html", codex: "codex.html", grok: "grok.html", deepseek: "deepseek.html",
          pi: "pi.html", opencode: "opencode.html", openclaw: "openclaw.html", hermes: "hermes.html",
          ...(netlify ? {} : { "server/index": "src/worker.js" }),
        },
        output: { entryFileNames: chunk => chunk.name === "server/index" ? "server/index.js" : "assets/[name]-[hash].js" },
      },
    },
  };
});

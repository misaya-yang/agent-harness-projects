import { defineConfig } from "vite";
import { sites } from "@openai/sites-vite-plugin";

export default defineConfig({
  plugins: [sites()],
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    cssCodeSplit: false,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        app: "index.html",
        grok: "grok.html",
        deepseek: "deepseek.html",
        pi: "pi.html",
        opencode: "opencode.html",
        openclaw: "openclaw.html",
        hermes: "hermes.html",
        "server/index": "src/worker.js",
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "server/index"
            ? "server/index.js"
            : "assets/[name]-[hash].js",
      },
    },
  },
});

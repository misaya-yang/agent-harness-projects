import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const pages = ["index.html", "grok.html", "deepseek.html", "pi.html", "opencode.html", "openclaw.html", "hermes.html"];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("published course contract", () => {
  for (const page of pages) {
    it(`${page} keeps 12 chapters, unique ids, and resolved hashes`, () => {
      const html = read(page);
      assert.equal((html.match(/<section class="chapter\b/g) ?? []).length, 12);
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      assert.equal(new Set(ids).size, ids.length);
      const hashes = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
      const machineCount = (html.match(/class="machine" id=/g) ?? []).length;
      assert.deepEqual(hashes.filter((hash) => !ids.includes(hash)), []);
      assert.match(html, new RegExp(`0?${machineCount} 个(?:交互)?实验`));
      assert.doesNotMatch(html, /<button(?![^>]*\btype="button")/);
    });
  }

  it("aliases every course route in the production worker", () => {
    const source = read("scripts/embed-worker.mjs");
    const expected = ["/", "/codex", ...pages.filter((p) => p !== "index.html").map((p) => `/${p.replace(/\.html$/, "")}`)];
    for (const alias of expected) {
      const target = alias === "/" || alias === "/codex" ? "/index.html" : `${alias}.html`;
      assert.match(source, new RegExp(`"${alias}": "${target}"`), `missing production route alias ${alias}`);
    }
  });

  it("teaches from incidents without turning source locations into the lesson", () => {
    const snapshots = {
      "index.html": "498d40b29f60",
      "grok.html": "72a61251fcff",
      "deepseek.html": "49a606bc5b59",
      "pi.html": "4e69b0c28060",
      "opencode.html": "b578b7261fc9",
      "openclaw.html": "5e9875ab56a8",
      "hermes.html": "97f3229dfdc0",
    };
    const entries = ["src/main.ts", "src/grok.ts", "src/deepseek.ts", "src/pi.ts", "src/opencode.ts", "src/openclaw.ts", "src/hermes.ts"];
    const html = pages.map((page) => {
      const source = read(page);
      const hero = source.match(/<ul class="hero-outcomes"[\s\S]*?<\/ul>/)?.[0] ?? "";
      assert.ok((hero.match(/<li>/g) ?? []).length >= 3, `${page} needs concrete learning outcomes`);
      assert.ok((source.match(/lesson-result|CHAPTER CHECK|CHECKPOINT \d+|本章小结|小结 ·|本章过关|课程完成|毕业练习/g) ?? []).length >= 10, `${page} needs chapter checks`);
      assert.match(source, new RegExp(snapshots[page]), `${page} needs its reviewed snapshot`);
      assert.match(source, /https:\/\/harness\.lvy-u\.chatgpt\.site/, `${page} needs the current canonical host`);
      return source.replace(/<script[\s\S]*?<\/script>/g, "");
    }).join("\n");
    const interactiveCopy = entries.map(read).join("\n");
    const publishedCopy = `${html}\n${interactiveCopy}`;
    assert.doesNotMatch(publishedCopy, /SOURCE ROUTE|源码路线|真实入口请查|MINIMAL RUNNABLE|SOURCE-ALIGNED TEACHING SKELETON/i);
    assert.doesNotMatch(publishedCopy, /\b(?:codex-rs|packages|crates|src|tests|tools|agent|gateway)\/[\w./-]+\.(?:rs|ts|tsx|py|md|json|jsonl|toml)\b/i);
    assert.doesNotMatch(publishedCopy, /\b[\w.-]+\.(?:rs|ts|tsx|py|md|json|jsonl):\d+\b/i);
  });

  it("uses native fullscreen without claiming a false modal", () => {
    const source = read("src/modules/machine-fullscreen.ts");
    assert.match(source, /requestFullscreen/);
    assert.match(source, /fullscreenchange/);
    assert.doesNotMatch(source, /aria-modal|role", "dialog"|modal-open/);
  });

  it("keeps the no-JS document and enables the shared reader once", () => {
    const entries = ["src/main.ts", "src/grok.ts", "src/deepseek.ts", "src/pi.ts", "src/opencode.ts", "src/openclaw.ts", "src/hermes.ts"].map(read);
    entries.forEach((source) => {
      assert.equal((source.match(/initChapterReader\(\)/g) ?? []).length, 1);
      assert.doesNotMatch(source, /initSpy/);
    });
    assert.doesNotMatch(pages.map(read).join("\n"), /class="reader-mode"|class="reader-view"/);
  });

  it("keeps source notes portable and snapshot-pinned", () => {
    const sourceNotes = fs.readdirSync(path.join(root, "docs"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => read(path.join("docs", file)))
      .join("\n");
    assert.doesNotMatch(sourceNotes, /\/Users\//);
    assert.doesNotMatch(`${sourceNotes}\n${pages.map(read).join("\n")}`, /github\.com\/openclaw\/openclaw\/(?:blob|tree)\/main\//);
  });
});

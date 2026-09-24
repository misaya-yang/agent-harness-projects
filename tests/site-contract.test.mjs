import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const pages = ["codex.html", "grok.html", "deepseek.html", "pi.html", "opencode.html", "openclaw.html", "hermes.html"];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("published course contract", () => {
  for (const page of pages) {
    it(`${page} keeps modules, unique ids, and resolved hashes`, () => {
      const html = read(page);
      assert.ok((html.match(/<section class="chapter\b/g) ?? []).length >= 6);
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
    const expected = ["/", ...pages.map((p) => `/${p.replace(/\.html$/, "")}`)];
    for (const alias of expected) {
      const target = alias === "/" ? "/index.html" : `${alias}.html`;
      assert.match(source, new RegExp(`"${alias}": "${target}"`), `missing production route alias ${alias}`);
    }
  });

  it("offers a topic-first path with interview transfer and compatible old Codex links", () => {
    const home = read("index.html");
    const courseHtml = pages.map(read).join("\n");
    assert.equal((home.match(/class="atlas-topic"/g) ?? []).length, 10);
    assert.equal((home.match(/class="topic-interview"/g) ?? []).length, 10);
    assert.equal((home.match(/class="topic-transfer"/g) ?? []).length, 10);
    assert.equal((home.match(/class="topic-contrast"/g) ?? []).length, 10);
    assert.match(home, /oldCodexHashes/);
    for (const [, route, hash] of home.matchAll(/href="\/(codex|grok|deepseek|pi|opencode|openclaw|hermes)#([^"]+)"/g)) {
      const page = route === "codex" ? "codex.html" : `${route}.html`;
      assert.match(read(page), new RegExp(`id="${hash}"`), `broken topic link to ${route}#${hash}`);
    }
    assert.ok((courseHtml.match(/class="course-update"/g) ?? []).length >= 7);
    assert.doesNotMatch(read("pi.html"), /shouldStopAfterTurn/);
  });

  it("teaches from engineering scenarios without turning source locations into the lesson", () => {
    const snapshots = {
      "codex.html": "498d40b29f60",
      "grok.html": "72a61251fcff",
      "deepseek.html": "49a606bc5b59",
      "pi.html": "4e69b0c28060",
      "opencode.html": "b578b7261fc9",
      "openclaw.html": "5e9875ab56a8",
      "hermes.html": "97f3229dfdc0",
    };
    const entries = ["src/main.ts", "src/grok.ts", "src/deepseek.ts", "src/pi.ts", "src/opencode.ts", "src/openclaw.ts", "src/hermes.ts"];
    const html = ["index.html", ...pages].map((page) => {
      const source = read(page);
      if (page === "index.html") return source.replace(/<script[\s\S]*?<\/script>/g, "");
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
    assert.doesNotMatch(publishedCopy, /白话理解|白话|先解决：/);
    assert.doesNotMatch(publishedCopy, /\b(?:codex-rs|packages|crates|src|tests|tools|agent|gateway)\/[\w./-]+\.(?:rs|ts|tsx|py|md|json|jsonl|toml)\b/i);
    assert.doesNotMatch(publishedCopy, /\b[\w.-]+\.(?:rs|ts|tsx|py|md|json|jsonl):\d+\b/i);
  });

  it("keeps the Codex curriculum modular and preserves its context-memory boundaries", () => {
    const html = read("codex.html");
    const contextMeter = read("src/modules/context-meter.ts");
    assert.equal((html.match(/>MODULE \d{2} ·/g) ?? []).length, 12);
    for (const concept of [
      "Base Instructions",
      "Dynamic Context",
      "Active History",
      "Tool Specs",
      "Output Schema",
      "Thread Rollout",
      "Review History",
      "Verified Answers",
      "Long-term Memories",
      "replacement history",
      "20k token",
      "64k",
    ]) {
      assert.match(html, new RegExp(concept, "i"), `Codex course must teach ${concept}`);
    }
    assert.match(contextMeter, /checkpoint \$\{compactCount\} replaces/);
    assert.match(contextMeter, /transcript remains/);
    assert.doesNotMatch(contextMeter, /summaryTok\s*\+=/);
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

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const pages = ["index.html", "grok.html", "deepseek.html", "pi.html"];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("published course contract", () => {
  for (const page of pages) {
    it(`${page} keeps 12 chapters, unique ids, and resolved hashes`, () => {
      const html = read(page);
      assert.equal((html.match(/<section class="chapter\b/g) ?? []).length, 12);
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      assert.equal(new Set(ids).size, ids.length);
      const hashes = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
      assert.deepEqual(hashes.filter((hash) => !ids.includes(hash)), []);
      assert.doesNotMatch(html, /<button(?![^>]*\btype="button")/);
    });
  }

  it("labels authored walkthroughs as teaching skeletons", () => {
    const html = pages.map(read).join("\n");
    assert.doesNotMatch(html, /MINIMAL RUNNABLE|精简独立可运行/);
    assert.match(html, /SOURCE-ALIGNED TEACHING SKELETON/);
    assert.match(html, /不代表各上游项目的官方定位/);
  });

  it("uses native fullscreen without claiming a false modal", () => {
    const source = read("src/modules/machine-fullscreen.ts");
    assert.match(source, /requestFullscreen/);
    assert.match(source, /fullscreenchange/);
    assert.doesNotMatch(source, /aria-modal|role", "dialog"|modal-open/);
  });

  it("keeps the no-JS document and enables the shared reader once", () => {
    const entries = ["src/main.ts", "src/grok.ts", "src/deepseek.ts", "src/pi.ts"].map(read);
    entries.forEach((source) => {
      assert.equal((source.match(/initChapterReader\(\)/g) ?? []).length, 1);
      assert.doesNotMatch(source, /initSpy/);
    });
    assert.doesNotMatch(pages.map(read).join("\n"), /class="reader-mode"|class="reader-view"/);
  });
});

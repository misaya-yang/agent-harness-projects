import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { available, modules, roadmap } from "./curriculum.mjs";
import { labAnchor, labDefinitions } from "./lesson-labs.mjs";
import { lessonSources } from "./lesson-sources.mjs";
import { renderMarkdown, mathErrors } from "./markdown.mjs";
import { allPaths, homePage, lessonPage, modulePage, progressPage, roadmapPage } from "./pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
const input = name => resolve(root, name);
function buildLabs(group) {
  return build({
    stdin: { contents: `import {activateLabs} from "./web/labs/client.mjs"; import lessons from "./web/labs/${group}.mjs"; activateLabs(lessons);`, resolveDir: root },
    outfile: resolve(dist, "labs", group + ".js"), format: "esm", target: "es2022", bundle: true, minify: true,
  });
}
async function write(url, contents) {
  const destination = resolve(dist, url === "/" ? "index.html" : url.slice(1));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

await mkdir(dist, { recursive: true });
await Promise.all([
  ...["academy.css", "labs.css", "theme.js", "misaya", "fonts", "assets"].map(asset =>
    cp(input(`web/${asset}`), resolve(dist, asset), { recursive: true })),
  ...["architecture", "alignment", "systems"].map(buildLabs),
  cp(input("node_modules/katex/dist/katex.min.css"), resolve(dist, "katex/katex.min.css")),
  cp(input("node_modules/katex/dist/fonts"), resolve(dist, "katex/fonts"), { recursive: true }),
  build({
    absWorkingDir: root,
    entryPoints: { app: "web/app.mjs", sky: "web/starfield/scene.ts" },
    alias: { "@/lib/skyEvents": input("web/lib/skyEvents.ts") },
    define: { "import.meta.env.DEV": "false" },
    outdir: dist, bundle: true, minify: true, format: "esm", target: ["es2022"],
    external: ["./sky.js"], legalComments: "linked",
  }),
]);

const index = [];
for (const lesson of available) {
  const rendered = renderMarkdown(lesson.body, { id: lesson.id });
  await write(lesson.url, lessonPage(lesson, rendered));
  let body = rendered.introText;
  const sections = rendered.intro ? [{ id: "course-notes", title: "课前笔记", start: 0 }] : [];
  for (const part of rendered.parts) {
    const passages = part.groups ?? [part];
    for (const passage of passages) {
      const title = passage.label ?? part.title;
      sections.push({ id: passage.id, title, start: body.length + 1 });
      body += " " + title + " " + passage.searchText;
    }
  }
  for (const id of rendered.labs) {
    const lab = labDefinitions[id];
    sections.push({ id: labAnchor(id), title: lab.title, start: body.length + 1 });
    body += ` ${lab.title} ${lab.question} ${lab.controls.map(c=>c.label).join(" ")}`;
  }
  if (lessonSources[lesson.id]?.length) {
    sections.push({ id: "sources", title: "参考来源", start: body.length + 1 });
    body += " " + lessonSources[lesson.id].map(source=>source.label).join(" ");
  }
  index.push({
    id: lesson.id, title: lesson.title, url: lesson.url, module: lesson.module.title,
    body, sections,
  });
}
const roadmapBody = roadmap.slice(roadmap.indexOf("\n")).replace(/^\*\*下一步\*\*：.*$/gm, "").trim();
const renderedRoadmap = renderMarkdown(roadmapBody, { isRoadmap: true, id: "roadmap" });
await Promise.all([
  write("/", homePage()),
  write("/roadmap.html", roadmapPage(renderedRoadmap)),
  write("/progress.html", progressPage()),
  ...modules.map(module => write(module.url, modulePage(module))),
  write("/search-index.json", JSON.stringify(index)),
  write("/robots.txt", "User-agent: *\nAllow: /\n"),
]);
console.log(`Built ${allPaths.length} pages, ${index.length} searchable lessons`);
if (mathErrors.length) {
  console.error("Review math rendering:", mathErrors);
  process.exitCode = 1;
}

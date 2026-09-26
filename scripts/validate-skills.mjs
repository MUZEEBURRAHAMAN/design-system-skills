#!/usr/bin/env node
// Verifies the Figma-first invariants of this repo. Run: node scripts/validate-skills.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (m) => problems.push(m);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === ".git" || f === "node_modules") continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const rel = (p) => relative(ROOT, p);

// 1. Every skill has frontmatter with a description.
const skills = files.filter((f) => rel(f).startsWith("skills/") && f.endsWith(".md"));
const skillNames = new Set(skills.map((f) => rel(f).replace(/^skills\/|\.md$/g, "")));
for (const f of skills) {
  const m = readFileSync(f, "utf8").match(/^---\ndescription: .+\n---\n/);
  if (!m) fail(`${rel(f)}: missing "---\\ndescription: ...\\n---" frontmatter`);
}

// 2. Every /ds-* command referenced in prose exists as a skill.
for (const f of files.filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(f, "utf8");
  for (const [, name] of text.matchAll(/(?<![\w./-])\/(ds-[a-z-]+)/g)) {
    if (!skillNames.has(name)) fail(`${rel(f)}: references /${name}, but skills/${name}.md does not exist`);
  }
}

// 3. JSON templates parse.
for (const f of files.filter((f) => f.endsWith(".json"))) {
  try { JSON.parse(readFileSync(f, "utf8")); } catch (e) { fail(`${rel(f)}: invalid JSON (${e.message})`); }
}

// 4. Banned code-first phrases must not return. (These files quote them on purpose.)
const BANNED = [
  "Code is canonical", "Storybook (code) wins", "richer output", "is often wrong",
  "prefer Storybook computed values as canonical", "from code sources only",
  "writes any needed adjustments back to Figma", "write-back capability",
  "Storybook-to-Figma", "add to Figma)", "remove from Figma)",
];
const QUOTES_BANNED = new Set(["SOURCE-OF-TRUTH.md", "CLAUDE.md", "scripts/validate-skills.mjs"]);
for (const f of files.filter((f) => /\.(md|json|ts)$/.test(f) && !QUOTES_BANNED.has(rel(f)))) {
  const text = readFileSync(f, "utf8");
  for (const b of BANNED) if (text.includes(b)) fail(`${rel(f)}: contains banned code-first phrase "${b}"`);
}

// 5. No skill may instruct a Figma write.
const FIGMA_WRITE = /\b(setBoundVariable|createFrame|createText|createRectangle|setPluginData)\b|node\.(paddingTop|itemSpacing|cornerRadius)\s*=/;
for (const f of skills) {
  if (FIGMA_WRITE.test(readFileSync(f, "utf8"))) fail(`${rel(f)}: contains Figma write API usage (Guardrail 1)`);
}

if (problems.length) { console.error(problems.map((p) => "✖ " + p).join("\n")); process.exit(1); }
console.log(`validate-skills: OK (${skills.length} skills, ${files.filter((f) => f.endsWith(".json")).length} JSON files checked)`);

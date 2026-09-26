/**
 * Source-of-truth rules for this repository, as executable checks.
 * checkRepo(root) returns [{ rule, file, message }]. Each rule maps to a
 * guardrail in SOURCE-OF-TRUTH.md. Tests run it against mutated copies of the
 * repo to prove every rule actually fires.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

export const BANNED_PHRASES = [
  "Code is canonical", "Storybook (code) wins", "richer output", "is often wrong",
  "prefer Storybook computed values as canonical", "from code sources only",
  "writes any needed adjustments back to Figma", "write-back capability",
  "Storybook-to-Figma", "add to Figma)", "remove from Figma)",
  "safe to apply directly", "may be applied directly", "/ds-report --no-figma",
  "Auto-publish on merge", "Sync Brand A to Figma", "Sync Brand B to Figma", "Darken --muted-foreground",
];
/** Files that quote the banned phrases on purpose (policy docs and this checker). */
export const QUOTES_BANNED = new Set(["SOURCE-OF-TRUTH.md", "CLAUDE.md", "scripts/lib/rules.mjs", "scripts/validate-skills.mjs", "test/rules.test.mjs"]);

/** Skills that read Figma and therefore must state the tie-break and link the policy. */
export const FIGMA_FIRST_SKILLS = ["ds-sync", "ds-tokens", "ds-design-md", "ds-spec", "ds-report", "ds-audit-figma", "ds-proto"];

const FIGMA_WRITE_API = /\b(setBoundVariable|setBoundVariableForPaint|createVariable|createFrame|createText|createRectangle|createComponent|setPluginData|importComponentByKeyAsync)\b|\b(?:node|variable|component)\.(?:paddingTop|paddingBottom|paddingLeft|paddingRight|itemSpacing|cornerRadius|fills|strokes|name|description)\s*=[^=]/;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === ".git" || f === "node_modules" || f === "fixtures") continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

export function checkRepo(root) {
  const problems = [];
  const add = (rule, file, message) => problems.push({ rule, file, message });
  const rel = (p) => relative(root, p);
  const files = walk(root);
  const read = (f) => readFileSync(f, "utf8");
  const skills = files.filter((f) => rel(f).startsWith("skills/") && f.endsWith(".md"));
  const skillNames = new Set(skills.map((f) => rel(f).replace(/^skills\/|\.md$/g, "")));

  // frontmatter
  for (const f of skills) if (!/^---\ndescription: .+\n---\n/.test(read(f))) add("frontmatter", rel(f), 'missing "---\\ndescription: ...\\n---" frontmatter');

  // command references resolve
  for (const f of files.filter((f) => f.endsWith(".md"))) {
    for (const [, name] of read(f).matchAll(/(?<![\w./-])\/(ds-[a-z-]+)/g)) {
      if (!skillNames.has(name)) add("command-ref", rel(f), `references /${name}, but skills/${name}.md does not exist`);
    }
  }

  // JSON parses
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    try { JSON.parse(read(f)); } catch (e) { add("json", rel(f), `invalid JSON (${e.message})`); }
  }

  // banned code-first phrases
  for (const f of files.filter((f) => /\.(md|json|ts|mjs|yml)$/.test(f) && !QUOTES_BANNED.has(rel(f)))) {
    const text = read(f);
    for (const b of BANNED_PHRASES) if (text.includes(b)) add("banned-phrase", rel(f), `contains banned code-first phrase "${b}"`);
  }

  // Guardrail 1: no Figma write API in any skill or guide code block
  for (const f of files.filter((f) => /^(skills|guides)\//.test(rel(f)) && f.endsWith(".md"))) {
    if (FIGMA_WRITE_API.test(read(f))) add("no-figma-write", rel(f), "contains Figma write API usage (Guardrail 1)");
  }

  // Tie-break stated + policy linked in every Figma-reading skill
  for (const name of FIGMA_FIRST_SKILLS) {
    const f = join(root, "skills", `${name}.md`);
    if (!existsSync(f)) { add("skill-missing", `skills/${name}.md`, "expected skill file is missing"); continue; }
    const t = read(f);
    if (!t.includes("SOURCE-OF-TRUTH.md")) add("policy-link", `skills/${name}.md`, "does not link SOURCE-OF-TRUTH.md");
    if (!/Figma (is|wins|remains)[^.\n]{0,40}(canonical|correct|reference|source of truth|design authority|wins)|Figma is correct|Figma wins|Figma's [a-z ]+ (is|are) (canonical|correct)|Figma is the (source|reference|design authority|anchor)/i.test(t)) add("tie-break", `skills/${name}.md`, "does not state that Figma wins when Figma and code disagree");
  }

  // Code-side changes are proposals; direct application needs explicit approval
  const sync = join(root, "skills/ds-sync.md");
  if (existsSync(sync)) {
    const t = read(sync);
    if (!t.includes("--apply-tokens") || !/explicit(ly)? approv/i.test(t)) add("proposal-first", "skills/ds-sync.md", "must default to proposals and require --apply-tokens plus explicit approval for any code edit");
    if (/^\s*[-*]?\s*(Edit|Write) the (token|CSS)/im.test(t) && !/Do not edit any file/.test(t)) add("proposal-first", "skills/ds-sync.md", "instructs a code edit without the proposal/approval gate");
  }

  // Publishing to Figma is explicit and approved only (Code Connect)
  for (const f of files.filter((f) => /\.(md|yml)$/.test(f))) {
    const lines = read(f).split("\n");
    lines.forEach((line, i) => {
      if (/figma connect publish(?!\s+--dry-run)/.test(line) && /^\s*-?\s*(name:.*\n)?\s*-?\s*run:/.test(line)) {
        // a CI `run:` step that publishes must live in a workflow_dispatch + environment-approved job
        const ctx = lines.slice(Math.max(0, i - 25), i + 1).join("\n");
        if (!/workflow_dispatch/.test(ctx) || !/environment:\s*\S+/.test(ctx)) add("no-auto-publish", `${rel(f)}:${i + 1}`, "CI publishes to Figma without a manual, environment-approved trigger");
      }
    });
  }
  const cc = join(root, "guides/code-connect.md");
  if (existsSync(cc)) {
    const t = read(cc);
    if (!/--dry-run/.test(t) || !/explicit/i.test(t) || !/never run `figma connect publish` on your own initiative/i.test(t)) add("publish-explicit", "guides/code-connect.md", "must require a dry run and explicit, user-invoked publishing");
    if (/on:\s*\n\s*push:/.test(t) && /run:\s*npx figma connect publish\s*$/m.test(t)) add("no-auto-publish", "guides/code-connect.md", "auto-publish on push");
  }

  // Snapshot freshness is machine-checked wherever a snapshot is used
  const ci = join(root, "guides/ci-integration.md");
  if (existsSync(ci) && (!read(ci).includes("check-snapshot") || !read(ci).includes("check-snapshot.mjs --live"))) add("snapshot-freshness", "guides/ci-integration.md", "CI guide must run scripts/check-snapshot.mjs, including a --live check against Figma");
  const rep = join(root, "skills/ds-report.md");
  if (existsSync(rep) && /--snapshot/.test(read(rep)) && !read(rep).includes("check-snapshot")) add("snapshot-freshness", "skills/ds-report.md", "--snapshot mode must run check-snapshot first");

  // DESIGN.md provenance produced and consumed
  const dm = join(root, "skills/ds-design-md.md");
  if (existsSync(dm) && !/ds-source: figma-live/.test(read(dm))) add("design-md-provenance", "skills/ds-design-md.md", "must emit a ds-source provenance comment");
  for (const n of ["ds-export", "ds-brand", "ds-diff"]) {
    const f = join(root, `skills/${n}.md`);
    if (existsSync(f) && !/ds-source|figma-live/.test(read(f))) add("design-md-provenance", `skills/${n}.md`, "must check DESIGN.md provenance before treating it as Figma-verified");
  }

  // Contrast is a design decision; brand forks are proposals; lifecycle respects design status; DESIGN.md never overrides Figma's values
  const need = (file, rule, re, message) => { const f = join(root, file); if (existsSync(f) && !re.test(read(f))) add(rule, file, message); };
  need("skills/ds-wcag.md", "contrast-is-design", /Colou?r contrast failures are always MANUAL/, "contrast failures must be routed to the designer, never auto-fixed in code");
  need("skills/ds-design-md.md", "no-value-override", /do \*\*not\*\* change any value in DESIGN\.md/, "lint fixes must not change Figma-derived values");
  need("skills/ds-brand.md", "brand-proposal", /ds-source: brand-proposal/, "brand forks must be stamped as proposals, not design of record");
  need("skills/ds-lifecycle.md", "lifecycle-design-gate", /deprecated or replaced \*\*in Figma\*\*/, "deprecation must start from a design decision in Figma");

  // ds-proto is Figma-aware, not code-side only
  const proto = join(root, "skills/ds-proto.md");
  if (existsSync(proto)) {
    const t = read(proto);
    if (!/presence/.test(t) || !/Figma-only/.test(t) || !/design authority/i.test(t)) add("proto-figma-aware", "skills/ds-proto.md", "must classify components by presence, handle Figma-only gaps, and name Figma as the design authority");
  }

  // Registry template: presence on every component; Figma-only entries carry no code fields; exceptions not duplicated
  const tpl = join(root, "templates/ds-registry.example.json");
  if (existsSync(tpl)) {
    try {
      const reg = JSON.parse(read(tpl));
      for (const [name, c] of Object.entries(reg.components ?? {})) {
        if (!c.presence || typeof c.presence.inFigma !== "boolean" || typeof c.presence.inCode !== "boolean") add("registry-presence", "templates/ds-registry.example.json", `${name}: missing presence{inFigma,inCode}`);
        else if (!c.presence.inCode && (c.sourceFile || c.package)) add("registry-presence", "templates/ds-registry.example.json", `${name}: inCode is false but has code fields`);
        else if (!c.presence.inFigma && c.figma) add("registry-presence", "templates/ds-registry.example.json", `${name}: inFigma is false but has a figma block`);
        if (reg.outliers?.figmaOnly?.[name] || reg.outliers?.storybookOnly?.[name]) add("registry-presence", "templates/ds-registry.example.json", `${name}: appears both in components and in outliers`);
      }
      if (!reg._meta?.snapshot?.figmaMapSha256) add("snapshot-freshness", "templates/ds-registry.example.json", "template must show _meta.snapshot provenance");
    } catch { /* reported by the json rule */ }
  }
  return problems;
}

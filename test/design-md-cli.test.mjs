// Regression: found running ds-design-md/ds-diff against the real google-labs-code design.md CLI.
//  - the skills told users to `npm install design.md` (that package does not exist; it is @google/design.md)
//  - the --spec front-matter template used keys the real linter ignores (rounding, typography.scale, background/foreground)
//  - the provenance comment as line 1 pushed the front matter off the top, so the CLI saw no tokens at all
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { REPO } from "./helpers.mjs";

const read = (f) => readFileSync(join(REPO, f), "utf8");
const cli = join(REPO, "node_modules/.bin/design.md");
const lint = (file) => JSON.parse(spawnSync(cli, ["lint", file], { encoding: "utf8" }).stdout);

test("no skill/guide tells users to install the nonexistent `design.md` package", () => {
  for (const f of [...readdirSync(join(REPO, "skills")).map((n) => "skills/" + n), "README.md", "guides/design-md.md"]) {
    assert.doesNotMatch(read(f), /install --save-dev design\.md/, f);
  }
  assert.match(read("skills/ds-diff.md"), /@google\/design\.md/);
});

const spec = read("skills/ds-design-md.md");
const template = spec.slice(spec.indexOf("### YAML Front Matter")).match(/```yaml\n(---[\s\S]*?---)\n```/)[1];

test("the --spec front-matter template is accepted by the real design.md linter with no unrecognised keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-"));
  const f = join(dir, "DESIGN.md");
  writeFileSync(f, template.replace(/"<[^>]*>"/g, '"#123456"').replace(/fontFamily: "#123456"/g, "fontFamily: Archivo") + "\n# T\n\n## Overview\nx\n");
  const bad = lint(f).findings.filter((x) => /not a recognized|not recognized|looks like a design-token map/.test(x.message));
  assert.deepEqual(bad, []);
});

test("provenance comment goes after the front matter in --spec output, and a comment-first file loses its tokens", () => {
  assert.match(spec, /immediately after the closing `---`/);
  const dir = mkdtempSync(join(tmpdir(), "dm-"));
  const good = join(dir, "good.md"), bad = join(dir, "bad.md");
  const fm = '---\nversion: alpha\nname: T\ncolors:\n  primary: "#2745e8"\n---\n';
  const c = "<!-- ds-source: figma-live; figmaFile: K; generatedAt: 2026-01-01T00:00:00.000Z -->\n";
  writeFileSync(good, fm + c + "# T\n\n## Overview\nx\n");
  writeFileSync(bad, c + fm + "# T\n\n## Overview\nx\n");
  assert.equal(lint(good).findings.some((x) => /No YAML content/.test(x.message)), false);
  assert.equal(lint(bad).findings.some((x) => /No YAML content/.test(x.message)), true);
});

test("ds-diff: real CLI JSON shape matches what the skill parses, and direction rules are stated", () => {
  const dir = mkdtempSync(join(tmpdir(), "dm-"));
  const mk = (n, hex, src) => { const f = join(dir, n); writeFileSync(f, `---\nversion: alpha\nname: T\ncolors:\n  primary: "${hex}"\ncomponents:\n  button:\n    backgroundColor: "{colors.primary}"\n---\n<!-- ds-source: ${src} -->\n# T\n\n## Overview\nx\n`); return f; };
  const out = JSON.parse(spawnSync(cli, ["diff", mk("a.md", "#2745e8", "figma-live"), mk("b.md", "#3353F8", "code-fallback"), "--format", "json"], { encoding: "utf8" }).stdout);
  assert.deepEqual(out.tokens.colors.modified, ["primary"]);
  assert.equal(out.regression, false); assert.ok(out.findings.delta && out.findings.before);
  const d = read("skills/ds-diff.md");
  assert.match(d, /--format json/);
  assert.doesNotMatch(d, /diff [^\n]*--json >/);
  assert.match(d, /`figma-live` → `code-fallback`[^\n]*implementation drift/);
  assert.match(d, /never described as "Figma is stale"/);
});

test("ds-spec treats a single COMPONENT of state frames as a state gallery (real Composer/GeneratedCard shape)", () => {
  const d = read("skills/ds-spec.md");
  assert.match(d, /State galleries/);
  assert.match(d, /not an anatomy/);
  assert.match(d, /never bind or repair them/);
});

test("ds-lifecycle: Figma-only components stay proposed and compound parts are not tracked separately", () => {
  const d = read("skills/ds-lifecycle.md");
  assert.match(d, /cannot be promoted/);
  assert.match(d, /Skip registry entries with a `partOf` field/);
  assert.match(d, /Never create a stub component/);
});

test("ds-wcag: waits for transitions and re-runs a lone contrast failure (phantom failure seen on the real kit)", () => {
  const d = read("skills/ds-wcag.md");
  assert.match(d, /Let the page settle first/);
  assert.match(d, /phantom `color-contrast` failure/);
  assert.match(d, /Contrast failures are always MANUAL|Colour contrast failures are always MANUAL/);
});

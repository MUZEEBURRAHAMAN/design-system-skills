import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkRepo, FIGMA_FIRST_SKILLS } from "../scripts/lib/rules.mjs";
import { REPO, tempRepo } from "./helpers.mjs";

/** Copy the repo, apply `mutate`, and return the rule ids that fire. */
function violations(mutate) {
  const { dir, cleanup } = tempRepo();
  try {
    const edit = (rel, fn) => { const p = join(dir, rel); writeFileSync(p, fn(readFileSync(p, "utf8"))); };
    mutate(edit, dir);
    return checkRepo(dir);
  } finally { cleanup(); }
}
const fires = (rule, mutate, needle) => {
  const v = violations(mutate).filter((x) => x.rule === rule);
  assert.ok(v.length > 0, `rule "${rule}" did not fire`);
  if (needle) assert.ok(v.some((x) => x.file.includes(needle) || x.message.includes(needle)), `rule "${rule}" fired, but not for ${needle}: ${JSON.stringify(v)}`);
};

test("the real repository has zero violations", () => {
  assert.deepEqual(checkRepo(REPO), []);
});

test("frontmatter: a skill without a description is rejected", () => fires("frontmatter", (e) => e("skills/ds-usage.md", (t) => t.replace(/^---\n[\s\S]*?\n---\n/, "")), "ds-usage"));

test("command-ref: a reference to a skill that doesn't exist is rejected", () => fires("command-ref", (e) => e("README.md", (t) => t + "\nRun /ds-nonexistent now.\n"), "ds-nonexistent"));

test("json: a broken template is rejected", () => fires("json", (e) => e("templates/launch.example.json", () => "{ nope")));

for (const phrase of ["Code is canonical", "Storybook (code) wins", "richer output", "safe to apply directly", "/ds-report --no-figma", "Auto-publish on merge"]) {
  test(`banned-phrase: "${phrase}" is rejected`, () => fires("banned-phrase", (e) => e("guides/multi-brand.md", (t) => t + `\n${phrase}\n`), phrase));
}

test("banned phrases are allowed in the policy docs that quote them", () => {
  const v = violations((e) => e("SOURCE-OF-TRUTH.md", (t) => t + "\nCode is canonical (quoted).\n"));
  assert.equal(v.filter((x) => x.rule === "banned-phrase").length, 0);
});

test("no-figma-write (Guardrail 1): Figma write APIs in a skill or a guide are rejected", () => {
  fires("no-figma-write", (e) => e("skills/ds-tokens.md", (t) => t + "\n```js\nnode.setBoundVariable('fills', 0, v);\n```\n"), "ds-tokens");
  fires("no-figma-write", (e) => e("guides/getting-started.md", (t) => t + "\n```js\nnode.paddingTop = 8;\n```\n"), "getting-started");
  fires("no-figma-write", (e) => e("skills/ds-audit-figma.md", (t) => t + "\n```js\nconst f = figma.createFrame();\n```\n"), "ds-audit-figma");
});

for (const name of FIGMA_FIRST_SKILLS) {
  test(`policy-link + tie-break: ${name} must link the policy and state that Figma wins`, () => {
    fires("policy-link", (e) => e(`skills/${name}.md`, (t) => t.replaceAll("SOURCE-OF-TRUTH.md", "policy")), name);
    fires("tie-break", (e) => e(`skills/${name}.md`, (t) => t.replace(/Figma/g, "The design file")), name);
  });
}

test("proposal-first: ds-sync must not edit code without --apply-tokens and explicit approval", () => {
  fires("proposal-first", (e) => e("skills/ds-sync.md", (t) => t.replaceAll("--apply-tokens", "--go")));
  fires("proposal-first", (e) => e("skills/ds-sync.md", (t) => t.replace(/explicit(ly)? approv\w*/gi, "review")));
});

test("no-auto-publish: a CI job that publishes to Figma without manual + environment approval is rejected", () => {
  fires("no-auto-publish", (e) => e("guides/ci-integration.md", (t) => t + "\n```yaml\non:\n  push:\n    branches: [main]\njobs:\n  p:\n    steps:\n      - run: npx figma connect publish\n```\n"), "ci-integration");
  // …but a workflow_dispatch + environment-approved job is fine (the real guide has one)
  assert.equal(checkRepo(REPO).filter((x) => x.rule === "no-auto-publish").length, 0);
});

test("publish-explicit: the Code Connect guide must require a dry run and user-invoked publishing", () => {
  fires("publish-explicit", (e) => e("guides/code-connect.md", (t) => t.replaceAll("--dry-run", "")));
  fires("publish-explicit", (e) => e("guides/code-connect.md", (t) => t.replace(/never run `figma connect publish` on your own initiative/i, "feel free to publish")));
});

test("snapshot-freshness: CI, ds-report --snapshot, and the registry template must show provenance/checks", () => {
  fires("snapshot-freshness", (e) => e("guides/ci-integration.md", (t) => t.replaceAll("check-snapshot", "check")), "ci-integration");
  fires("snapshot-freshness", (e) => e("guides/ci-integration.md", (t) => t.replaceAll("--live", "")), "ci-integration");
  fires("snapshot-freshness", (e) => e("skills/ds-report.md", (t) => t.replaceAll("check-snapshot", "check")), "ds-report");
  fires("snapshot-freshness", (e) => e("templates/ds-registry.example.json", (t) => t.replace('"snapshot"', '"nosnapshot"')), "ds-registry.example");
});

test("design-md-provenance: ds-design-md must emit it and every consumer must check it", () => {
  fires("design-md-provenance", (e) => e("skills/ds-design-md.md", (t) => t.replaceAll("ds-source: figma-live", "x")), "ds-design-md");
  for (const n of ["ds-export", "ds-brand", "ds-diff"]) fires("design-md-provenance", (e) => e(`skills/${n}.md`, (t) => t.replaceAll("ds-source", "src").replaceAll("figma-live", "live")), n);
});

test("proto-figma-aware: ds-proto must handle presence, Figma-only gaps, and the design authority", () => {
  fires("proto-figma-aware", (e) => e("skills/ds-proto.md", (t) => t.replaceAll("Figma-only", "unbuilt")));
  fires("proto-figma-aware", (e) => e("skills/ds-proto.md", (t) => t.replace(/design authority/gi, "reference")));
});

test("registry-presence: template entries need presence, and Figma-only entries can't carry code fields", () => {
  const edit = (fn) => (e) => e("templates/ds-registry.example.json", (t) => { const j = JSON.parse(t); fn(j); return JSON.stringify(j); });
  fires("registry-presence", edit((j) => { delete j.components.Button.presence; }), "Button");
  fires("registry-presence", edit((j) => { j.components.Divider.sourceFile = "x.tsx"; }), "Divider");
  fires("registry-presence", edit((j) => { j.components.LegacyChip = { name: "LegacyChip", presence: { inFigma: false, inCode: true }, figma: { nodeId: "1:1" } }; }), "LegacyChip");
  fires("registry-presence", edit((j) => { j.outliers.figmaOnly.Divider = { reason: "dup" }; }), "Divider");
});

test("contrast-is-design: contrast failures can't be auto-fixed in code", () => {
  fires("contrast-is-design", (e) => e("skills/ds-wcag.md", (t) => t.replace(/Colou?r contrast failures are always MANUAL/g, "Contrast can be auto-fixed")));
  fires("banned-phrase", (e) => e("skills/ds-wcag.md", (t) => t + "\nDarken --muted-foreground in dark mode\n"), "Darken --muted-foreground");
});

test("no-value-override: DESIGN.md lint fixes must not change Figma-derived values", () =>
  fires("no-value-override", (e) => e("skills/ds-design-md.md", (t) => t.replace(/do \*\*not\*\* change any value in DESIGN\.md/, "suggest adjusted hex values in DESIGN.md"))));

test("brand-proposal: ds-brand output is stamped a proposal, and multi-brand never says code syncs to Figma", () => {
  fires("brand-proposal", (e) => e("skills/ds-brand.md", (t) => t.replaceAll("ds-source: brand-proposal", "ds-source: figma-live")));
  fires("banned-phrase", (e) => e("guides/multi-brand.md", (t) => t + "\n# Sync Brand A to Figma\n"), "Sync Brand A to Figma");
});

test("lifecycle-design-gate: deprecating requires a design decision in Figma first", () =>
  fires("lifecycle-design-gate", (e) => e("skills/ds-lifecycle.md", (t) => t.replace("deprecated or replaced **in Figma**", "marked deprecated"))));

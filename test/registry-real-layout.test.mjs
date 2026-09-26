// Regression: found by running the skills against the real AI UI Kit. Its barrel is
// `export * from './Button'` -> Button/index.ts -> `export { Button } from './Button'` -> Button/Button.tsx.
// The generator used to stop at the index files, found no components, and reported every built
// component as "in Figma, not yet built" (a false Figma-only detection).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRegistry, defaultConfig } from "../scripts/generate-ds-registry.ts";
import { REPO, FIXED_NOW } from "./helpers.mjs";

const ROOT = join(REPO, "test/fixtures/project-b");
const config = (root = ROOT) => ({
  ...defaultConfig(root),
  packageSources: [{ srcDir: join(root, "src/components"), barrelFile: "index.ts", packageName: "ui", priority: 1 }],
  storiesDirs: readdirSync(join(root, "src/components"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(root, "src/components", d.name)),
  now: () => FIXED_NOW,
});
const reg = () => buildRegistry(config());

test("components behind directory index re-exports are found (no false Figma-only)", () => {
  const r = reg();
  assert.deepEqual(r.components.Card.presence, { inFigma: true, inCode: true });
  assert.equal(r.components.Card.sourceFile, "src/components/Card/Card.tsx");
  assert.equal(r.components.Card.package, "ui");
  assert.deepEqual(Object.keys(r.components.Card.props), ["padded"]);
});

test("stories colocated with the component are linked", () => {
  const c = reg().components.Card;
  assert.equal(c.stories.file, "src/components/Card/Card.stories.tsx");
  assert.deepEqual(c.stories.variants, ["Default", "Padded"]);
});

test("compound parts re-exported by name are found (ListItem lives in List.tsx)", () => {
  const r = reg();
  assert.deepEqual(r.components.List.presence, { inFigma: true, inCode: true });
  assert.deepEqual(r.components.ListItem.presence, { inFigma: true, inCode: true });
  assert.equal(r.components.ListItem.sourceFile, "src/components/List/List.tsx");
});

test("genuine Figma-only and code-only are still distinguished", () => {
  const r = reg();
  assert.deepEqual(r.components.Toast.presence, { inFigma: true, inCode: false });
  assert.deepEqual(r.components.Tooltip.presence, { inFigma: false, inCode: true });
});

test("type-only re-exports are not components", () => {
  const r = reg();
  for (const n of ["CardProps", "ListProps", "ListItemProps"]) assert.equal(r.components[n], undefined);
});

test("circular re-exports terminate", () => {
  const dir = mkdtempSync(join(tmpdir(), "dss-cycle-"));
  try {
    mkdirSync(join(dir, "src/components"), { recursive: true });
    writeFileSync(join(dir, "src/components/index.ts"), "export * from './a';\n");
    writeFileSync(join(dir, "src/components/a.ts"), "export * from './b';\nexport function A() { return null; }\n");
    writeFileSync(join(dir, "src/components/b.ts"), "export * from './a';\nexport function B() { return null; }\n");
    const r = buildRegistry({ ...defaultConfig(dir), packageSources: [{ srcDir: join(dir, "src/components"), barrelFile: "index.ts", packageName: "ui", priority: 1 }], storiesDirs: [], now: () => FIXED_NOW });
    assert.deepEqual(Object.keys(r.components).sort(), ["A", "B"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

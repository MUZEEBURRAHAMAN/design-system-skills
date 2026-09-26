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

// Regression: found running the registry against the full AI UI Kit map. A component literally named `Icon`
// was dropped by the "skip icon glyph exports" heuristic, and `Sheet` (declared only as an alias re-export of
// Drawer) was invisible; both were then reported as Figma-only although they are built.
test("a component named Icon is not dropped by the icon-glyph skip rule", () => {
  assert.deepEqual(reg().components.Icon.presence, { inFigma: true, inCode: true });
});

test("a component declared only as an alias re-export (Drawer as Sheet) counts as built", () => {
  const r = reg();
  assert.deepEqual(r.components.Sheet.presence, { inFigma: true, inCode: true });
  assert.equal(r.components.Sheet.sourceFile, "src/components/Sheet/Sheet.tsx");
  assert.equal(r.components.SheetBody.presence.inFigma, false);
});

// Regression: Figma "Toast" is built (Toast.tsx exports ToastProvider/useToast) and the mapping says so via
// `sourceFile`, but the name-only match reported it as Figma-only. A declared, existing sourceFile counts as built.
test("a mapping sourceFile that exists marks a differently-named component as built (Notice -> NoticeProvider)", () => {
  const c = reg().components.Notice;
  assert.deepEqual(c.presence, { inFigma: true, inCode: true });
  assert.equal(c.sourceFile, "src/components/Notice/Notice.tsx");
  assert.equal(c.codeIdentity, "mapped");
});

test("a mapping sourceFile that does not exist stays Figma-only (no false 'built')", () => {
  assert.deepEqual(reg().components.Ghost.presence, { inFigma: true, inCode: false });
});

// Regression: 84 of the AI UI Kit's exports (CardHeader, DialogTitle, TabsTrigger ...) were listed as "built without a
// Figma source". They are parts of components Figma does have; they are tagged partOf instead.
test("a code-only compound part in a Figma component's source file is tagged partOf, not a separate design gap", () => {
  const r = reg();
  assert.equal(r.components.SheetBody.partOf, "Sheet");
  assert.equal(r.components.SheetContent.partOf, "Sheet");
  assert.equal(r.components.Tooltip.partOf, undefined, "a genuine code-only component has no owner");
  assert.equal(r.components.Sheet.partOf, undefined);
});

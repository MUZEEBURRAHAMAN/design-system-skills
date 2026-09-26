import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildRegistry, writeRegistry } from "../scripts/generate-ds-registry.ts";
import { FIXTURE, fixtureConfig, tempProject } from "./helpers.mjs";

const reg = () => buildRegistry(fixtureConfig());

test("every Figma-mapped component gets a registry entry, built or not", () => {
  const r = reg();
  for (const name of ["Button", "IconButton", "Badge", "DatePicker"]) {
    assert.ok(r.components[name], `${name} missing`);
    assert.equal(r.components[name].presence.inFigma, true, `${name} inFigma`);
    assert.ok(r.components[name].figma.nodeId, `${name} has a Figma node id`);
  }
});

test("Figma-only components are first-class: full Figma data, no code fields", () => {
  const r = reg();
  for (const name of ["IconButton", "DatePicker"]) {
    const c = r.components[name];
    assert.deepEqual(c.presence, { inFigma: true, inCode: false });
    assert.equal(c.sourceFile, undefined);
    assert.equal(c.package, undefined);
    assert.equal(c.variants, undefined, "code variants must not be invented for an unbuilt component");
    assert.ok(c.figma.variantCount > 0);
  }
  assert.deepEqual(r.components.IconButton.stories.variants, ["components-actions-iconbutton--default", "components-actions-iconbutton--disabled"], "pre-named stories from the mapping are surfaced");
  assert.equal(r.components.IconButton.section, "Actions");
});

test("built components merge code details onto the Figma entry", () => {
  const b = reg().components.Button;
  assert.deepEqual(b.presence, { inFigma: true, inCode: true });
  assert.equal(b.package, "@acme/ds");
  assert.equal(b.sourceFile, "packages/ds/src/components/button.tsx");
  assert.deepEqual(b.variants, { intent: ["primary", "secondary"], size: ["small", "large"] });
  assert.deepEqual(b.defaultVariants, { intent: "primary", size: "small" });
  assert.ok(b.props.loading && b.props.icon);
  assert.equal(b.figma.nodeId, "10:2");
  assert.equal(b.section, "Actions", "section comes from Figma, not the story title");
  assert.equal(b.stories.file, "packages/ds/stories/button.stories.tsx", "code-derived stories replace mapping's pre-listed ones");
  assert.deepEqual(b.stories.variants, ["Primary", "Secondary", "Loading"]);
  assert.ok(b.tokens.includes("primary-background"));
});

test("code-only components are surfaced, not hidden, and carry no Figma block", () => {
  const c = reg().components.LegacyChip;
  assert.deepEqual(c.presence, { inFigma: false, inCode: true });
  assert.equal(c.figma, undefined);
  assert.equal(c.section, "Uncategorized");
});

test("identity is by exact name: a case mismatch shows up as drift, Figma's name stays canonical", () => {
  const r = reg();
  assert.deepEqual(r.components.DatePicker.presence, { inFigma: true, inCode: false });
  assert.deepEqual(r.components.Datepicker.presence, { inFigma: false, inCode: true });
});

test("outliers hold only permanent documented exceptions and never duplicate components", () => {
  const r = reg();
  assert.deepEqual(Object.keys(r.outliers.figmaOnly), ["ColorPalette"]);
  assert.deepEqual(Object.keys(r.outliers.storybookOnly), ["useDebounce"]);
  assert.equal(r.outliers.figmaOnly.ColorPalette.figmaId, "99:1");
  assert.equal(r.components.ColorPalette, undefined);
  assert.equal(r.components.useDebounce, undefined);
});

test("higher-priority package wins a duplicate export name", () => {
  assert.equal(reg().components.Button.package, "@acme/ds");
});

test("sections come from both sources and are sorted", () => {
  assert.deepEqual(reg().sections, ["Actions", "Data Display", "Forms", "Uncategorized"]);
});

test("build is deterministic and matches the golden registry", () => {
  const a = JSON.stringify(reg(), null, 2);
  assert.equal(a, JSON.stringify(reg(), null, 2));
  const goldenPath = join(FIXTURE, "expected-registry.json");
  if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath, a + "\n");
  assert.equal(a + "\n", readFileSync(goldenPath, "utf8"), "registry differs from the golden file (UPDATE_GOLDEN=1 to accept an intended change)");
});

test("snapshot provenance records the Figma version and hashes of the inputs", () => {
  const s = reg()._meta.snapshot;
  const sha = (f) => createHash("sha256").update(readFileSync(join(FIXTURE, f))).digest("hex");
  assert.equal(s.source, "figma-mapping");
  assert.equal(s.figmaFile, "FIXTURE_FILE_KEY");
  assert.equal(s.figmaVersion, "1234567890");
  assert.equal(s.figmaModifiedAt, "2026-09-20T10:00:00.000Z");
  assert.equal(s.figmaMapSha256, sha(".claude/ds-story-figma-map.json"));
  assert.equal(s.tokenMapSha256, sha(".claude/ds-token-map.json"));
});

test("token and icon data are merged when present", () => {
  const r = reg();
  assert.equal(r._meta.tokenStats.primitives, 1);
  assert.equal(r.tokens.semantic["--primary-foreground"].figmaName, "primary-foreground");
  assert.deepEqual(r.icons.custom, ["LogoIcon"]);
});

test("without a Figma map the registry is code-only and says so: no snapshot, no inFigma", () => {
  const { dir, cleanup } = tempProject();
  try {
    rmSync(join(dir, ".claude/ds-story-figma-map.json"));
    const r = buildRegistry(fixtureConfig(dir));
    assert.equal(r._meta.snapshot, undefined);
    assert.equal(r.outliers, undefined);
    assert.ok(Object.values(r.components).every((c) => c.presence.inFigma === false && c.presence.inCode === true));
  } finally { cleanup(); }
});

test("with an empty Figma map nothing is invented on the Figma side", () => {
  const { dir, cleanup } = tempProject();
  try {
    const p = join(dir, ".claude/ds-story-figma-map.json");
    const m = JSON.parse(readFileSync(p, "utf8"));
    m.sections = {};
    writeFileSync(p, JSON.stringify(m));
    const r = buildRegistry(fixtureConfig(dir));
    assert.ok(Object.values(r.components).every((c) => !c.presence.inFigma && !c.figma));
  } finally { cleanup(); }
});

test("a component with no barrel export at all still appears when Figma has it", () => {
  const { dir, cleanup } = tempProject();
  try {
    writeFileSync(join(dir, "packages/ds/src/main.tsx"), "");
    writeFileSync(join(dir, "packages/form/src/main.tsx"), "");
    // a mapping sourceFile that exists would (correctly) count as built, so strip it: this test is about "not built"
    const mp = join(dir, ".claude/ds-story-figma-map.json");
    const m = JSON.parse(readFileSync(mp, "utf8"));
    for (const s of Object.values(m.sections)) for (const c of Object.values(s.components)) delete c.sourceFile;
    writeFileSync(mp, JSON.stringify(m));
    const r = buildRegistry(fixtureConfig(dir));
    assert.deepEqual(Object.keys(r.components).sort(), ["Badge", "Button", "DatePicker", "IconButton"]);
    assert.ok(Object.values(r.components).every((c) => c.presence.inFigma && !c.presence.inCode));
  } finally { cleanup(); }
});

test("writeRegistry writes the same JSON buildRegistry returns", () => {
  const { dir, cleanup } = tempProject();
  try {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    const cfg = fixtureConfig(dir);
    const built = writeRegistry(cfg);
    assert.deepEqual(JSON.parse(readFileSync(cfg.outputPath, "utf8")), JSON.parse(JSON.stringify(built)));
  } finally { cleanup(); }
});

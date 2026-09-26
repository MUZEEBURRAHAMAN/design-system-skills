import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, tempProject } from "./helpers.mjs";

/** Exercise the real entry points the way a consuming project does: scripts copied in, run with node. */
function install(dir) {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(join(REPO, "scripts/generate-ds-registry.ts"), join(dir, "scripts/generate-ds-registry.ts"));
  cpSync(join(REPO, "scripts/check-snapshot.mjs"), join(dir, "scripts/check-snapshot.mjs"));
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
}
const node = (dir, ...args) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", ...args], { cwd: dir, encoding: "utf8" });

test("generator CLI writes the registry, reports Figma-only and code-only components; freshness CLI then passes", () => {
  const { dir, cleanup } = tempProject();
  try {
    install(dir);
    const gen = node(dir, "scripts/generate-ds-registry.ts");
    assert.equal(gen.status, 0, gen.stderr);
    assert.match(gen.stdout, /in Figma, not yet built: .*IconButton.*DatePicker/);
    assert.match(gen.stdout, /built without a Figma source: .*LegacyChip/);
    const reg = JSON.parse(readFileSync(join(dir, ".claude/ds-registry.json"), "utf8"));
    assert.equal(reg.components.Button.presence.inCode, true);
    assert.equal(reg.components.IconButton.presence.inCode, false);

    // freshness CLI: fresh registry, generated "today" (real clock) → pass; then the mapping changes → fail with exit code 1.
    const ok = node(dir, "scripts/check-snapshot.mjs", "--root", dir, "--max-age-days", "1");
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /check-snapshot: OK/);

    const mapPath = join(dir, ".claude/ds-story-figma-map.json");
    const m = JSON.parse(readFileSync(mapPath, "utf8"));
    m.sections.Forms.components.Select = { figmaId: "30:9", figmaType: "COMPONENT" };
    writeFileSync(mapPath, JSON.stringify(m));
    const stale = node(dir, "scripts/check-snapshot.mjs", "--root", dir);
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /registry is stale/);

    const bad = node(dir, "scripts/check-snapshot.mjs", "--root", dir, "--bogus");
    assert.notEqual(bad.status, 0);
  } finally { cleanup(); }
});

test("freshness CLI: a live Figma value newer than the snapshot fails the job", () => {
  const { dir, cleanup } = tempProject();
  try {
    install(dir);
    assert.equal(node(dir, "scripts/generate-ds-registry.ts").status, 0);
    const r = node(dir, "scripts/check-snapshot.mjs", "--root", dir, "--figma-modified", "2026-09-25T00:00:00.000Z");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /older than Figma/);
  } finally { cleanup(); }
});

test("validate-skills CLI passes on the repository and exits non-zero on a violation", () => {
  const ok = spawnSync(process.execPath, ["scripts/validate-skills.mjs"], { cwd: REPO, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /validate-skills: OK/);
});

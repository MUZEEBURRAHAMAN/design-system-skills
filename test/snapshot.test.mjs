import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeRegistry } from "../scripts/generate-ds-registry.ts";
import { checkSnapshot, checkSnapshotLive, fetchLiveFigma } from "../scripts/check-snapshot.mjs";
import { FIXED_NOW, fixtureConfig, tempProject } from "./helpers.mjs";

const DESIGN_OK = "<!-- ds-source: figma-live; figmaFile: FIXTURE_FILE_KEY; generatedAt: 2026-09-25T00:00:00.000Z -->\n# DESIGN.md\n";

/** A fresh, consistent snapshot on disk. */
function snapshotProject(mutate) {
  const p = tempProject();
  writeRegistry(fixtureConfig(p.dir));
  writeFileSync(join(p.dir, "DESIGN.md"), DESIGN_OK);
  mutate?.(p.dir);
  return p;
}
const run = (dir, extra = {}) => checkSnapshot({ root: dir, now: new Date(FIXED_NOW.getTime() + 86_400_000), ...extra });
const editJson = (path, fn) => { const j = JSON.parse(readFileSync(path, "utf8")); fn(j); writeFileSync(path, JSON.stringify(j, null, 2)); };

test("a fresh, consistent snapshot passes and says freshness vs live Figma was not proven", () => {
  const { dir, cleanup } = snapshotProject();
  try {
    const r = run(dir);
    assert.deepEqual(r.problems, []);
    assert.ok(r.notes.some((n) => /not freshness against live Figma/.test(n)));
  } finally { cleanup(); }
});

test("passes when live Figma matches the snapshot", () => {
  const { dir, cleanup } = snapshotProject();
  try {
    assert.deepEqual(run(dir, { figmaModified: "2026-09-20T10:00:00.000Z", figmaVersion: "1234567890" }).problems, []);
  } finally { cleanup(); }
});

test("fails when Figma was modified after the snapshot was taken", () => {
  const { dir, cleanup } = snapshotProject();
  try {
    const r = run(dir, { figmaModified: "2026-09-25T08:00:00.000Z" });
    assert.equal(r.ok, false);
    assert.match(r.problems[0], /older than Figma/);
  } finally { cleanup(); }
});

test("fails when live Figma is on a different version", () => {
  const { dir, cleanup } = snapshotProject();
  try {
    const r = run(dir, { figmaVersion: "999" });
    assert.match(r.problems[0], /version 1234567890, live Figma is at 999/);
  } finally { cleanup(); }
});

test("fails when the mapping changed after the registry was generated", () => {
  const { dir, cleanup } = snapshotProject((d) => editJson(join(d, ".claude/ds-story-figma-map.json"), (m) => { m.sections.Forms.components.Select = { figmaId: "30:9", figmaType: "COMPONENT" }; }));
  try {
    assert.match(run(dir).problems.join("\n"), /registry is stale: \.claude\/ds-story-figma-map\.json changed/);
  } finally { cleanup(); }
});

test("fails when the token map changed after the registry was generated", () => {
  const { dir, cleanup } = snapshotProject((d) => editJson(join(d, ".claude/ds-token-map.json"), (t) => { t.stats.totalSemanticMapped = 2; }));
  try {
    assert.match(run(dir).problems.join("\n"), /ds-token-map\.json changed/);
  } finally { cleanup(); }
});

test("fails when the registry is older than the max age", () => {
  const { dir, cleanup } = snapshotProject();
  try {
    const r = checkSnapshot({ root: dir, now: new Date(FIXED_NOW.getTime() + 9 * 86_400_000), maxAgeDays: 7 });
    assert.match(r.problems.join("\n"), /9 days old \(max 7\)/);
  } finally { cleanup(); }
});

test("fails when the mapping records no Figma version or modified time", () => {
  const { dir, cleanup } = snapshotProject((d) => {
    const p = join(d, ".claude/ds-story-figma-map.json");
    editJson(p, (m) => { delete m._meta.figmaVersion; delete m._meta.figmaModifiedAt; });
    writeRegistry(fixtureConfig(d)); // regenerate so only the provenance gap remains
  });
  try {
    const r = run(dir);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /neither figmaVersion nor figmaModifiedAt/);
  } finally { cleanup(); }
});

test("fails when a live value is supplied but the mapping has nothing to compare it to", () => {
  const { dir, cleanup } = snapshotProject((d) => {
    editJson(join(d, ".claude/ds-story-figma-map.json"), (m) => { delete m._meta.figmaModifiedAt; });
    writeRegistry(fixtureConfig(d));
  });
  try {
    assert.match(run(dir, { figmaModified: "2026-09-25T00:00:00.000Z" }).problems.join("\n"), /no figmaModifiedAt to compare/);
  } finally { cleanup(); }
});

test("fails when the registry has no provenance at all", () => {
  const { dir, cleanup } = snapshotProject((d) => editJson(join(d, ".claude/ds-registry.json"), (r) => { delete r._meta.snapshot; }));
  try {
    assert.match(run(dir).problems.join("\n"), /no _meta\.snapshot provenance/);
  } finally { cleanup(); }
});

test("fails when the registry or mapping is missing", () => {
  const { dir, cleanup } = snapshotProject((d) => rmSync(join(d, ".claude/ds-registry.json")));
  try {
    assert.match(run(dir).problems[0], /ds-registry\.json is missing/);
    rmSync(join(dir, ".claude/ds-story-figma-map.json"));
    assert.match(run(dir).problems[0], /ds-story-figma-map\.json is missing|ds-registry\.json is missing/);
  } finally { cleanup(); }
});

test("DESIGN.md: a code-fallback file, an unlabelled file, and a file from another Figma file all fail", () => {
  const { dir, cleanup } = snapshotProject();
  try {
    const put = (t) => writeFileSync(join(dir, "DESIGN.md"), t);
    put("<!-- ds-source: code-fallback -->\n# DESIGN.md\n");
    assert.match(run(dir).problems.join("\n"), /"code-fallback", not figma-live/);
    put("# DESIGN.md\n");
    assert.match(run(dir).problems.join("\n"), /no ds-source provenance comment/);
    put("<!-- ds-source: figma-live; figmaFile: SOME_OTHER_FILE; generatedAt: 2026-09-25T00:00:00.000Z -->\n");
    assert.match(run(dir).problems.join("\n"), /different Figma file/);
    put(DESIGN_OK);
    assert.deepEqual(run(dir).problems, []);
  } finally { cleanup(); }
});

test("a project without DESIGN.md is noted, not failed", () => {
  const { dir, cleanup } = snapshotProject((d) => rmSync(join(d, "DESIGN.md")));
  try {
    const r = run(dir);
    assert.deepEqual(r.problems, []);
    assert.ok(r.notes.some((n) => /No DESIGN\.md/.test(n)));
  } finally { cleanup(); }
});

const stubFetch = (body, status = 200) => async (url, init) => { stubFetch.calls.push({ url, init }); return { ok: status < 400, status, json: async () => body }; };
stubFetch.calls = [];

test("live: fetches version/lastModified read-only with the token and passes when Figma hasn't changed", async () => {
  const { dir, cleanup } = snapshotProject();
  try {
    stubFetch.calls = [];
    const r = await checkSnapshotLive({ root: dir, now: new Date(FIXED_NOW.getTime() + 86_400_000) }, { token: "tok", fetchImpl: stubFetch({ version: "1234567890", lastModified: "2026-09-20T10:00:00.000Z" }) });
    assert.deepEqual(r.problems, []);
    assert.equal(stubFetch.calls.length, 1);
    assert.equal(stubFetch.calls[0].url, "https://api.figma.com/v1/files/FIXTURE_FILE_KEY?depth=1");
    assert.equal(stubFetch.calls[0].init.headers["X-Figma-Token"], "tok");
    assert.equal(stubFetch.calls[0].init.method, undefined, "a plain GET: no write verb");
    assert.ok(!r.notes.some((n) => /not freshness against live Figma/.test(n)), "live comparison was made");
  } finally { cleanup(); }
});

test("live: fails when Figma has moved on since the snapshot", async () => {
  const { dir, cleanup } = snapshotProject();
  try {
    const r = await checkSnapshotLive({ root: dir, now: new Date(FIXED_NOW.getTime() + 86_400_000) }, { token: "tok", fetchImpl: stubFetch({ version: "1234567999", lastModified: "2026-09-25T12:00:00.000Z" }) });
    assert.equal(r.ok, false);
    assert.match(r.problems.join("\n"), /older than Figma/);
    assert.match(r.problems.join("\n"), /live Figma is at 1234567999/);
  } finally { cleanup(); }
});

test("live: no token, an API error, or a malformed response are errors, never a silent pass", async () => {
  await assert.rejects(fetchLiveFigma("K", undefined, stubFetch({})), /FIGMA_ACCESS_TOKEN/);
  await assert.rejects(fetchLiveFigma("K", "t", stubFetch({}, 403)), /403/);
  await assert.rejects(fetchLiveFigma("K", "t", stubFetch({ version: "1" })), /no version\/lastModified/);
});

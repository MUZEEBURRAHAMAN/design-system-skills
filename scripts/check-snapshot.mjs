#!/usr/bin/env node
/**
 * Machine-checkable freshness for the committed Figma snapshot.
 *
 * CI cannot read live Figma, so it compares code against a committed snapshot
 * (.claude/ds-registry.json, ds-token-map.json, ds-story-figma-map.json,
 * DESIGN.md) that was generated from live Figma. This script proves the
 * snapshot is internally consistent, carries Figma provenance, is not too old,
 * and (when a live Figma value is supplied) is not older than the Figma file.
 *
 *   node scripts/check-snapshot.mjs [--root DIR] [--max-age-days N]
 *        [--figma-modified ISO] [--figma-version STRING] [--design-md PATH]
 *        [--live]      (read-only GET to Figma's REST API; needs FIGMA_ACCESS_TOKEN)
 *
 * --figma-modified / --figma-version come from a live check on a machine with
 * Figma access (Figma REST `GET /v1/files/:key` → `lastModified`, `version`, or
 * the Figma Console MCP file-version tools). Without them the snapshot is only
 * proven internally consistent and recent, and the result says so.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const DAY = 86_400_000;

/**
 * Ask Figma's REST API for the file's current version and last-modified time.
 * Read-only (a single GET). `fetchImpl` is injectable so tests never touch the network.
 */
export async function fetchLiveFigma(fileKey, token, fetchImpl = globalThis.fetch) {
  if (!token) throw new Error("--live needs FIGMA_ACCESS_TOKEN in the environment");
  const res = await fetchImpl(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=1`, { headers: { "X-Figma-Token": token } });
  if (!res.ok) throw new Error(`Figma API responded ${res.status} for file ${fileKey}`);
  const body = await res.json();
  if (!body.version || !body.lastModified) throw new Error("Figma API response had no version/lastModified");
  return { figmaVersion: String(body.version), figmaModified: body.lastModified };
}

/** checkSnapshot, but first fetching the live Figma state. */
export async function checkSnapshotLive(opts = {}, { token = process.env.FIGMA_ACCESS_TOKEN, fetchImpl } = {}) {
  const root = resolve(opts.root ?? process.cwd());
  const mapPath = join(root, ".claude/ds-story-figma-map.json");
  if (!existsSync(mapPath)) return checkSnapshot(opts);
  const fileKey = readJson(mapPath)._meta?.figmaFile;
  if (!fileKey) return checkSnapshot(opts);
  const live = await fetchLiveFigma(fileKey, token, fetchImpl);
  return checkSnapshot({ ...opts, ...live });
}

export function checkSnapshot(opts = {}) {
  const root = resolve(opts.root ?? process.cwd());
  const now = opts.now ?? new Date();
  const maxAgeDays = opts.maxAgeDays ?? 7;
  const problems = [];
  const notes = [];
  const fail = (m) => problems.push(m);

  const registryPath = join(root, ".claude/ds-registry.json");
  const mapPath = join(root, ".claude/ds-story-figma-map.json");
  const tokenMapPath = join(root, ".claude/ds-token-map.json");

  if (!existsSync(registryPath)) return { ok: false, problems: [".claude/ds-registry.json is missing — generate it (scripts/generate-ds-registry.ts)"], notes };
  if (!existsSync(mapPath)) return { ok: false, problems: [".claude/ds-story-figma-map.json is missing — the Figma mapping is the snapshot's base"], notes };

  const registry = readJson(registryPath);
  const map = readJson(mapPath);
  const snap = registry._meta?.snapshot;

  // 1. Provenance exists and says the data came from the Figma mapping.
  if (!snap) fail("registry has no _meta.snapshot provenance — regenerate it with the Figma-first generator");
  else {
    if (snap.source !== "figma-mapping") fail(`registry snapshot source is "${snap.source}", expected "figma-mapping"`);
    // 2. Registry was built from the mapping file that is committed now.
    if (snap.figmaMapSha256 !== sha(mapPath)) fail("registry is stale: .claude/ds-story-figma-map.json changed since the registry was generated — regenerate the registry");
    // 3. …and from the token map that is committed now.
    if (snap.tokenMapSha256 || existsSync(tokenMapPath)) {
      if (!existsSync(tokenMapPath)) fail("registry was built with a token map that is no longer committed");
      else if (snap.tokenMapSha256 !== sha(tokenMapPath)) fail("registry is stale: .claude/ds-token-map.json changed since the registry was generated — regenerate the registry");
    }
  }

  // 4. Age.
  const generated = new Date(registry._meta?.generatedAt ?? NaN);
  if (Number.isNaN(generated.getTime())) fail("registry _meta.generatedAt is missing or invalid");
  else if (now - generated > maxAgeDays * DAY) fail(`registry is ${Math.floor((now - generated) / DAY)} days old (max ${maxAgeDays}) — refresh the snapshot from live Figma`);

  // 5. Figma-side provenance in the mapping (what "fresh" is measured against).
  const meta = map._meta ?? {};
  if (!meta.figmaFile) fail("mapping _meta.figmaFile is missing");
  if (!meta.figmaVersion && !meta.figmaModifiedAt) fail("mapping _meta has neither figmaVersion nor figmaModifiedAt — the snapshot can't be proven fresh (record them from Figma when refreshing)");
  if (registry._meta?.figmaFile && meta.figmaFile && registry._meta.figmaFile !== meta.figmaFile) fail("registry and mapping disagree on the Figma file key");

  // 6. Compare with live Figma when the caller supplies it.
  let compared = false;
  if (opts.figmaModified) {
    compared = true;
    if (!meta.figmaModifiedAt) fail("live Figma modified time supplied, but the mapping has no figmaModifiedAt to compare");
    else if (new Date(meta.figmaModifiedAt) < new Date(opts.figmaModified)) fail(`snapshot is older than Figma: mapping was refreshed at Figma state ${meta.figmaModifiedAt}, Figma was modified ${opts.figmaModified} — refresh the snapshot`);
  }
  if (opts.figmaVersion) {
    compared = true;
    if (meta.figmaVersion !== opts.figmaVersion) fail(`snapshot is for Figma version ${meta.figmaVersion ?? "(none)"}, live Figma is at ${opts.figmaVersion} — refresh the snapshot`);
  }
  if (!compared) notes.push("No live Figma value supplied (--figma-modified / --figma-version): proved consistency and recency only, not freshness against live Figma. The scheduled live job must supply one.");

  // 7. DESIGN.md provenance.
  const designPath = opts.designMd ? resolve(root, opts.designMd) : [join(root, "DESIGN.md"), join(root, ".claude/DESIGN.md")].find(existsSync);
  if (designPath && existsSync(designPath)) {
    const m = readFileSync(designPath, "utf8").match(/<!--\s*ds-source:\s*([a-z-]+)(?:;\s*figmaFile:\s*([^;]+?))?(?:;\s*generatedAt:\s*([^\s]+))?\s*-->/);
    if (!m) fail(`${designPath.replace(root + "/", "")} has no ds-source provenance comment — regenerate with /ds-design-md`);
    else {
      if (m[1] !== "figma-live") fail(`${designPath.replace(root + "/", "")} is "${m[1]}", not figma-live — it isn't verified against Figma`);
      if (m[2] && meta.figmaFile && m[2].trim() !== meta.figmaFile) fail("DESIGN.md was generated from a different Figma file than the mapping");
    }
  } else notes.push("No DESIGN.md found; skipped its provenance check.");

  return { ok: problems.length === 0, problems, notes };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--root") o.root = v();
    else if (k === "--max-age-days") o.maxAgeDays = Number(v());
    else if (k === "--figma-modified") o.figmaModified = v();
    else if (k === "--figma-version") o.figmaVersion = v();
    else if (k === "--design-md") o.designMd = v();
    else if (k === "--live") o.live = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  let r;
  try { r = args.live ? await checkSnapshotLive(args) : checkSnapshot(args); }
  catch (e) { console.error("✖ " + e.message); process.exit(2); }
  for (const n of r.notes) console.log("ℹ " + n);
  if (!r.ok) { console.error(r.problems.map((p) => "✖ " + p).join("\n")); process.exit(1); }
  console.log("check-snapshot: OK");
}

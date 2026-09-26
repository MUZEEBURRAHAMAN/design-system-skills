import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "../scripts/generate-ds-registry.ts";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURE = join(REPO, "test/fixtures/project-a");
export const FIXED_NOW = new Date("2026-09-26T00:00:00.000Z");

export function fixtureConfig(root = FIXTURE, overrides = {}) {
  return {
    ...defaultConfig(root),
    packageSources: [
      { srcDir: join(root, "packages/ds/src"), barrelFile: "main.tsx", packageName: "@acme/ds", priority: 1 },
      { srcDir: join(root, "packages/form/src"), barrelFile: "main.tsx", packageName: "@acme/form", priority: 0 },
    ],
    now: () => FIXED_NOW,
    ...overrides,
  };
}

/** Copy the fixture project to a temp dir so a test can mutate it. */
export function tempProject() {
  const dir = mkdtempSync(join(tmpdir(), "dss-fixture-"));
  cpSync(FIXTURE, dir, { recursive: true, filter: (s) => !s.endsWith("expected-registry.json") });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Copy the repo's publishable content (no .git/tests) so a test can inject a violation. */
export function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "dss-repo-"));
  for (const entry of ["skills", "guides", "rules", "templates", "scripts"]) cpSync(join(REPO, entry), join(dir, entry), { recursive: true });
  for (const f of ["README.md", "SOURCE-OF-TRUTH.md", "CLAUDE.md"]) cpSync(join(REPO, f), join(dir, f));
  mkdirSync(join(dir, "test"), { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

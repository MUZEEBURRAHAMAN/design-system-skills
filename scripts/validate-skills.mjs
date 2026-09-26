#!/usr/bin/env node
// Verifies the Figma-first invariants of this repo. Run: node scripts/validate-skills.mjs
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRepo } from "./lib/rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = checkRepo(ROOT);
if (problems.length) {
  console.error(problems.map((p) => `✖ [${p.rule}] ${p.file}: ${p.message}`).join("\n"));
  process.exit(1);
}
console.log("validate-skills: OK");

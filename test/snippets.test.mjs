// Regression: found running ds-report against the real AI UI Kit Figma file, where the documented
// inventory snippet (which required a frame named "content") returned {} — and the skill would then
// have reported every component as CODE ONLY. We execute the snippet text from the skill against a
// mock Figma tree shaped like the real file (captured from the live Button and Composer pages).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { REPO } from "./helpers.mjs";

const md = readFileSync(join(REPO, "skills/ds-report.md"), "utf8");
const snippet = md.slice(md.indexOf("### 1.1 Figma Inventory")).match(/```js\n([\s\S]*?)```/)[1];

function node(type, name, id, children = [], extra = {}) {
  const n = { type, name, id, children, description: "", ...extra };
  for (const c of children) c.parent = n;
  n.findAll = (fn) => children.flatMap((c) => [...(fn(c) ? [c] : []), ...(c.findAll ? c.findAll(fn) : [])]);
  return n;
}
const variants = (k) => Array.from({ length: k }, (_, i) => node("COMPONENT", `Size=${i}`, `v${i}`));

// Real Button page: section "Button_Components" > COMPONENT_SET "button" (150 variants) + a spacer frame; "Button Guide" > frames.
const buttonPage = node("PAGE", "Button", "34:4995", [
  node("SECTION", "Button_Components", "34:5104", [node("COMPONENT_SET", "button", "34:4912", variants(150)), node("FRAME", " ", "34:4992", [])]),
  node("SECTION", "Button Guide", "74:195", [node("FRAME", "Button Page Content", "34:4996", [node("FRAME", "Dark Mode Preview", "x", [])])]),
]);
// Real Composer page: single COMPONENT "Default" inside a "Component Set Wrapper" frame.
const composerPage = node("PAGE", "Composer", "203:3695", [
  node("SECTION", "Composer_Components", "203:3696", [node("FRAME", "Component Set Wrapper", "w", [node("COMPONENT", "Default", "203:3869")])]),
  node("SECTION", "Composer Guide", "203:3697", [node("FRAME", "Composer Page Content", "c", [])]),
]);
const run = (page) => vm.runInNewContext(`(function(){ ${snippet} })()`, { figma: { currentPage: page } });

test("inventory snippet finds the component set on the real Button page structure", () => {
  const inv = run(buttonPage);
  assert.deepEqual(Object.keys(inv), ["Button_Components"]);
  assert.equal(inv.Button_Components[0].id, "34:4912");
  assert.equal(inv.Button_Components[0].variantCount, 150);
});

test("inventory snippet finds a standalone component inside a wrapper frame (real Composer page)", () => {
  const inv = run(composerPage);
  assert.deepEqual(inv.Composer_Components.map((c) => c.id), ["203:3869"]);
  assert.equal(inv.Composer_Components[0].variantCount, 1);
  assert.equal(inv["Composer Guide"], undefined, "documentation sections are not components");
});

test("the skill tells Claude an empty Figma read is a failure, not a finding", () => {
  assert.match(md, /empty inventory is a failure of the read/i);
  assert.match(md, /never continue and report every component as CODE ONLY/i);
});

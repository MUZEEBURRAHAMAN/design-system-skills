# design-system-skills (Figma-first fork) — Contributor Instructions

This repository is a package of Claude Code skills (`.claude/commands/`), a rule, guides, and JSON templates for managing a design system across Figma, Storybook, and code. It is a fork of [NewMediaStudio/design-system-skills](https://github.com/NewMediaStudio/design-system-skills), adapted so **Figma is the design source of truth** instead of code.

Read [SOURCE-OF-TRUTH.md](SOURCE-OF-TRUTH.md) before changing anything in this repo. It defines the canonical flow (Figma → spec → implementation → audit) and six hard guardrails. Every rule below exists to enforce that document.

## Ground rules for any change here

- **Never add a code/Storybook → Figma write path.** Read access to Figma (`figma_execute`, `figma_get_variables`, `figma_capture_screenshot`, etc.) is fine anywhere. A skill that writes to a Figma node as a "fix" or "sync" is not acceptable in this fork — see Guardrail 1 in `SOURCE-OF-TRUTH.md`. The single exception is an explicit, user-invoked Code Connect publish (dry run first; CI only ever dry-runs).
- **Code-side fixes are proposals.** Nothing edits the user's code unless they explicitly approve it (`/ds-sync --apply-tokens`, per-item ARIA fixes). Colour-contrast failures are design issues for Figma's owner, never fixed by changing a token in code.
- **State the tie-break explicitly.** Every skill's "Key Rules" section must say what happens when Figma and code/Storybook disagree, and the answer is always "Figma is correct; the finding is implementation drift." Don't leave this implicit or let old upstream language ("Storybook wins," "code is canonical") survive an edit.
- **Figma-only entities are first-class.** A component, token, or icon that exists in Figma but not yet in code is a real record with real data (variants, bound variables, resolved values), not a one-line name in an "outliers"/"figmaOnly" bucket.
- **Component identity is name-based, not raw-node-ID-based.** Figma node IDs regenerate when a node is recreated (see the `STALE_ID` detection already in `ds-sync.md`/`ds-audit-figma.md`); don't key any JSON schema by a raw node ID.
- **The skills are markdown; the scripts are tooling.** Skills are markdown files with YAML frontmatter (`---\ndescription: ...\n---`) copied into a consuming project's `.claude/commands/`. `scripts/generate-ds-registry.ts` and `scripts/check-snapshot.mjs` are meant to be copied into a consumer's `scripts/` directory and run there; `scripts/lib/rules.mjs`, `scripts/validate-skills.mjs`, and `test/` are this repo's own checks.

## Before calling anything done

Run `npm install && npm run check` — it runs `tsc --strict` on the registry generator, `scripts/validate-skills.mjs` (every source-of-truth rule in `scripts/lib/rules.mjs`), and the fixture-based tests in `test/` (registry presence logic, snapshot freshness, and a mutation test per rule: each rule is proven to fire when its violation is injected). A new rule needs a test that injects the violation. A change to the registry output needs `UPDATE_GOLDEN=1 npm test` and a reviewed diff of `test/fixtures/project-a/expected-registry.json`.

## What this fork cannot verify by itself

There is no Figma file or Storybook instance bundled with this repository (its own CI, `.github/workflows/check.yml`, just runs `npm run check`). Everything that depends on the Figma Console MCP or a live Storybook (which is most of what these skills actually do) can only be verified once the skills are installed into a real consuming project — see `guides/getting-started.md`. Don't claim a change here is "working" beyond what `npm run check` proves; the tests check the generator, the freshness checker, and that the rules are written into the skill text — not that Claude obeys them at runtime.

## Provenance

- Upstream: [NewMediaStudio/design-system-skills](https://github.com/NewMediaStudio/design-system-skills) (MIT).
- This fork changes the source-of-truth architecture only. Where upstream behavior was already source-of-truth-neutral (accessibility criteria, usage/adoption scanning, the Storybook launcher), it was kept as-is; `git log` shows exactly what changed.

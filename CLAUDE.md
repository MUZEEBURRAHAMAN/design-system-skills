# design-system-skills (Figma-first fork) — Contributor Instructions

This repository is a package of Claude Code skills (`.claude/commands/`), a rule, guides, and JSON templates for managing a design system across Figma, Storybook, and code. It is a fork of [NewMediaStudio/design-system-skills](https://github.com/NewMediaStudio/design-system-skills), adapted so **Figma is the design source of truth** instead of code.

Read [SOURCE-OF-TRUTH.md](SOURCE-OF-TRUTH.md) before changing anything in this repo. It defines the canonical flow (Figma → spec → implementation → audit) and six hard guardrails. Every rule below exists to enforce that document.

## Ground rules for any change here

- **Never add a code/Storybook → Figma write path.** Read access to Figma (`figma_execute`, `figma_get_variables`, `figma_capture_screenshot`, etc.) is fine anywhere. A skill that writes to a Figma node as a "fix" or "sync" is not acceptable in this fork, full stop — see Guardrail 1 in `SOURCE-OF-TRUTH.md`.
- **State the tie-break explicitly.** Every skill's "Key Rules" section must say what happens when Figma and code/Storybook disagree, and the answer is always "Figma is correct; the finding is implementation drift." Don't leave this implicit or let old upstream language ("Storybook wins," "code is canonical") survive an edit.
- **Figma-only entities are first-class.** A component, token, or icon that exists in Figma but not yet in code is a real record with real data (variants, bound variables, resolved values), not a one-line name in an "outliers"/"figmaOnly" bucket.
- **Component identity is name-based, not raw-node-ID-based.** Figma node IDs regenerate when a node is recreated (see the `STALE_ID` detection already in `ds-sync.md`/`ds-audit-figma.md`); don't key any JSON schema by a raw node ID.
- **This repo has no build step and no runtime of its own.** Skills are markdown files with YAML frontmatter (`---\ndescription: ...\n---`) copied into a consuming project's `.claude/commands/`. The one exception is `scripts/generate-ds-registry.ts`, a TypeScript file meant to be copied into a consumer's `scripts/` directory and run there.

## Before calling anything done

Run `node scripts/validate-skills.mjs` (added in this fork — see the script for what it checks: frontmatter validity, that every `/ds-*` command referenced in prose actually exists as a file, that JSON templates parse, and that none of the banned upstream phrases listed inside the script have crept back in) and `npx tsc --noEmit scripts/generate-ds-registry.ts`. Both must pass before a PR is opened.

## What this fork cannot verify by itself

There is no Figma file, Storybook instance, or CI pipeline bundled with this repository. Everything that depends on the Figma Console MCP or a live Storybook (which is most of what these skills actually do) can only be verified once the skills are installed into a real consuming project — see `guides/getting-started.md`. Don't claim a change here is "working" beyond what `validate-skills.mjs` and `tsc` can actually check.

## Provenance

- Upstream: [NewMediaStudio/design-system-skills](https://github.com/NewMediaStudio/design-system-skills) (MIT).
- This fork changes the source-of-truth architecture only. Where upstream behavior was already source-of-truth-neutral (accessibility rules, usage/adoption scanning, DESIGN.md diff/export/brand-forking, the Storybook launcher), it was kept as-is — see the "Confirmed source-neutral" list in the migration audit this fork was built from, or just check `git log` for what actually changed.

# Source-of-Truth Policy

This fork changes one thing about the original [design-system-skills](https://github.com/NewMediaStudio/design-system-skills) toolkit: **which system is allowed to be wrong.**

The upstream project's architecture is stated in its own README:

> Code (component library) → Storybook (rendered truth) → Figma (design mirror)
> **Code is canonical. When Storybook and Figma disagree, Storybook (code) wins.**

This fork inverts that. Every skill in this repository must follow the canonical flow below, and nothing in this repository may make Figma conform to code automatically.

## Canonical Flow

```
Figma Variables, Styles, and Components
        │   (read; inspected live via the Figma Console MCP; never silently overwritten)
        ▼
Machine-readable DS spec
        │   ds-spec, ds-design-md, ds-registry — generated FROM Figma, cross-referenced with code
        ▼
React / Storybook implementation
        │   a human, or Claude with explicit approval, applies the proposed change to code
        ▼
Automated audit
        ds-audit-figma, ds-report, ds-tokens, ds-wcag — compare the implementation back against Figma
```

If code/Storybook and Figma disagree, **Figma is correct** and the finding is "the implementation has drifted," never "the design file is stale." The fix — when one is proposed at all — targets a component source file or a CSS token file. It never targets a Figma node.

## The Six Guardrails

1. **No skill writes to a Figma node as a "fix."** Figma is edited by a designer, or by an explicit, separately-confirmed action outside the normal audit/sync loop — never as a side effect of running a skill. Read access to Figma (via `figma_execute`, `figma_get_variables`, `figma_capture_screenshot`, etc.) is unrestricted and expected; write access to Figma is not part of any skill's normal operation. **The one exception** is an explicit, user-invoked Code Connect publish (`guides/code-connect.md`): a dry run first, then a person decides, and it may only attach implementation info (code snippets, prop mappings) — never add, rename, or restyle a Figma property, variant, or variable. CI validates with `--dry-run` and never publishes on its own.
2. **No duplicate components.** A local re-implementation of a design-system component is always flagged, regardless of which side it drifted from.
3. **No hard-coded values.** Every color, spacing, and radius value in both code and Figma must trace to a token/variable. A code value with no Figma variable behind it is a defect in code, not evidence Figma should adopt a raw value.
4. **No arbitrary visual overrides.** A proposed code fix must trace to a real Figma variable, style, or resolved property value — never a number invented from a screenshot diff or an "eyeballed" correction.
5. **No unapproved architecture changes.** A structural mismatch (missing/extra nodes, a different component tree shape) between Figma and code is always reported as needing manual review. It is never auto-reconciled in either direction.
6. **Figma-only components are first-class.** A component that exists in Figma but has no code implementation yet is not an "outlier" or a footnote — it's a real registry entry with real variant, token, and prop data read from Figma, carrying a status like `not_yet_built`, ready to drive an implementation.

## Proposal-First: Code Is Never Changed Silently Either

Figma being the authority also means code isn't rewritten on a skill's say-so. Every skill's implementation-side fix is a **reviewable proposal** by default. `/ds-sync` applies a token correction only when invoked with `--apply-tokens` *and* the user then explicitly approves the exact list; structural and spacing fixes are always proposals. `/ds-wcag` applies mechanical ARIA fixes only per-item on approval, and treats colour-contrast failures as **design issues for the Figma owner** — never something to "fix" by changing a token or colour in code.

## Provenance and Freshness Are Machine-Checked

CI compares code against a committed snapshot of Figma, so the snapshot must prove what it is:

- The registry records `_meta.snapshot` (Figma file, version, last-modified, and SHA-256 of the mapping and token map it was built from).
- `DESIGN.md` starts with `<!-- ds-source: figma-live; ... -->`; a code-only fallback is `ds-source: code-fallback`, and a brand fork is `ds-source: brand-proposal`. Only `figma-live` counts as Figma-verified.
- `node scripts/check-snapshot.mjs` fails on a missing/inconsistent snapshot, one older than the max age, a code-only DESIGN.md, or — when checked against live Figma (`--live` does one read-only REST GET; or pass `--figma-modified` / `--figma-version`) — a snapshot older than Figma itself. `--live` needs only a Figma access token, not Figma Desktop, so it runs on any CI runner.

## What Changed From Upstream

| Area | Upstream (code-first) | This fork (Figma-first) |
|---|---|---|
| Tie-break on disagreement | Storybook (code) wins | Figma wins |
| `/ds-sync` | Renders Storybook, writes corrections into Figma nodes | Reads Figma, proposes corrections to code/token files; never touches Figma |
| `/ds-tokens` | Ambiguous — could suggest removing a Figma-only variable | A token missing from code is always "add it to code," never "remove it from Figma" |
| `/ds-design-md` default | Code sources only; Figma is an opt-in `--figma` flag ("richer output") | Figma is the default source; running without it is a degraded fallback, clearly labelled |
| `/ds-spec --figma` | Writes generated spec content into Figma as new frames | Removed. Spec generation reads Figma's own anatomy/variants/props as the source |
| Registry (`ds-registry.json`) | Built by enumerating the code barrel export; `figmaOnly` entries are a bare name string | Built by enumerating Figma's sections/components first, cross-referenced against code; `figmaOnly` entries carry full variant/token/prop data |
| Identity tie-break (`/ds-report`) | Code/story PascalCase name is canonical | Figma's component name is canonical |
| CI default gate | `/ds-report --no-figma` on every PR; Figma-inclusive checks are weekly-only | Snapshot freshness (`check-snapshot.mjs`) then `/ds-report --snapshot` on every PR; a live-Figma job proves the snapshot isn't stale |
| Code fixes | `/ds-sync` edited files directly | Proposals; applied only with `--apply-tokens` + explicit approval |
| `/ds-proto` | Composed from code inventory only | Classifies components by presence, treats Figma as the design authority, reports Figma gaps, and never lets prototype decisions become design decisions |
| Code Connect framing | "Figma's own inference is often wrong; code corrects it" | Code Connect publishes implementation status against Figma's own canonical variant/property definitions |

## Every Skill's Prerequisites Must Say This

Every skill file in `skills/` links back to this document in its own words where relevant (typically in "Key Rules"). If you add a new skill, it must not introduce a code/Storybook → Figma write path, and its Key Rules must state which side wins on disagreement (Figma) explicitly — don't leave it implicit.

## Honest Limits

- Figma node IDs are not used as the primary key anywhere in this toolkit's JSON files, because they're documented as unstable (see `STALE_ID` detection in `ds-sync.md` and `ds-audit-figma.md` — a node ID goes stale the moment a component is recreated in Figma). Component **names** remain the stable identity; this is a Figma-first policy, not a raw-node-ID-first one.
- This repository ships no live Figma file or Storybook. `npm run check` proves the registry/presence logic (against fixtures), the snapshot-freshness checker, and that the written rules (including every rule in this file) are present and enforced in the skill text. It cannot prove that Claude follows those instructions at runtime, or exercise `figma_execute`/Storybook calls — that only happens once the skills are installed in a real project. Snapshot freshness is enforced only where a job runs `check-snapshot.mjs`; and only against live Figma where a job supplies `--figma-modified`/`--figma-version`.

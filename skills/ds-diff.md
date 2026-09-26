---
description: Compare DESIGN.md token values across git refs to surface regressions before they ship
---

# DS Diff

Compare the current `DESIGN.md` against any git ref and report token-level changes: color value shifts, contrast regressions, added or removed tokens, and section ordering violations.

## Prerequisites

- `DESIGN.md` or `.claude/DESIGN.md` with YAML front matter (generated with `/ds-design-md --spec`). A diff is only a *Figma* diff if both refs carry `ds-source: figma-live`; if either side is `code-fallback` or unlabelled, say so at the top of the diff output
- `design.md` CLI installed (`npm install --save-dev design.md`)
- Git repository with commit history

## Arguments

- `$ARGUMENTS` — git ref to compare against (branch, tag, or commit SHA). Defaults to `HEAD~1`.
- `--pr` — post the diff summary as a comment on the open GitHub PR for the current branch
- `--fail-on-contrast` — exit non-zero if any color pair regresses below WCAG AA (4.5:1 text, 3:1 UI)
- `--json` — write structured diff output to `.claude/ds-diff-latest.json`

---

## Phase 1: Resolve Comparison Target

Parse `$ARGUMENTS` to extract the git ref. If empty, use `HEAD~1`.

```bash
git show <ref>:DESIGN.md > /tmp/design-md-prev.md 2>/dev/null \
  || git show <ref>:.claude/DESIGN.md > /tmp/design-md-prev.md
```

If neither path exists at the target ref, report that the file didn't exist at that point and exit — no comparison is possible.

Confirm the current file has YAML front matter. If not, prompt the user to regenerate with `/ds-design-md --spec` before diffing.

---

## Phase 2: Run `design.md diff`

```bash
npx design.md diff /tmp/design-md-prev.md DESIGN.md --json > /tmp/design-md-diff.json
```

Parse the JSON output into four change categories:

| Category | Description |
|---|---|
| **Added** | Tokens present in current, absent in ref |
| **Removed** | Tokens present in ref, absent in current |
| **Changed** | Tokens present in both with different values |
| **Structural** | Section ordering or front matter schema violations |

---

## Phase 3: Analyse Color Changes

For every changed or added color token, compute WCAG contrast ratios against all relevant pairings (foreground against background, primary against white, destructive against surface).

```
contrast ratio = (L1 + 0.05) / (L2 + 0.05)
where L = relative luminance of the hex value
```

Flag any pair that:
- Was passing (≥ 4.5:1) in the ref and now fails in current
- Was failing and now passes (improvement, worth noting)

---

## Phase 4: Format Report

Produce a diff summary in this structure:

```
## DESIGN.md Diff: <current-branch> vs <ref>

### Token Changes (N)

| Token | Path | Before | After | Contrast Impact |
|---|---|---|---|---|
| primary | colors.primary | #1a6cf7 | #2563eb | ✓ passes (7.2:1) |
| muted | colors.muted | #6b7280 | #9ca3af | ✗ regresses to 2.9:1 |

### Added (N)
- colors.success: #22c55e

### Removed (N)
- colors.info: #3b82f6

### Structural
- Section "Shapes" appears before "Layout" — canonical order violated

---
Contrast regressions: N  |  Improvements: N  |  Ref: <sha>
```

If no changes: report "No token changes between <current> and <ref>."

---

## Phase 5: Post PR Comment (`--pr`)

If `--pr` is set, post the formatted report as a PR comment on the current branch's open pull request:

```bash
gh pr comment --body "$(cat /tmp/ds-diff-report.md)"
```

If no open PR exists for the current branch, skip silently and note it in output.

---

## Phase 6: Write JSON (`--json`)

If `--json` is set, write the structured diff to `.claude/ds-diff-latest.json`:

```json
{
  "ref": "<sha>",
  "branch": "<current-branch>",
  "date": "<iso-date>",
  "changed": [...],
  "added": [...],
  "removed": [...],
  "structural": [...],
  "contrastRegressions": [...]
}
```

---

## Phase 7: Exit Code (`--fail-on-contrast`)

If `--fail-on-contrast` is set and any contrast regression was found, exit with code `1`. Use this as a CI gate:

```yaml
- name: Token contrast gate
  run: claude --print "/ds-diff main --fail-on-contrast"
```

---

## Key Rules

1. **Front matter required** — no YAML front matter means no structured diff. Prompt regeneration rather than guessing.
2. **Contrast regression is blocking** — a color that passes in `main` and fails in a PR branch is a ship stopper.
3. **Structural violations are warnings** — section order issues are reported but do not block.
4. **Removals are loud** — removed tokens may break downstream consumers; always surface them prominently.

## Usage

```bash
# Diff against the previous commit
/ds-diff

# Diff against main
/ds-diff main

# Diff against a release tag and post to the open PR
/ds-diff v2.0.0 --pr

# CI gate: fail on contrast regressions
/ds-diff main --fail-on-contrast

# Full diff with JSON output
/ds-diff main --pr --json
```

---
description: Manage design system component lifecycle — track status, flag overdue promotions, and handle deprecations
---

# Design System Lifecycle Manager

Track each component's lifecycle stage (proposed → alpha → beta → stable → deprecated → removed), enforce promotion criteria, generate deprecation notices, and keep the registry and codebase in sync with lifecycle decisions.

## Prerequisites

- `.claude/ds-registry.json` — unified component registry (provides component list; lifecycle fields will be added/updated here)
- `design-system-manifest.json` — component inventory (fallback if no registry)
- `.claude/ds-lifecycle.json` — lifecycle state file (created on first run if absent)

## Arguments

- `$ARGUMENTS` — command and optional component filter:
  - `status` — list all components with current lifecycle stage (default)
  - `promote Button` — propose promoting a component to the next stage
  - `deprecate Button` — mark a component as deprecated and generate notices
  - `remove Button` — validate that a component is safe to remove
  - `audit` — flag components overdue for promotion or that have stale stages
  - (empty) — same as `status`

---

## Lifecycle Stages

```
proposed → alpha → beta → stable → deprecated → removed
```

| Stage | Meaning | Who Can Use |
|-------|---------|-------------|
| **proposed** | Design spec exists, no code yet | Nobody — design review only |
| **alpha** | Initial implementation, API not final | Feature teams with explicit opt-in |
| **beta** | Feature-complete, API stabilising | Any team — breaking changes possible |
| **stable** | API frozen, full test + a11y coverage | All teams — safe for production |
| **deprecated** | Replacement exists, removal planned | Existing usages only — no new uses |
| **removed** | Deleted from codebase | — |

---

## Phase 1: Load Lifecycle State

### 1.1 Read `.claude/ds-lifecycle.json`

If the file exists, load it:

```json
{
  "_meta": {
    "lastUpdated": "2026-04-17",
    "totalComponents": 22
  },
  "components": {
    "Button": {
      "stage": "stable",
      "promotedAt": { "alpha": "2025-01-10", "beta": "2025-02-14", "stable": "2025-04-01" },
      "deprecatedAt": null,
      "removalTarget": null,
      "owner": "design-systems-team",
      "replacedBy": null,
      "notes": ""
    },
    "LegacyAlert": {
      "stage": "deprecated",
      "promotedAt": { "alpha": "2024-06-01", "beta": "2024-07-15", "stable": "2024-09-01" },
      "deprecatedAt": "2026-01-15",
      "removalTarget": "2026-07-01",
      "owner": "design-systems-team",
      "replacedBy": "Alert",
      "notes": "Replaced by Alert with new token architecture."
    }
  }
}
```

If the file is absent, generate it from the registry/manifest with all built components set to `stage: "stable"` (safest default) and prompt the user to review. Any registry component with `presence.inCode: false` (designed in Figma, not built yet) is seeded at `stage: "proposed"` instead — Figma-first means a designed component is a real, tracked entity before its first line of code.

### 1.2 Cross-Reference with Registry

For each component in the registry/manifest, verify it has a lifecycle entry. Flag components with no entry as **UNTRACKED**.

---

## Phase 2: Status Report (`status`)

List all components grouped by lifecycle stage:

```markdown
# Design System Lifecycle Status
**Date:** 2026-04-17
**Total components:** 22

## stable (15)
| Component | Promoted | Owner | Notes |
|-----------|----------|-------|-------|
| Button | 2025-04-01 | ds-team | — |
| Input | 2025-04-01 | ds-team | — |
| ...

## beta (3)
| Component | In Beta Since | Target Stable | Blockers |
|-----------|--------------|---------------|----------|
| DatePicker | 2026-02-01 | 2026-05-01 | Missing keyboard test coverage |
| Combobox | 2026-03-15 | 2026-06-01 | — |

## alpha (2)
| Component | In Alpha Since | Target Beta |
|-----------|---------------|-------------|
| ColorPicker | 2026-04-01 | 2026-06-01 |

## deprecated (2)
| Component | Deprecated | Removal Target | Replaced By | Active Usages |
|-----------|:----------:|:--------------:|-------------|:---:|
| LegacyAlert | 2026-01-15 | 2026-07-01 | Alert | 12 |
| OldButton | 2025-11-01 | 2026-05-01 | Button | 3 |

## proposed (0)

## untracked (1)
| Component | Action Needed |
|-----------|--------------|
| ExperimentalGrid | Add to ds-lifecycle.json |
```

---

## Phase 3: Lifecycle Audit (`audit`)

Check for components that may be in the wrong stage or overdue for promotion.

### 3.1 Overdue for Promotion

For each non-stable, non-deprecated component, check time-in-stage against recommended maximums:

| Stage | Recommended Max Duration |
|-------|--------------------------|
| proposed | 4 weeks |
| alpha | 8 weeks |
| beta | 12 weeks |

Flag components that have exceeded the recommended duration:

```
DatePicker — BETA since 2025-11-01 (23 weeks). Recommended max: 12 weeks.
Action: Evaluate for promotion to stable or document blockers.
```

### 3.2 Promotion Readiness Checks

For components approaching promotion to **stable**, verify:

- [ ] Source code analysis passes (no `TODO` or `FIXME` in component file)
- [ ] Story file has at least 3 variants (default, disabled, error/edge case)
- [ ] ds-wcag score: COMPLIANT or MINOR ISSUES only (≥ 14/20)
- [ ] No open P0 issues in ds-wcag report
- [ ] Token bindings verified (no hardcoded values in Figma)
- [ ] ds-spec file exists
- [ ] `changelog.md` or registry `changelog[]` entry for this release

### 3.3 Deprecated Components with Active Usages

For each deprecated component, scan the codebase for active imports:

```bash
grep -rn "import.*DeprecatedComponent" apps/ src/ --include="*.tsx" --include="*.ts"
```

If `replacedBy` is set, also check whether the replacement is being used in the same files.

Flag: "LegacyAlert has 12 active usages but removal is targeted for 2026-07-01 (75 days away)."

---

## Phase 4: Promote (`promote [ComponentName]`)

Walk through the promotion checklist for the specified component and propose moving it to the next stage.

### 4.1 Run Promotion Checklist

Check all criteria for the target stage (see Phase 3.2). Report pass/fail for each:

```
Promoting DatePicker: beta → stable

✅ Source: no TODO/FIXME
✅ Stories: 5 variants found
⚠️ WCAG: 15/20 (MINOR ISSUES) — 2 P1 issues remain
✅ Figma: token bindings verified
❌ Spec: .claude/ds-specs/DatePicker.md not found — run /ds-spec DatePicker first
✅ Changelog: entry found

Result: NOT READY — fix 2 blockers before promoting.
```

If all criteria pass:

```
All criteria met. Propose promoting DatePicker from beta → stable?
Update ds-lifecycle.json with stage: "stable", promotedAt.stable: "2026-04-17"? [y/n]
```

On approval, update `.claude/ds-lifecycle.json`.

---

## Phase 5: Deprecate (`deprecate [ComponentName]`)

Mark a component as deprecated and generate all required notices.

### 5.1 Collect Deprecation Info

Ask for:
- **Replacement component** (or "none")
- **Removal target date** (e.g., "2026-10-01")
- **Reason** (e.g., "Replaced by Alert with updated token architecture")

### 5.2 Generate Deprecation Notice

Add a `@deprecated` JSDoc comment to the component source file:

```tsx
/**
 * @deprecated Use <Alert /> instead. Will be removed 2026-10-01.
 * Migration: replace <LegacyAlert type="error"> with <Alert variant="destructive">.
 */
export function LegacyAlert({ ... }) {
```

### 5.3 Update Registry and Lifecycle File

Update `.claude/ds-lifecycle.json`:
```json
{
  "stage": "deprecated",
  "deprecatedAt": "2026-04-17",
  "removalTarget": "2026-10-01",
  "replacedBy": "Alert",
  "notes": "Replaced by Alert with updated token architecture."
}
```

If the registry has a `status` field per component, update it there too.

### 5.4 Usage Count

Run the codebase scan from Phase 3.3 and report how many active usages need to be migrated.

---

## Phase 6: Remove (`remove [ComponentName]`)

Validate that a component is safe to remove from the codebase.

### 6.1 Pre-removal Checklist

- [ ] Stage is `deprecated`
- [ ] Removal target date has passed (or is today)
- [ ] Zero active usages in application code (run usage scan)
- [ ] Replacement component has been available for ≥ 4 weeks in `stable`
- [ ] Spec and changelog document the removal

If any check fails, block removal and report what needs to happen first:

```
❌ Cannot remove LegacyAlert — 12 active usages remain.
   Run: /ds-usage LegacyAlert to see all files.
   Migrate those usages to Alert, then re-run: /ds-lifecycle remove LegacyAlert
```

If all checks pass, report what will be deleted and ask for confirmation before acting.

---

## Lifecycle State File

`.claude/ds-lifecycle.json` is the source of truth for all lifecycle state. It should be committed to the repository so the team shares a single view of component maturity.

To initialise it for an existing design system:

```bash
/ds-lifecycle audit
```

This will generate `.claude/ds-lifecycle.json` with all current components set to `stable` and prompt for corrections.

## Usage

```bash
# View all components and their current stage
/ds-lifecycle status

# Audit for overdue promotions and deprecated components with active usages
/ds-lifecycle audit

# Check promotion readiness and propose promoting a component
/ds-lifecycle promote DatePicker

# Deprecate a component and generate notices
/ds-lifecycle deprecate LegacyAlert

# Validate that a component is safe to delete
/ds-lifecycle remove LegacyAlert
```

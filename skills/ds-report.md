---
description: Audit Storybook + Figma DS for component drift, producing a full parity report
---

# Design System Parity Report

Run a read-only audit across all three pillars of the design system — **Figma (components/variables)**, **Code (barrel exports)**, and **Storybook (stories)** — then produce a single markdown report with totals, a full cross-reference matrix, and an outliers table. Figma is the reference; every discrepancy is reported as implementation drift, never as Figma being out of date — see [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md).

## Prerequisites

- Figma Desktop Bridge plugin must be running
- Your Figma design system file must be open
- `.claude/ds-story-figma-map.json` — pre-built Storybook↔Figma ID mapping
- Storybook server ideally running (used for story count verification), but not required

## Arguments

- `$ARGUMENTS` — optional section filter (e.g., `Selection`, `Layout`). If omitted, audits ALL sections.
- `--snapshot` — for CI, where Figma Desktop isn't available: skip every live Figma call and use the committed Figma-derived artifacts (`.claude/ds-registry.json`, `.claude/ds-token-map.json`) as the Figma reference. The report header must say "against Figma snapshot generated <`_meta.generatedAt`>" so nobody mistakes it for a live read. Before reading anything, run `node scripts/check-snapshot.mjs` (add `--figma-modified`/`--figma-version` when a live value is available). If it fails — stale, unversioned, or inconsistent snapshot — stop and report why instead of comparing code against untrustworthy design data. Requires the registry; if it's missing, stop rather than guess.

---

## Phase 0: Load Previous Benchmark

Before collecting data, read the historical benchmark file at `.claude/ds-benchmarks.json`. If it exists, parse it — it contains an array of previous audit snapshots. If it doesn't exist, initialise an empty array.

```json
{
  "benchmarks": [
    {
      "date": "2026-02-27T18:00:00Z",
      "branch": "feature-branch",
      "drift": {
        "overall": 3.7,
        "components": 1.8,
        "tokens": 5.2,
        "icons": 4.7
      },
      "totals": { ... }
    }
  ]
}
```

This data is used in Phase 3 to compute trends and in Phase 4 to persist the new snapshot.

---

## Phase 1: Collect Inventories

Gather data from all three sources in parallel. Do NOT modify anything — this is a read-only audit.

### 1.0 Load the DS Registry (Fast Path)

If `.claude/ds-registry.json` exists, load it as the primary data source (single file read). The registry provides the complete Figma mappings (node IDs, types, variant counts — including anything not yet built, via `presence.inCode: false`), Code inventory (component names, source files, variants, props), Storybook inventory (story files, story names, argTypes), token cross-references, icon inventory, and section groupings. This replaces most of the individual file reads in Phases 1.1–1.5. You still need a live Figma API call (Phase 1.1) for fresh Figma node counts.

If the registry does not exist, fall back to the individual file reads described below.

### 1.1 Figma Inventory (the anchor list)

First read `.claude/ds-story-figma-map.json` for pre-built component↔Figma ID lookups. Then use `figma_execute` to enumerate all sections and their component children on the Design System page for a fresh count — this is the base list every other source gets matched against:

```js
const page = figma.currentPage;
const sections = page.children.filter(c => c.type === 'FRAME' || c.type === 'SECTION');
const inventory = {};
for (const section of sections) {
  // Any component set, or standalone component, anywhere inside the section — no assumption
  // about how the file nests them (a `content` frame, a wrapper frame, sections per component, ...).
  const found = section.findAll(n => n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent && n.parent.type !== 'COMPONENT_SET'));
  if (found.length === 0) continue;
  inventory[section.name] = found.map(c => ({
    name: c.name,
    type: c.type,
    id: c.id,
    variantCount: c.type === 'COMPONENT_SET' ? c.children.length : 1,
    hasDescription: !!c.description
  }));
}
return inventory;
```

**Guard: an empty inventory is a failure of the read, not a finding.** If the result is `{}` (or far smaller than the mapping file's component count), stop and say the Figma read returned nothing — never continue and report every component as CODE ONLY. Figma node names are often not the component's name (a component set called `button`, or `Default` inside a wrapper): take the component's name from the mapping file / section (`<Name>_Components`), not from the node name.

### 1.2 Code Inventory (DS Barrel)

Read your component library's barrel export file (e.g., `src/index.ts` or `src/main.tsx`) and extract every exported component. Normalise each path to a component name:

```
./components/button/button       → Button
./components/forms/search-field  → SearchField
./components/cards/metric-card   → MetricCard
```

Also count:
- **Total component exports** (unique component modules, excluding hooks/utils/icons)
- **Icon helpers** (if applicable)
- **Hooks** (if applicable)

### 1.3 Storybook Inventory

Glob all story files:

```
src/stories/*.stories.tsx
packages/*/stories/*.stories.tsx
```

For each story file, extract:
- **File name** → component name (e.g., `button.stories.tsx` → `Button`)
- **Number of named exports** (each `export const Foo: Story` = one story variant)
- **Storybook section** from the `title` field in `meta`

Build a map: `{ componentName → { section, variantCount, filePath } }`

### 1.4 Variable / Token Inventory

Use `figma_get_variables` with `format: 'summary'` to get:
- **Total variable count**
- **Collections** (names + mode count)
- **Breakdown by type**: COLOR, FLOAT, STRING, BOOLEAN

Also read the code-side token files and count CSS custom properties.

### 1.5 Icon Inventory

Compare code-side icon exports against Figma icon components.

### 1.6 Code Connect Inventory (Optional)

If [Figma Code Connect](https://github.com/figma/code-connect) is set up, glob for `.figma.tsx` files in the component source directories. For each file found, record the component name and the Figma node URL it maps to. This adds a fourth parity dimension: whether the component has a published Code Connect mapping in addition to code, story, and Figma presence.

---

## Phase 2: Cross-Reference & Diff

### 2.1 Build the Master Matrix

Create a unified matrix with one row per component. Columns:

| Column | Source |
|---|---|
| Component Name | normalised from all three sources |
| Section | Figma section name or Storybook title |
| In Code | ✅ if exported from barrel |
| In Storybook | ✅ if `.stories.tsx` exists |
| Story Variants | count of named story exports |
| In Figma | ✅ if component/component_set exists |
| Figma Variants | count of Figma variant children |
| Figma Type | COMPONENT / COMPONENT_SET / FRAME |
| Has Description | ✅ if Figma node has a description |
| Status | FULL PARITY / PARTIAL / CODE ONLY / FIGMA ONLY / STORY ONLY |

**Status rules:**
- **FULL PARITY** — present in all three (code, story, Figma)
- **PARTIAL** — present in two of three
- **CODE ONLY** — exported from DS barrel but no story AND no Figma component. Registry entries with `partOf` are compound parts of a Figma component and are reported under their parent, never as CODE ONLY. Worth a second look under a Figma-first policy: was this ever designed?
- **FIGMA ONLY** — exists in Figma but not exported from code. A real, actionable gap — not a footnote — corresponds to `presence.inCode: false` in the registry (see `guides/ds-registry.md`)
- **STORY ONLY** — has a story file but not exported from DS barrel

### 2.2 Variant Count Comparison

For components in FULL PARITY, compare Storybook variant count vs Figma variant count. Flag any where the delta is > 2 as **VARIANT DRIFT**.

### 2.3 Variable / Token Comparison

Compare code-side tokens against Figma variables:
- Count primitives: code vs Figma
- Count semantics: code vs Figma (per mode)
- Flag any count mismatches

### 2.4 Icon Count Comparison

Compare code icon exports vs Figma icon components.

---

## Phase 3: Compute Drift Scores

### 3.1 Drift Percentage Formula

Drift is the percentage of the design system that is NOT in full parity. The goal is **0% drift**.

```
Component Drift % = (1 - fullParityCount / totalUniqueComponents) × 100
Token Drift %     = (|codeTokens - figmaTokens| / max(codeTokens, figmaTokens)) × 100
Icon Drift %      = (|codeIcons - figmaIcons| / max(codeIcons, figmaIcons)) × 100
Overall Drift %   = 60% × Component Drift + 25% × Token Drift + 15% × Icon Drift
```

### 3.2 Compare Against Previous Benchmark

If a previous benchmark exists, compute the trend:

```
Trend = currentDrift - previousDrift
```

Display trend as: `↓ 2.1%` (improving), `↑ 0.5%` (regressing), `→ 0%` (unchanged).

---

## Phase 4: Generate Report

Output a comprehensive markdown report. Save to `.claude/ds-report.md` AND display in the conversation.

The report includes:
- **Drift Score** — overall + per-dimension with trends
- **Dashboard** — counts across all three pillars
- **Component Parity Matrix** — every component with status
- **Outliers** — components in only one or two pillars
- **Variant Drift** — story vs Figma variant count mismatches
- **Token Summary** — collection-level variable counts
- **Icon Summary** — code vs Figma icon counts
- **Historical Trend** — last 10 benchmarks

---

## Phase 5: Persist Benchmark

After generating the report, save the current snapshot to `.claude/ds-benchmarks.json`. Append the new entry and keep the last **50** entries maximum.

---

## Guidelines

- **Read-only** — this skill NEVER modifies code or Figma. It only reads and reports.
- **Be exhaustive** — every component, story, variable, and icon must appear in the matrix.
- **Figma's name is canonical** — normalise the code/story name to match Figma's component name, not the reverse. `metric-card.stories.tsx` → `MetricCard` is only correct because Figma's component is also named `MetricCard`; if they differ, the mismatch itself is worth flagging, and the code/story side is what should be renamed to match Figma.
- **Count accurately** — open story files and count `export const` statements for variant counts.
- **Flag aggressively** — any discrepancy between the three sources is an outlier.
- **Always benchmark** — every run MUST persist a snapshot.
- **Always show trend** — if a previous benchmark exists, show the comparison.
- **Target is 0%** — the drift score section must always show the 0% target.

## Usage

```bash
# Full audit across all sections
/ds-report

# Audit a specific section
/ds-report Selection

# Audit multiple sections
/ds-report "Actions, Forms"
```

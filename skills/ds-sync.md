---
description: Pull your Figma Design System into Storybook via visual benchmarking and token mapping, and propose code-side corrections — never writes to Figma
---

# Design System Sync

Bring your live Storybook component library into alignment with your Figma Design System file. The workflow renders each component, compares it to its Figma counterpart, extracts token/prop context, and proposes corrections to your CSS token files and component source. Figma is the source of truth here — see [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md) — so this skill never writes to a Figma node, under any flag or condition.

## Prerequisites

- Figma Desktop Bridge plugin must be running
- Your Figma design system file must be open
- Storybook dev server running on `http://localhost:6006` (launch with `/storybook` if not running)
- `design-system-manifest.json` in project root (component inventory)
- `.claude/ds-story-figma-map.json` — pre-built Storybook↔Figma ID mapping (component IDs, story IDs, verify screen IDs, section frame IDs, key variable IDs)
- `.claude/rules/accessibility.md` — WCAG 2.1 Level AA criteria (auto-loaded by Phase 4.5)
- *(Optional)* [Figma Code Connect](https://github.com/figma/code-connect) — if published, provides real prop mappings for more accurate variant-level comparison

## Arguments

- `$ARGUMENTS` — optional component name filter and/or mode flag. Examples:
  - `Button` — standard sync for Button only
  - `--precision Button` — precision 1:1 per-variant audit for Button
  - `--precision` — precision audit for ALL components (slow)
  - `"Data Display"` — standard sync for a section
  - (empty) — standard sync for ALL components

---

## Phase 1: Setup & Token Map

### 1.0 Load the DS Registry (Fast Path)

If `.claude/ds-registry.json` exists, load it as the primary data source (single file read). The registry contains component metadata, variants, props, tokens, story mappings, and Figma node IDs — everything needed for Phases 1–3. Skip reading the barrel export, individual component source files, the manifest, and the token map separately.

If the registry does not exist, fall back to the individual file reads described below.

### 1.1 Load the Mapping File & Manifest

1. **Read `.claude/ds-story-figma-map.json`** first. This is the primary lookup for:
   - Section frame IDs → `sections[sectionName].sectionFrameId`
   - Verify screen IDs → `sections[sectionName].verifyLight` / `.verifyDark`
   - Component Figma node IDs → `sections[sectionName].components[name].figmaId`
   - Storybook story IDs → `sections[sectionName].components[name].stories[]`
   - Key Figma variable IDs → `keyVariableIds`
   - Storybook URL template → `_meta.storybookBase` (replace `{storyId}` and `{theme}`)
   - Semantic collection/mode IDs → `_meta.semanticCollection`, `_meta.lightMode`, `_meta.darkMode`

2. **Read `design-system-manifest.json`** for argTypes, prop definitions, and variant metadata not in the mapping file.

### 1.1.1 Mapping File Staleness Check

Before syncing, validate the mapping file is current. This prevents silent failures where a comparison reads the wrong or already-deleted Figma node and reports false drift, or where a proposed code fix gets attributed to the wrong component entirely.

**Step 1 — Resolve all component node IDs in Figma:**

```js
// figma_execute
const page = figma.currentPage;
const liveIds = new Set();
function walk(node) {
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'FRAME') {
    liveIds.add(node.id);
  }
  if ('children' in node) node.children.forEach(walk);
}
walk(page);
return [...liveIds];
```

**Step 2 — Cross-reference against the mapping:**

For each `sections[section].components[name].figmaId` in the mapping file:
- If the ID is **not** in `liveIds` → flag as **STALE_ID**
- If the component is in the manifest but has no mapping entry → flag as **MISSING_MAPPING**
- If the mapping has an entry with no corresponding manifest component → flag as **ORPHAN_ENTRY**

**Step 3 — Fetch Storybook index and cross-reference story IDs:**

```bash
curl -s http://localhost:6006/index.json
```

For each `stories[]` entry in the mapping, verify the story ID exists in the Storybook index. Flag **MISSING_STORY** for any that don't.

**Step 4 — Report and decide:**

```markdown
### Mapping File Health
| Status | Count | Details |
|--------|-------|---------|
| Valid entries | X | — |
| Stale Figma IDs | X | Button (ID:123), Input (ID:456) |
| Missing mappings | X | DatePicker, Tooltip |
| Orphan entries | X | LegacyAlert (removed from manifest) |
| Missing Storybook stories | X | badge--with-icon |
```

- If stale/missing/orphan entries are **0** → proceed with sync.
- If any stale IDs exist → **pause and report.** Do NOT read or compare against a stale node ID — the component it once pointed to may no longer exist, or a different node may now hold that ID. Offer to attempt auto-recovery (re-scan Figma by name and update the IDs) before continuing.
- If > 25% of entries are invalid → **abort sync** and instruct the user to regenerate the mapping file using the [Mapping File Guide](../guides/mapping-file.md).

**Auto-recovery for stale IDs:** For each stale component, search Figma by name:

```js
// figma_execute
const page = figma.currentPage;
const matches = [];
function walk(node) {
  if ((node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') && node.name === 'COMPONENT_NAME') {
    matches.push({ id: node.id, name: node.name, parent: node.parent?.name });
  }
  if ('children' in node) node.children.forEach(walk);
}
walk(page);
return matches;
```

If exactly one match is found, update the mapping entry and continue. If zero or multiple matches are found, require manual resolution.

**If the mapping file is absent**, regenerate it by fetching Storybook's `/index.json` and traversing the Figma page children. Save the updated mapping back to `.claude/ds-story-figma-map.json`.

### 1.2 Build the Token Translation Map

Build a JSON mapping that links CSS custom properties (Storybook) to Figma Variable IDs.

**Sources:**
- Your CSS token files (e.g., `src/styles/tokens.css`, `src/styles/colors.css`) — primitive and semantic color tokens
- Your app-level styles (e.g., `src/styles/index.css`) — semantic + Tailwind theme tokens
- Figma variables via `figma_get_variables` with `resolveAliases: true`

**Build the map:**

```json
{
  "tokenMap": {
    "--primary-foreground": { "cssValueLight": "...", "cssValueDark": "...", "figmaVarId": "VariableID:...", "figmaVarName": "primary-foreground" },
    "--surface-background": { "cssValueLight": "...", "cssValueDark": "...", "figmaVarId": "VariableID:...", "figmaVarName": "surface-background" }
  }
}
```

For each CSS variable, find the Figma variable whose resolved RGB values match. Log any unmatched tokens as warnings.

### 1.3 Filter Components

If `$ARGUMENTS` is provided, filter the mapping's `sections` to only include matching components or sections (case-insensitive partial match on component name or section name). Otherwise process all sections and components. Components listed in `map.storybookOnly` and `map.figmaOnly` are skipped from the main sync loop but logged in the report.

---

## Phase 1.5: Duplicate & Shadow Component Detection

Before any visual or token audit, scan for **duplicate components** — cases where the app re-implements a DS component locally instead of importing from the design system package. These shadow copies silently drift from the design system and bypass all DS-level changes.

### 1.5.1 App-Level Duplicate Scan

For each component in the DS manifest:

1. **Search for local copies:** Use `grep` to find files in your app source that export a function or component with the same name as a DS export.
2. **Compare implementations:** If a local file re-implements a DS component, flag it as a duplicate.
3. **Check import paths:** Verify that consuming files import from your DS package, not from local paths.

**Output:**
```
Duplicate Component Report
━━━━━━━━━━━━━━━━━━━━━━━━━
| App File                    | DS Component        | Status    | Action                    |
|-----------------------------|---------------------|-----------|---------------------------|
| shared/components/button.tsx | Button             | DUPLICATE | Delete, use DS import     |
| shared/components/table.tsx | Table               | SHADOW    | Review — may have overrides |
```

---

## Phase 2: Audit & Visual Benchmarking

### 2.0 Bulk Programmatic Audit

Before visual comparison, run a programmatic scan across ALL section frames to find every issue at once. Use `figma_execute` to traverse all component nodes and report:

1. **Hardcoded fills** — Any fill paint without a `boundVariables.color` binding
2. **Hardcoded text colors** — Same check on text node fills
3. **Hardcoded strokes** — Stroke paints without variable bindings
4. **Missing text styles** — Text nodes without `textStyleId`
5. **Wrong font family** — Text nodes using unexpected fonts
6. **Icon instances** — Verify icons are component instances (not raw vectors/groups)
7. **Missing/broken component references** — Instances with null `mainComponent`

Output a categorised table per section.

### 2.0.1 Variable Correctness Audit (Wrong Code Token)

Beyond checking that Figma nodes have *a* variable binding, verify code is using the **matching** CSS token for that same role:

1. Extract the bound variable name from each Figma node — this is the correct answer
2. Extract the CSS token the component source actually applies for that state/variant
3. If code's token ≠ Figma's bound variable, flag as `WRONG_TOKEN` — the fix targets the component's source (Phase 4.2), never Figma's binding

### 2.0.2 Component Dimension Comparison

Compare Figma component dimensions against code sizing classes:

1. Parse the component source for sizing classes (e.g., `w-8` = 32px, `h-4` = 16px)
2. Read Figma node `width` and `height`
3. Flag any dimension mismatch beyond ±2px tolerance

### 2.0.3 Structural Completeness Audit

Compare the Figma node tree against the code's render tree:

1. Extract all rendered child elements from JSX
2. Walk the Figma component's children recursively
3. Match code elements to Figma nodes by name/type/position
4. Flag missing children (e.g., counter badge, icon slot, secondary label)

### 2.0.4 Contrast & Readability Audit

Catch cases where Figma nodes have valid variable bindings but the resulting color combination produces insufficient contrast:

1. Build a token→resolved-color map for Light and Dark modes
2. For every component variant, identify foreground/background pairs
3. Calculate contrast ratios using the WCAG 2.0 formula
4. Flag violations: text < 4.5:1, large text < 3.0:1, UI components < 3.0:1
5. Check both modes

### 2.1 Verify Screens (Visual Benchmarking)

If your Figma file contains **Verify screens** (frames that mirror Storybook layouts), use them for pixel-level comparison:

1. Look up verify screen IDs from the mapping
2. Capture Storybook screenshot via `preview_screenshot`
3. Capture Figma verify frame via `figma_capture_screenshot`
4. Compare for color accuracy, spacing, typography, border radius, icon presence

### 2.2 Per-Component Visual Comparison

For each component:

1. Render the default Storybook story (light and dark)
2. Screenshot the corresponding Figma component
3. Categorise as: **MATCH** (< 1% delta), **DRIFT** (auto-correctable), or **MISMATCH** (needs manual intervention)

---

## Phase 3: Token Extraction & Comparison

### 3.1 Extract Storybook Tokens

For each component in DRIFT status:

1. Navigate to the Storybook story
2. Use `preview_inspect` to capture computed CSS properties: `color`, `background-color`, `border-color`, `font-size`, `font-weight`, `padding`, `gap`, `border-radius`
3. Map computed values back to CSS custom property names using the token translation map

### 3.2 Extract Figma Tokens

For the matching Figma component:

1. Use `figma_execute` to read fills, strokes, text styles, and their variable bindings
2. For each property, record: the bound variable ID, the resolved value, and the variable name

### 3.3 Diff

Compare Storybook tokens against Figma bindings. For each discrepancy, record:

```
| Property | Storybook Token | Figma Variable | Status |
|----------|----------------|----------------|--------|
| fill     | --button       | --button       | MATCH  |
| text     | --primary-fg   | --secondary-fg | DRIFT  |
| border   | --stroke-input | (hardcoded)    | MISSING|
```

---

## Phase 4: Propose Code Updates

Figma is correct. A DRIFT or MISMATCH means the *implementation* has drifted — every fix in this phase targets a CSS token file or a component source file. This skill never writes to a Figma node, under any flag or condition (Guardrail 1, SOURCE-OF-TRUTH.md).

### 4.1 Token Corrections (may be applied directly)

For each DRIFT or MISSING token, the fix is narrow and traceable — a single CSS custom property's value should equal Figma's resolved value for that variable. This is safe to apply directly (Edit the token file):

1. Look up the correct resolved value from Figma via the token translation map (already read in Phase 3.2 — never invent a value from a screenshot; Guardrail 4)
2. Edit the CSS custom property in the token file (e.g., `src/styles/tokens.css` or `src/styles/colors.css`) to match:
   ```css
   /* was: --stroke-input: #e2e2e2; */
   --stroke-input: #d9dce1; /* now matches Figma variable stroke-input */
   ```
3. Record every change in the report (Phase 5) — never a silent edit.

### 4.2 Spacing, Dimension & Structural Fixes (proposal only — never auto-applied)

A padding/gap/radius/structural difference usually means a component's source needs a real code change (a Tailwind class, a CSS module value, a missing rendered element), not just a token swap. Under Guardrail 5, this is always a **proposal**, never an automatic edit:

1. Read the expected values from Figma (padding, gap, corner radius, missing child elements found in Phase 2.0.3)
2. Write a proposed patch into the report (Phase 5) showing the current code, the Figma-derived target value, and the specific line/class to change
3. Only apply it to the source file if the person running this skill explicitly confirms the specific change

### 4.3 Review & Confirm

After Phase 4.1's direct token edits:

1. Re-render the affected Storybook stories
2. Re-extract computed CSS and compare against the same Figma values used in 4.1 to verify the fix actually landed
3. Report the result, alongside every unapplied proposal from 4.2

---

## Phase 5: Report

### 5.1 Per-Component Summary

```markdown
| Component | Light | Dark | Tokens Fixed | Proposed (needs confirmation) |
|-----------|-------|------|--------------|-------------------------------|
| Button    | MATCH | MATCH| 0            | 0                              |
| Input     | DRIFT | DRIFT| 3 tokens     | 1 structural fix (Phase 4.2)   |
| Badge     | MISMATCH | — | —            | Needs manual rebuild            |
```

### 5.2 Token Coverage

```markdown
| Metric                    | Count | Status |
|----------------------------|-------|--------|
| Total properties audited   | 240   | —      |
| Correctly token-bound      | 228   | 95%    |
| Fixed in code this run     | 8     | +3.3%  |
| Still hardcoded in code    | 4     | Review |
```

### 5.3 Action Items

List every Phase 4.2 proposal that still needs someone to confirm and apply it, plus anything flagged MISMATCH that needs manual rebuild, grouped by severity.

---

## Phase 6: Precision Mode (`--precision`)

When the `--precision` flag is used, run a **1:1 per-variant audit** that goes deeper than the standard sync:

### 6.1 Variant Enumeration

For each `COMPONENT_SET`, enumerate every Figma variant:
```js
const set = await figma.getNodeByIdAsync('COMPONENT_SET_ID');
return set.children.map(c => ({ name: c.name, id: c.id }));
```

Match each Figma variant to a corresponding Storybook state by parsing the variant name (e.g., `Size=Small, State=Default, Intent=Primary`).

### 6.2 Per-Variant Token Comparison

For each variant:

1. Read the Storybook source to find the CSS classes applied for that specific variant/state combination
2. Map classes to CSS tokens (e.g., `bg-surface-background` → `--surface-background`)
3. Read the Figma variant's fills/strokes/text bindings
4. Compare every binding

**If Code Connect is published:** Also verify that Figma's variant property names and values match the Code Connect prop mappings. For example, if Code Connect maps `figma.enum("Type", { Primary: "primary" })`, verify that the Figma component set actually has a variant property named "Type" with a value "Primary", and that it corresponds to the `variant="primary"` prop in code. Flag any mismatches as `PROP_MAPPING_DRIFT`.

### 6.3 Per-Variant Visual Comparison

For each variant:

1. Render the Storybook story with the matching args
2. Screenshot the Figma variant node
3. Side-by-side visual comparison

This is slow but catches every discrepancy at the variant level.

---

## Key Rules

1. **Never write to Figma** — no flag, mode, or precision level in this skill writes to a Figma node. Read access (`figma_execute`, `figma_get_variables`, `figma_capture_screenshot`) is unrestricted; write access isn't part of this skill's job.
2. **Figma is canonical** — when Storybook/code and Figma disagree, Figma is correct. The finding is "the implementation has drifted," never "the design file is stale."
3. **Token corrections may be applied directly** (Phase 4.1) — narrow, single-property, always traced to a real Figma variable value. **Structural/spacing fixes are proposals only** (Phase 4.2) — always confirmed by a person before touching a component's source.
4. **Never invent a value** — a proposed or applied fix always traces to a resolved Figma variable/style value, never a number guessed from a screenshot diff (Guardrail 4).
5. **Log everything** — every change, applied or proposed, is recorded in the report.
6. **No destructive changes** — components are updated, never deleted, on either side.

## Usage

```bash
# Sync all components
/ds-sync

# Sync a specific component
/ds-sync Button

# Sync a section
/ds-sync "Data Display"

# Precision 1:1 variant audit
/ds-sync --precision Button

# Precision audit for all components (slow)
/ds-sync --precision
```

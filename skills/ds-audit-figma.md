---
description: Figma-to-Storybook visual parity audit (read-only spot-check)
---

# Figma–Storybook Parity Audit

Run a comprehensive audit comparing the Figma Design System file against the Storybook component library. For each component, capture screenshots in both systems, extract computed visual properties, diff them per-variant, and produce a structured report with drift scores and prioritised action items. Figma is the reference — see [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md) — so every finding here is "the implementation drifted," and every action item points at fixing code (via `/ds-sync`), never at fixing Figma.

## Prerequisites

- Figma Desktop Bridge plugin must be running
- Your Figma design system file must be open
- Storybook dev server running on `http://localhost:6006` (launch with `/storybook` if not running)
- `.claude/ds-registry.json` — unified component registry (optional, enables fast path)
- `.claude/ds-story-figma-map.json` — Storybook↔Figma ID mapping (fallback)
- `design-system-manifest.json` — component inventory (fallback)

## Arguments

- `$ARGUMENTS` — optional section or component filter. Examples:
  - `Button` — audit Button only
  - `"Actions"` — audit the Actions section
  - `--variants` — include per-variant visual diff (slower, more thorough)
  - `--themes` — audit both light and dark themes explicitly
  - (empty) — audit ALL sections, default story per component

---

## Phase 0: Load Registry (Fast Path)

If `.claude/ds-registry.json` exists, load it as the primary component inventory. It provides section frame IDs, component Figma node IDs, Storybook story IDs, variant metadata, and token cross-references — replacing separate reads of the mapping file and manifest.

If the registry does not exist, fall back to Phase 1.

---

## Phase 1: Load Mapping & Manifest

1. **Read `.claude/ds-story-figma-map.json`** — section frame IDs, component Figma node IDs, Storybook story IDs, verify screen IDs.
2. **Read `design-system-manifest.json`** — argTypes, prop definitions, variant metadata. (Skip if registry loaded.)

### 1.1 Validate Mapping Freshness

Before auditing, check the mapping file for staleness:

```js
// figma_execute: list current component IDs and names on the DS page
const page = figma.currentPage;
const allComponents = [];
function walk(node) {
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    allComponents.push({ id: node.id, name: node.name, parentName: node.parent?.name });
  }
  if ('children' in node) node.children.forEach(walk);
}
walk(page);
return allComponents;
```

Cross-reference the result against the mapping file's component IDs. Flag:
- **STALE_ID** — mapping references a node ID that no longer exists in Figma
- **MISSING_COMPONENT** — component is in the manifest but has no mapping entry
- **ORPHAN_ENTRY** — mapping entry has no corresponding manifest component

Report stale/missing count upfront. If > 20% of entries are stale, warn the user and offer to regenerate the mapping before continuing.

---

## Phase 2: Figma Inventory

Use `figma_execute` to enumerate all sections and their component children:

```js
const page = figma.currentPage;
const sections = page.children.filter(c => c.type === 'SECTION' || c.type === 'FRAME');
const inventory = sections.map(s => ({
  name: s.name,
  id: s.id,
  children: s.children
    .filter(c => c.type === 'COMPONENT' || c.type === 'COMPONENT_SET' || c.type === 'FRAME')
    .map(c => ({
      name: c.name,
      id: c.id,
      type: c.type,
      width: c.width,
      height: c.height,
      childCount: 'children' in c ? c.children.length : 0
    }))
}));
return inventory;
```

Cross-reference against the manifest to build a three-column inventory:

| Component | In Storybook | In Figma |
|-----------|:---:|:---:|
| Button | ✅ | ✅ |
| DatePicker | ✅ | ❌ |
| LegacyAlert | ❌ | ✅ |

---

## Phase 3: Per-Component Visual Diff

For each component present in both systems, run a structured visual comparison:

### 3.1 Storybook Screenshot & Property Extraction

Navigate to the component's default story:

```
{storybookBase}?id={storyId}&globals=theme:light&viewMode=story
```

1. **Screenshot** via `preview_screenshot`
2. **Extract computed properties** via `preview_inspect` for the root element and first interactive child:

```js
// preview_eval
const el = document.querySelector('#storybook-root > *');
if (!el) return null;
const s = getComputedStyle(el);
return {
  color: s.color,
  backgroundColor: s.backgroundColor,
  borderColor: s.borderColor,
  fontSize: s.fontSize,
  fontWeight: s.fontWeight,
  lineHeight: s.lineHeight,
  paddingTop: s.paddingTop,
  paddingRight: s.paddingRight,
  paddingBottom: s.paddingBottom,
  paddingLeft: s.paddingLeft,
  gap: s.gap,
  borderRadius: s.borderRadius,
  borderWidth: s.borderWidth,
  width: el.offsetWidth,
  height: el.offsetHeight
};
```

3. For `--themes` flag: repeat with `globals=theme:dark`.

### 3.2 Figma Screenshot & Property Extraction

```js
// figma_execute: extract visual properties from the component node
const node = await figma.getNodeByIdAsync('COMPONENT_NODE_ID');
const fills = node.fills || [];
const strokes = node.strokes || [];
const firstText = node.findOne(n => n.type === 'TEXT');
return {
  width: node.width,
  height: node.height,
  cornerRadius: node.cornerRadius,
  paddingTop: node.paddingTop,
  paddingRight: node.paddingRight,
  paddingBottom: node.paddingBottom,
  paddingLeft: node.paddingLeft,
  itemSpacing: node.itemSpacing,
  fills: fills.map(f => ({
    type: f.type,
    boundVariable: f.boundVariables?.color?.id ?? null,
    opacity: f.opacity ?? 1
  })),
  strokes: strokes.map(s => ({
    type: s.type,
    boundVariable: s.boundVariables?.color?.id ?? null,
    strokeWeight: node.strokeWeight
  })),
  fontSize: firstText?.fontSize,
  fontWeight: firstText?.fontWeight,
  lineHeight: firstText?.lineHeight
};
```

Capture the component screenshot via `figma_capture_screenshot`.

### 3.3 Property Diff

For each property, compute drift status:

| Property | Storybook | Figma | Delta | Status |
|----------|-----------|-------|-------|--------|
| width | 120px | 120 | 0px | MATCH |
| height | 40px | 38 | 2px | MATCH (within ±2px) |
| paddingTop | 8px | 12 | 4px | DRIFT |
| backgroundColor | #1a1a1a (--surface-bg) | bound: surface-bg | — | MATCH |
| borderRadius | 6px | 4 | 2px | DRIFT |

**Status rules:**
- **MATCH** — values equal, or within ±2px for dimensions, or resolved token value matches
- **DRIFT** — values differ by more than tolerance but are auto-correctable (spacing, radius)
- **MISMATCH** — structural difference or missing variable binding
- **HARDCODED** — Figma uses a raw value instead of a variable binding

**Drift score per component:**

```
componentDrift = (driftCount + 2 × mismatchCount + 3 × hardcodedCount) / totalProperties × 100
```

### 3.4 Per-Variant Diff (`--variants` flag)

When `--variants` is set, enumerate every Figma variant and match it to a Storybook story arg combination:

```js
// figma_execute: list all variants in a component set
const set = await figma.getNodeByIdAsync('COMPONENT_SET_ID');
return set.children.map(c => ({
  id: c.id,
  name: c.name,  // e.g., "Size=Small, State=Hover, Intent=Danger"
  width: c.width,
  height: c.height
}));
```

For each variant:
1. Parse the variant name into prop key-value pairs
2. Map to Storybook args (e.g., `Size=Small` → `size="sm"`)
3. Render the Storybook story with those args: `?id={storyId}&args=size:sm;state:hover`
4. Capture screenshots from both systems
5. Run the property diff (Phase 3.3)

Output a per-variant diff table:

```markdown
### Button — Per-Variant Diff

| Variant | SB Width | FG Width | SB Height | FG Height | BG Token | Border | Status |
|---------|----------|----------|-----------|-----------|----------|--------|--------|
| Size=Sm, State=Default | 80px | 80 | 32px | 32 | ✅ | ✅ | MATCH |
| Size=Sm, State=Hover | 80px | 80 | 32px | 32 | ✅ | ✅ | MATCH |
| Size=Md, State=Default | 120px | 120 | 40px | 38 | ✅ | ⚠️ | DRIFT |
| Size=Lg, State=Disabled | 160px | 160 | 48px | 48 | ⚠️ wrong | ✅ | MISMATCH |
```

---

## Phase 4: Icon Audit

Compare the manifest's icon list against Figma's Icons section:

```js
// figma_execute
const iconSection = figma.currentPage.children.find(c => c.name === 'Icons');
if (!iconSection) return { icons: [] };
return {
  icons: iconSection.children.map(c => ({ name: c.name, id: c.id, type: c.type }))
};
```

Flag:
- Icons in code but missing from Figma
- Icons in Figma but missing from code
- Icons that are raw vectors instead of component instances

---

## Phase 5: Variable Coverage Audit

Use `figma_get_variables` to check all semantic colour tokens have both Light and Dark mode values:

```js
// figma_execute
// Do not assume a collection literally named "Semantic": match by name pattern (e.g. "02 — COLOR / SEMANTIC",
// "03 — COLOR / AI"). A dark theme may be a separate collection whose name ends in DARK instead of a second mode.
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const semanticCollections = collections.filter(c => /semantic|COLOR \/ AI/i.test(c.name));
if (semanticCollections.length === 0) return { error: 'no semantic collection found', collections: collections.map(c => c.name) };
const all = await figma.variables.getLocalVariablesAsync();
const ids = new Set(semanticCollections.map(c => c.id));
return all.filter(v => ids.has(v.variableCollectionId)).map(v => {
  const col = semanticCollections.find(c => c.id === v.variableCollectionId);
  return {
    name: v.name, id: v.id, collection: col.name, isDarkCollection: /DARK$/.test(col.name),
    modes: Object.entries(v.valuesByMode).map(([modeId, val]) => ({ modeId, value: val }))
  };
});
```

Report:
- Total variables with Light+Dark values
- Variables missing a mode value (for a separate `... DARK` collection: a light variable with no same-named dark variable)
- Variables with identical Light and Dark values (possible oversight)

---

## Phase 6: Generate Report

Write a markdown parity report:

```markdown
# Figma–Storybook Parity Audit
**Date:** [ISO date]
**Components audited:** N
**Filter:** [filter or "all"]
**Themes:** [light only | light + dark]

## Mapping Health
- **Total entries:** N
- **Stale IDs:** X (Y%)
- **Missing mappings:** X
- **Orphan entries:** X

## Summary

| Status | Count | % |
|--------|-------|---|
| MATCH | X | Y% |
| DRIFT (auto-correctable) | X | Y% |
| MISMATCH (manual) | X | Y% |
| Missing from Figma | X | Y% |
| Missing from Storybook | X | Y% |

**Overall parity score:** X%

## Component Matrix

| Component | Section | In SB | In FG | Variants | Visual Match | Drift Score | Status |
|-----------|---------|:---:|:---:|:---:|:---:|---:|--------|
| Button | Actions | ✅ | ✅ | 12/12 | ✅ | 0% | MATCH |
| Input | Forms | ✅ | ✅ | 5/7 | ⚠️ | 14% | DRIFT |
| DatePicker | Forms | ✅ | ❌ | — | — | — | MISSING |

## Drift Details

### [Component with highest drift]
| Property | Storybook | Figma | Delta | Fix |
|----------|-----------|-------|-------|-----|
| paddingTop | 8px | 12px | 4px | Run /ds-sync Button |
| borderRadius | 6px | 4px | 2px | Run /ds-sync Button |

## Icon Audit
- **Total icons:** N
- **Missing from Figma:** X
- **Missing from Storybook:** X
- **Raw vectors (not instances):** X

## Variable Coverage
- **Semantic variables:** N total
- **With Light+Dark values:** N (X%)
- **Missing mode values:** X
- **Identical in both modes:** X (possible oversight)

## Action Items

### Immediate (run /ds-sync)
1. [List components where drift is auto-correctable]

### Manual Review
1. [List MISMATCH components with explanation]

### Mapping Maintenance
1. [List stale node IDs to update]
```

---

## Guidelines

- **Read-only** — this skill never modifies code or Figma, under any flag (Guardrail 1, SOURCE-OF-TRUTH.md)
- **Figma is the reference** — every DRIFT/MISMATCH is implementation drift, never "Figma is out of date"
- **Visual-first** — use screenshots for comparison, not just metadata
- **Token-aware** — check that Figma components use variable bindings, not hardcoded values
- **Both themes** — use `--themes` to explicitly check light + dark; always report when only one was checked

## Usage

```bash
# Full audit (default story per component)
/ds-audit-figma

# Audit a section
/ds-audit-figma "Actions"

# Audit a specific component
/ds-audit-figma Button

# Per-variant diff (thorough)
/ds-audit-figma --variants Button

# Both themes
/ds-audit-figma --themes

# Full deep audit
/ds-audit-figma --variants --themes
```

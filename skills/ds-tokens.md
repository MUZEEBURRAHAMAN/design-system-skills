---
description: Validate CSS design token parity against Figma variables and generate or update the token map
---

# Design System Token Validator

Validate that CSS design tokens (custom properties) and Figma variables are in sync. Detects missing tokens, unmatched values, orphaned variables, and alias chains that diverge between code and Figma. Generates or updates `.claude/ds-token-map.json` as output.

## Prerequisites

- Figma Desktop Bridge plugin must be running
- Your Figma design system file must be open
- CSS token files accessible (e.g., `src/styles/tokens.css`, `src/styles/colors.css`)
- `.claude/ds-registry.json` — optional, provides token file paths for fast path

## Arguments

- `$ARGUMENTS` — optional flags:
  - `--generate` — generate or fully overwrite `.claude/ds-token-map.json`
  - `--update` — update existing map (add missing entries, flag stale ones)
  - `--report-only` — audit only, do not write any files (default if no flag given)
  - `--collection [name]` — target a specific Figma variable collection (default: all semantic collections)

---

## Phase 1: Load Token Sources

### 1.1 Read CSS Tokens

Locate and read all CSS files that define custom properties. Common paths:

- `src/styles/tokens.css` — primitive tokens
- `src/styles/colors.css` — semantic color tokens
- `src/styles/index.css` — root theme overrides
- `tailwind.config.ts` or `tailwind.config.js` — token definitions if using Tailwind theme extension

If `.claude/ds-registry.json` exists, use `registry.tokenFiles[]` for the exact paths.

Extract all CSS custom property declarations:

```
--color-primary: #1a6cf7;
--surface-background: var(--color-neutral-50);
--border-input: var(--color-neutral-200);
```

Build a flat map:

```json
{
  "--color-primary": { "rawValue": "#1a6cf7", "resolvedLight": "#1a6cf7", "resolvedDark": null, "isAlias": false },
  "--surface-background": { "rawValue": "var(--color-neutral-50)", "resolvedLight": "#f9fafb", "resolvedDark": null, "isAlias": true, "aliasTarget": "--color-neutral-50" }
}
```

For dark mode overrides (`.dark { ... }` blocks), record the dark resolved value separately.

**Total CSS tokens found:** N (X primitive, Y semantic, Z alias)

### 1.2 Read Figma Variables

```js
// figma_execute
const collections = figma.variables.getLocalVariableCollections();
const allVars = figma.variables.getLocalVariables();
return collections.map(col => ({
  id: col.id,
  name: col.name,
  modes: col.modes,
  variables: allVars
    .filter(v => v.variableCollectionId === col.id)
    .map(v => ({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      valuesByMode: v.valuesByMode,
      isAlias: Object.values(v.valuesByMode).some(val => val?.type === 'VARIABLE_ALIAS')
    }))
}));
```

Build a flat Figma variable map keyed by name:

```json
{
  "surface-background": {
    "id": "VariableID:123",
    "collection": "Semantic",
    "lightValue": { "r": 0.98, "g": 0.98, "b": 0.98, "a": 1 },
    "darkValue": { "r": 0.07, "g": 0.07, "b": 0.07, "a": 1 },
    "isAlias": false
  }
}
```

**Total Figma variables found:** N (X in Primitive, Y in Semantic, Z in other collections)

---

## Phase 2: Matching & Diff

### 2.1 Name Matching

Match CSS tokens to Figma variables by normalising names:
- Strip `--` prefix from CSS variable names
- Normalise separators (`-`, `_`) to the same form
- Case-insensitive comparison

For each CSS token, attempt to find a Figma variable with a matching name.

### 2.2 Value Matching

For each matched pair, resolve alias chains and compare hex values:

**CSS resolution:** Follow `var(--alias)` chains until a raw value is reached.

**Figma resolution:** Follow `VARIABLE_ALIAS` chains until a raw color is reached. Convert the RGBA (0–1 float) to hex: `Math.round(r * 255).toString(16).padStart(2, '0')`.

Tolerance: ±1 on each channel (accounts for floating-point rounding).

### 2.3 Classify Each Token

| Status | Meaning |
|--------|---------|
| **MATCH** | CSS token has a matching Figma variable with equal resolved values in both modes |
| **VALUE_MISMATCH** | Names match but resolved hex values differ |
| **MISSING_IN_FIGMA** | CSS token exists in code, no Figma variable found |
| **MISSING_IN_CODE** | Figma variable exists, no CSS token found |
| **ALIAS_CHAIN_MISMATCH** | Both sides are aliases but they point to different primitive tokens |
| **MODE_MISSING** | Variable exists in Figma but has no dark (or light) mode value |
| **ORPHANED** | Figma variable is not referenced by any component binding (found via Phase 3) |

---

## Phase 3: Orphan Detection

Check which Figma variables are actually used as bindings in components vs which are defined but never referenced:

```js
// figma_execute
const page = figma.currentPage;
const usedVarIds = new Set();
function walk(node) {
  const bv = node.boundVariables || {};
  for (const prop of Object.values(bv)) {
    const bindings = Array.isArray(prop) ? prop : [prop];
    for (const b of bindings) {
      if (b?.id) usedVarIds.add(b.id);
    }
  }
  if ('children' in node) node.children.forEach(walk);
}
walk(page);
return [...usedVarIds];
```

Variables not in `usedVarIds` are **orphaned** — defined but never applied to a component. Flag them in the report.

---

## Phase 4: Alias Chain Validation

For tokens that are aliases on both sides, verify the chain resolves to the same primitive:

```
CSS:   --button-bg → var(--color-primary) → #1a6cf7
Figma: button-bg → ALIAS: color/primary → RGB(26, 108, 247) ✅ MATCH

CSS:   --destructive → var(--color-red-600) → #dc2626
Figma: destructive → ALIAS: color/danger → RGB(239, 68, 68) ⚠️ ALIAS_CHAIN_MISMATCH
```

---

## Phase 5: Report

Output a structured report to stdout and write a summary to `.claude/ds-token-validation.md`:

```markdown
# Token Validation Report
**Date:** [ISO date]
**CSS tokens scanned:** N
**Figma variables scanned:** N
**Collection targeted:** [name or "all semantic"]

## Summary

| Status | Count | % of CSS tokens |
|--------|-------|-----------------|
| MATCH | X | Y% |
| VALUE_MISMATCH | X | Y% |
| MISSING_IN_FIGMA | X | Y% |
| MISSING_IN_CODE | X | Y% |
| ALIAS_CHAIN_MISMATCH | X | Y% |
| MODE_MISSING | X | Y% |
| ORPHANED (Figma) | X | — |

**Token parity score:** X% (target: 100%)

## Mismatches (fix in code — Figma's value is correct)

| CSS Token | Figma Variable | Light CSS | Light Figma | Dark CSS | Dark Figma | Status |
|-----------|---------------|-----------|-------------|----------|------------|--------|
| --surface-bg | surface-background | #f9fafb | #f9fafb | #111111 | #0d0d0d | VALUE_MISMATCH |

## Figma Variables Missing From Code (add to CSS)

| Figma Variable | Collection | Light Value | Dark Value | Used by Components |
|---------------|------------|-------------|------------|-------------------|
| border/subtle | Semantic | #e5e7eb | #374151 | Input, Divider |

## Code Tokens With No Figma Variable (needs a design decision — not auto-fixed either direction)

| CSS Token | Resolved Light | Resolved Dark | Note |
|-----------|---------------|---------------|------|
| --overlay-scrim | rgba(0,0,0,0.5) | rgba(0,0,0,0.7) | Either this is a real design decision that should be formalised as a Figma variable, or it's a stray token that shouldn't exist in code. A designer decides which — this skill only flags it. |

## Figma Variables Missing a Dark-Mode Value (a real gap in Figma's own definition)

| Variable | Collection | Light Value | Note |
|----------|------------|-------------|------|
| success/border | Semantic | #16a34a | No dark value defined yet — this is Figma's own gap to fill, not something code can infer |

## Orphaned Figma Variables (defined but never bound — needs a design decision)

| Variable | Collection | Suggestion |
|----------|------------|------------|
| legacy/button-hover | Primitive | Either bind it to a component, or a designer should retire it in Figma — this skill only flags it, it doesn't delete Figma variables |

## Alias Chain Mismatches (fix in code — Figma's chain is correct)

| Token | CSS Chain | Figma Chain | Action |
|-------|-----------|-------------|--------|
| --destructive | color-red-600 → #dc2626 | color/danger → #ef4444 | Point the CSS alias at `--color-danger` to match Figma's chain |

## Action Items

### In Code (do this — Figma is correct)
1. Add missing tokens: [Figma variables with no CSS counterpart]
2. Fix value mismatches: [list — always bring the CSS value to Figma's resolved value]
3. Fix alias chain mismatches: [list — repoint the CSS alias, never Figma's]

### Needs a Design Decision (this skill does not resolve these automatically)
1. Formalise or remove code-only tokens: [list]
2. Bind or retire orphaned Figma variables: [list]
3. Figma variables missing a dark-mode value: [list — flag for the designer who owns the Figma file]
```

---

## Phase 6: Generate / Update Token Map

If `--generate` or `--update` flag is set, write `.claude/ds-token-map.json`:

```json
{
  "_meta": {
    "generatedAt": "2026-04-17T00:00:00Z",
    "figmaFile": "FIGMA_FILE_KEY",
    "figmaVersion": "1234567890",
    "figmaModifiedAt": "2026-04-16T09:30:00.000Z",
    "cssTokenCount": 124,
    "figmaVariableCount": 118,
    "parityScore": 94
  },
  "tokenMap": {
    "--surface-background": {
      "cssValueLight": "#f9fafb",
      "cssValueDark": "#111111",
      "figmaVarId": "VariableID:456:789",
      "figmaVarName": "surface-background",
      "collection": "Semantic",
      "status": "MATCH"
    },
    "--button-bg": {
      "cssValueLight": "#1a6cf7",
      "cssValueDark": "#1a6cf7",
      "figmaVarId": "VariableID:456:901",
      "figmaVarName": "button-bg",
      "collection": "Semantic",
      "status": "MATCH",
      "isAlias": true,
      "aliasTarget": "--color-primary"
    }
  },
  "missingInFigma": ["--overlay-scrim"],
  "missingInCode": ["border/subtle"],
  "orphaned": ["legacy/button-hover"]
}
```

`figmaVersion`/`figmaModifiedAt` record which state of the Figma file this map was read from (REST `GET /v1/files/:key`, or the Figma Console MCP file-data/version tools) — `scripts/check-snapshot.mjs` refuses a snapshot without them.

For `--update`, merge with the existing map: preserve manually-set overrides (entries with `"manual": true`), add new MATCH entries, flag changed statuses.

---

## Key Rules

1. **Never modify CSS or Figma during `--report-only`** — validation is always safe to run
2. **Figma's value is correct** — a value mismatch or alias-chain mismatch is always fixed in CSS. This skill never proposes changing a Figma variable's value.
3. **Never write to Figma** — not even the orphaned-variable and missing-dark-mode-value findings get auto-fixed in Figma; they're flagged for whoever owns the Figma file to decide (Guardrail 1, [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md))
4. **A code-only token isn't automatically wrong** — it needs a design decision (formalise it in Figma, or remove it from code), not an automatic fix either way
5. **Token map drives ds-sync** — a high-quality token map directly improves sync accuracy
6. **Both modes required** — a Figma variable missing a dark-mode value is a P1 issue for the design file
7. **Alias chains must align** — mismatched alias chains cause subtle drift that raw value matching misses

## Usage

```bash
# Validate parity (report only, no file writes)
/ds-tokens

# Generate a fresh token map
/ds-tokens --generate

# Update existing map with new tokens
/ds-tokens --update

# Target a specific Figma collection
/ds-tokens --collection "Semantic"

# Generate map for a specific collection
/ds-tokens --generate --collection "Primitive"
```

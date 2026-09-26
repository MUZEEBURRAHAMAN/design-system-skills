# Multi-Brand & Multi-Theme Guide

Run design system skills across multiple brands or theme variants — each with its own Figma file, token set, and visual identity. This guide covers token architecture, skill configuration, and how to run audits per-brand without duplicating the entire DS setup.

---

## What "Multi-Brand" Means Here

| Scenario | Example | What Changes |
|----------|---------|-------------|
| **Multi-brand** | Product A + Product B share components but have different visual identities | Token values differ; same component structure |
| **Multi-theme** | Light + Dark + High-Contrast modes | Token values differ per mode; same components |
| **Multi-tenant** | SaaS product with per-customer theming | Token values set at runtime via CSS overrides |
| **White-label** | DS distributed to external teams with brand customisation | Token values + sometimes component variants differ |

These scenarios share the same underlying structure: one component tree, multiple token layers on top.

---

## Token Architecture for Multiple Brands

### Recommended: Three-Layer Token System

```
Primitive tokens  →  Semantic tokens  →  Brand tokens
(never change)        (role-based)         (brand-specific overrides)
```

```css
/* Layer 1: Primitives (shared) */
:root {
  --color-blue-500: #3b82f6;
  --color-red-600: #dc2626;
  --color-neutral-50: #f9fafb;
}

/* Layer 2: Semantic (shared role definitions) */
:root {
  --interactive-primary: var(--color-blue-500);
  --surface-background: var(--color-neutral-50);
  --feedback-error: var(--color-red-600);
}

/* Layer 3: Brand A override */
[data-brand="brand-a"] {
  --interactive-primary: #6d28d9;   /* purple */
  --surface-background: #fafafa;
}

/* Layer 3: Brand B override */
[data-brand="brand-b"] {
  --interactive-primary: #059669;   /* emerald */
  --surface-background: #f0f9ff;
}
```

Components reference only semantic tokens. Switching brands is a single attribute change: `document.documentElement.dataset.brand = 'brand-a'`.

### Figma: One File Per Brand

Each brand has its own Figma file — authored independently by designers, and the source of truth for that brand. Code conforms to it; nothing here generates the Figma file from code. Each file has:
- Its own variable collection (same semantic names, different resolved values)
- The shared component library published from the main DS file
- Brand-specific styles applied via variable overrides (not separate components)

**File structure:**
```
Design System (main library)   — shared components, primitive tokens
Brand A (library consumer)     — semantic + brand token collection, brand-specific screens
Brand B (library consumer)     — semantic + brand token collection, brand-specific screens
```

---

## Configuring Skills for Multiple Brands

### Mapping File Per Brand

Each brand needs its own Figma mapping file pointing to the correct Figma file:

```
.claude/
  ds-story-figma-map.json          — default (Brand A or primary brand)
  ds-story-figma-map.brand-b.json  — Brand B mapping
```

The brand-specific maps reference the same Storybook story IDs but different Figma node IDs.

### Token Map Per Brand

```
.claude/
  ds-token-map.json          — Brand A token map
  ds-token-map.brand-b.json  — Brand B token map
```

### Registry Variants

If the registry is used, either:
1. Generate one registry per brand (fast but duplicates component metadata)
2. Use a single registry with a `brands` section that lists token file paths and Figma IDs per brand:

```json
{
  "_meta": { "brands": ["brand-a", "brand-b"] },
  "components": { ... },
  "brands": {
    "brand-a": {
      "figmaFileId": "abc123",
      "mappingFile": ".claude/ds-story-figma-map.json",
      "tokenMap": ".claude/ds-token-map.json",
      "storybookParam": "brand:brand-a"
    },
    "brand-b": {
      "figmaFileId": "def456",
      "mappingFile": ".claude/ds-story-figma-map.brand-b.json",
      "tokenMap": ".claude/ds-token-map.brand-b.json",
      "storybookParam": "brand:brand-b"
    }
  }
}
```

---

## Running Skills Per Brand

Pass the brand as a flag or argument. Skills check the registry for a matching brand entry and load the correct mapping/token files.

```bash
# Bring Brand A's code into line with its Figma file (default)
/ds-sync

# Bring Brand B's code into line with its Figma file
/ds-sync --brand brand-b

# Run a parity report for Brand B
/ds-report --brand brand-b

# Audit tokens for Brand B
/ds-tokens --brand brand-b

# Run WCAG audit with Brand B Storybook params
/ds-wcag --brand brand-b
```

When `--brand [name]` is passed:
1. Load the brand entry from the registry (or prompt the user for the mapping file path)
2. Use the brand's mapping file, token map, and Figma file ID for all operations
3. Add the brand's `storybookParam` to all Storybook URLs (e.g., `&globals=brand:brand-b`)
4. Prefix report output files: `.claude/ds-report.brand-b.md`

---

## Storybook Setup for Multi-Brand

Add a globals toolbar for brand switching:

```ts
// .storybook/preview.ts
export const globalTypes = {
  brand: {
    name: 'Brand',
    defaultValue: 'brand-a',
    toolbar: {
      icon: 'paintbrush',
      items: [
        { value: 'brand-a', title: 'Brand A' },
        { value: 'brand-b', title: 'Brand B' },
      ],
    },
  },
};

export const decorators = [
  (Story, context) => {
    document.documentElement.dataset.brand = context.globals.brand;
    return Story();
  },
];
```

Skills then use `?globals=brand:brand-b` in Storybook URLs to render with the correct brand applied.

---

## Running Audits Across All Brands

To audit all brands in a single run, iterate over the brand list from the registry:

```bash
# Run ds-report for every brand and aggregate results
for brand in brand-a brand-b; do
  claude --print "/ds-report --brand $brand" > .claude/ds-report.$brand.md
done
```

Or use the `/ds-report` skill with an `--all-brands` flag (if you implement it as a loop over the brands array in the registry).

### Cross-Brand Drift Comparison

After running reports for each brand, compare drift scores:

```markdown
## Cross-Brand Parity Summary

| Brand | Component Drift | Token Drift | Icon Drift | Overall |
|-------|:--------------:|:-----------:|:---------:|:-------:|
| Brand A | 2% | 1% | 0% | 1.5% |
| Brand B | 8% | 12% | 3% | 8.3% |

Brand B is drifting significantly on tokens — run /ds-tokens --brand brand-b to diagnose.
```

---

## Token Validation Per Brand

Each brand's token layer needs the same validation as the primary brand. Run `/ds-tokens` with the brand flag:

```bash
# Validate Brand B token parity against its Figma file
/ds-tokens --brand brand-b --collection "Brand B Semantic"
```

Key checks:
- All semantic tokens have brand-specific overrides where values should differ
- No brand override sets a token back to the same value as the default (orphaned override)
- Both light and dark mode values are present in the brand's Figma variable collection

---

## Multi-Tenant / Runtime Theming

For SaaS products where each customer provides their own brand values at runtime:

1. **Token schema** — define which tokens are "customisable" (brand layer) vs "fixed" (semantic layer). Only brand-layer tokens are exposed to tenants.
2. **Validation** — run `/ds-wcag --themes-only` with the customer's token values injected to ensure their colour choices still meet WCAG contrast requirements.
3. **Fallback** — always provide default values for all brand-layer tokens so components render safely without a brand override.

```bash
# Inject a tenant token file and run contrast audit
BRAND_TOKEN_FILE=./tenants/acme-tokens.css /ds-wcag --themes-only
```

---

## Checklist: Adding a New Brand

- [ ] Create brand token layer (CSS overrides or Figma variable collection)
- [ ] Create brand Figma file and link to shared component library
- [ ] Generate `.claude/ds-story-figma-map.brand-[name].json`
- [ ] Run `/ds-tokens --generate --brand [name]` to create the token map
- [ ] Add brand entry to the DS registry `brands` section
- [ ] Add brand to Storybook `globalTypes` toolbar
- [ ] Run `/ds-report --brand [name]` to establish baseline drift score
- [ ] Run `/ds-wcag --brand [name]` to establish baseline accessibility score
- [ ] Add brand to CI matrix (see [CI Integration Guide](ci-integration.md))

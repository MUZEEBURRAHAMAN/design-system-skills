---
description: Generate structured component specs from the Figma component — anatomy, API, tokens, structure, and accessibility — and check the code implementation against them
---

# Design System Spec Generator

Generate comprehensive, structured specification sheets for design system components. Inspired by Uber's uSpec approach — each spec covers anatomy, API surface, token usage, structural measurements, and accessibility semantics in a single pass.

**Figma is the source of the spec.** Anatomy, variants, properties, states, and token bindings are read from the Figma component (see Phase 0.7 / Phase 1.0); the code implementation is then read and checked *against* that spec, and any difference is recorded as implementation drift — never used to redefine the spec. A component that exists in Figma but has no code yet (`presence.inCode: false` in the registry) still gets a full spec: it's the brief the implementation is built from. See [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md). This skill never writes to Figma.

Specs are output as **markdown** (default), **Storybook MDX docs** (`--render`), and/or **structured JSON** (`--json`). The JSON output follows the same conventions as the DS Registry and mapping files — a single self-contained file per component that other skills can consume.

## Prerequisites

- Storybook dev server running (launch with `/storybook` if not running)
- `.claude/ds-registry.json` — unified component registry (optional, enables fast path)
- `design-system-manifest.json` in project root (component inventory, fallback)
- `.claude/ds-story-figma-map.json` — Storybook ↔ Figma ID mapping (fallback)
- `.claude/ds-token-map.json` — CSS property ↔ Figma variable mapping
- `.claude/rules/accessibility.md` — WCAG 2.1 AA criteria checklist
- Figma Console MCP connected with Desktop Bridge running (the spec's source — required; without it the spec is code-derived and must be labelled so, see Phase 0.7)
- *(Optional)* [Figma Code Connect](https://github.com/figma/code-connect) `.figma.tsx` files — enriches the API section with real Figma ↔ prop mappings

## Arguments

- `$ARGUMENTS` — component name filter and/or flags. Examples:
  - `Button` — generate spec for Button only
  - `"Forms"` — generate specs for all form components
  - `--json` — output specs as structured JSON (`.claude/ds-specs/[name].spec.json`)
  - `--render` — output specs as Storybook MDX docs (default: markdown report)
  - `--a11y-only` — generate only the accessibility spec section
  - (empty) — generate specs for ALL components

Flags can be combined: `/ds-spec --json --render Button`

---

## Phase 0: Setup

### 0.1 Registry Fast-Path

1. **Check if `.claude/ds-registry.json` exists.**
2. **If YES:** load it as the primary data source (single file read). The registry provides everything needed for spec generation:

   | Registry field | Feeds spec section |
   |---|---|
   | `components[name].sourceFile` | Phase 1.1 — source code read path |
   | `components[name].variants` / `.defaultVariants` | §2.2 API, §2.4 Structure (variant dimension matrix) |
   | `components[name].props` | §2.2 API surface |
   | `components[name].tokens` | §2.3 Token mapping — shortcut to relevant tokens |
   | `components[name].radixPrimitives` | §2.1 Anatomy, §2.5 Accessibility (auto-handled ARIA) |
   | `components[name].stories.file` | Phase 1.2 — story file path |
   | `components[name].stories.path` | Story URL construction |
   | `components[name].stories.variants` | Phase 1.3 — rendered inspection per story variant |
   | `components[name].stories.argTypes` | §2.2 API — control options |
   | `components[name].figma.nodeId` | Phase 1.0 — the Figma component the spec is read from |
   | `components[name].presence` | `inCode: false` → spec is Figma-only (Phase 1.0); no source/story read |
   | `tokens.primitives` / `tokens.semantic` | §2.3 Token mapping — CSS↔Figma variable cross-ref with hex values |

   Skip reading the barrel export, manifest, story-figma mapping, and token map separately — the registry supersedes all of them.

3. **If NO:** fall back to reading `design-system-manifest.json`, your barrel export file, `.claude/ds-story-figma-map.json`, and `.claude/ds-token-map.json` individually.

### 0.2 Load Supporting Data

1. **Read `.claude/ds-token-map.json`** (skip if registry loaded — tokens are already in `registry.tokens`)
2. **Read `.claude/rules/accessibility.md`** — WCAG 2.1 AA checklist for the accessibility spec section
3. **Read your token/CSS source files** — semantic token definitions for both themes
4. Verify Figma Console MCP is connected by listing available tools (see Phase 0.7).

### 0.3 Load DESIGN.md Context (Optional)

Check for `.claude/DESIGN.md` or `DESIGN.md` in the project root. If found, load it.

Use the DESIGN.md data to enrich two spec sections:

- **§2.6 Usage Examples** — examples should reflect the visual theme and follow the stated do/don'ts (e.g., if DESIGN.md says "use realistic domain data", usage examples use product-appropriate content, not "Lorem ipsum")
- **§2.3 Token Mapping** — the Agent Prompt Guide section of DESIGN.md lists the authoritative token naming convention; use it to verify token names in the spec match what the file declares

If DESIGN.md is absent, continue normally. Run `/ds-design-md` to generate one.

### 0.4 Load Code Connect Mappings (Optional)

Glob for `.figma.tsx` files in the component source directories. For each file found, record the component name and its Figma prop mappings (e.g., `figma.enum("Type", { Primary: "primary" })`). These enrich the API section (§2.2) with real Figma ↔ code prop correspondence and flag any `PROP_MAPPING_DRIFT` when Figma variant properties don't match the code.

### 0.5 Filter Components

If `$ARGUMENTS` specifies a component or section name, filter the inventory (case-insensitive partial match on component name, section name, or Storybook path). Otherwise process all components.

### 0.6 Ensure Storybook

Verify Storybook is running. Determine the URL from one of these sources (in order):
1. **Registry** — `_meta.storybookBase` if present
2. **Mapping file** — `_meta.storybookBase` (e.g., `http://localhost:6006/iframe.html?id={storyId}&viewMode=story&globals=theme:{theme}`)
3. **Default** — `http://localhost:6006`

If not running, start it with `/storybook`.

### 0.7 Confirm Figma Is Reachable

The spec is generated from Figma, so confirm the Desktop Bridge responds before doing anything else. If it doesn't, stop and tell the user — don't silently produce a code-derived spec. If the user explicitly wants a code-only draft anyway, generate it but put `> ⚠️ Code-derived draft: not verified against Figma.` at the top of every output file.

---

## Phase 1: Component Analysis

For each component, read the Figma component first (1.0), then the code and rendered output to check it against the Figma-derived spec.

### 1.0 Figma Component Read (source of the spec)

Read the component from Figma via `figma_execute`, using `components[name].figma.nodeId` (registry) or `sections[section].components[name].figmaId` (mapping):

```js
// figma_execute
const node = await figma.getNodeByIdAsync('COMPONENT_NODE_ID');
const set = node.type === 'COMPONENT_SET' ? node : null;
return {
  name: node.name,
  type: node.type,
  description: node.description,
  variantProperties: set ? set.componentPropertyDefinitions : node.componentPropertyDefinitions,
  variants: set ? set.children.map(v => ({ name: v.name, w: v.width, h: v.height, padding: [v.paddingTop, v.paddingRight, v.paddingBottom, v.paddingLeft], gap: v.itemSpacing, radius: v.cornerRadius })) : [],
  children: (set ? set.children[0] : node).children?.map(c => ({ name: c.name, type: c.type })) ?? []
};
```

Also read each variant's fills/strokes/text `boundVariables` (see `ds-audit-figma.md` Phase 3.2) so the token table is built from Figma's own bindings. From this read, populate: **§2.1 Anatomy** (child layers), **§2.2 API** (Figma variant properties and their values become the component's intended props), **§2.3 Tokens** (Figma variable bindings per element/state), **§2.4 Structure** (Figma dimensions/padding/gap/radius).

**State galleries.** A single `COMPONENT` (not a set) whose direct children are named state frames — e.g. Composer: `Idle · empty`, `Streaming · Stop`, `Error · Retry`, `Size=SM · Idle`, `Narrow (≤ 359px)…`; GeneratedCard: `Ready`, `Generating`, `Error · Retry` — is a gallery of states, not an anatomy. List those frames under **States** (they are the design's required states), then read anatomy, tokens and measurements from the *first state frame's* children. Do not report the state frames as anatomy layers, and do not report `props: []` as "no API" — say the Figma component declares no properties and that states come from the gallery. Count solid fills with no variable binding and report them as Figma-side hard-coded values (Guardrail 3) for the design owner; never bind or repair them.

If the registry says `presence.inCode: false`, this is the whole spec — skip 1.1–1.3 and mark the API section "Not yet implemented; implement from the Figma properties above."

### 1.1 Source Code Read (checked against the Figma spec)

Read the component's source file (from registry `components[name].sourceFile` or manifest). Extract:

- **Element structure** — the JSX tree: which HTML elements and sub-components are rendered
- **Props interface** — all typed props with defaults, including `React.ComponentPropsWithoutRef` extensions
- **Variants** — CVA variant definitions (names, values, defaults), compound variants. If registry is loaded, cross-check against `components[name].variants` and `.defaultVariants`.
- **Forwarded ref** — whether `forwardRef` is used and what element type it wraps
- **Slots** — `children`, `asChild`, render props, named slots
- **Radix primitives** — which Radix UI primitives are composed (from registry `radixPrimitives[]` or by reading imports)
- **Hooks** — custom hooks used internally
- **Token usage** — Tailwind classes referencing design tokens (e.g., `bg-surface-background`, `text-primary-foreground`). If registry is loaded, use `components[name].tokens[]` as a shortcut to the relevant token subset.
- **Code Connect props** — if a `.figma.tsx` file exists for this component (Phase 0.3), extract the Figma ↔ code prop mappings

### 1.2 Story Read

Read the component's story file (from registry `components[name].stories.file` or by globbing). Extract:

- **Story variants** — each named export and its args/render function. Cross-check against registry `stories.variants[]` if available.
- **Decorators** — layout wrappers, theme providers
- **ArgTypes** — control definitions with options, default values. Cross-check against registry `stories.argTypes` if available.

### 1.3 Rendered Inspection

Navigate to each story variant in Storybook using the story IDs from the registry or mapping file. Build the URL using the `storybookBase` template from Phase 0.5:

```
storybookBase = "http://localhost:6006/iframe.html?id={storyId}&viewMode=story&globals=theme:{theme}"
```

**Story IDs come from:**
- **Registry** — derive from `components[name].stories.path` (e.g., `Components/Actions/Button` → `components-actions-button--primary`)
- **Mapping file** — `sections[section].components[name].stories[]` (exact Storybook story IDs)

For each story variant, capture:

- **Computed dimensions** — height, width, padding, margin, gap, border-radius for the root element and key children
- **Computed colours** — foreground, background, border colours in both light and dark themes
- **Typography** — font-family, font-size, font-weight, line-height, letter-spacing for all text nodes
- **Interactive states** — hover, focus, active, disabled appearance changes

Use DOM inspection to extract computed styles:

```js
const root = document.querySelector('#storybook-root > *');
const styles = window.getComputedStyle(root);
JSON.stringify({
  height: styles.height,
  padding: styles.padding,
  gap: styles.gap,
  borderRadius: styles.borderRadius,
  backgroundColor: styles.backgroundColor,
  color: styles.color,
  fontFamily: styles.fontFamily,
  fontSize: styles.fontSize,
  fontWeight: styles.fontWeight,
  lineHeight: styles.lineHeight
});
```

Repeat in dark theme (replace `{theme}` with `dark` in the URL template).

### 1.4 Verify Screen Comparison (Optional)

If the mapping file contains **verify screen** IDs for the component's section (`sections[section].verifyLight` / `.verifyDark`), use them for pixel-accurate measurement validation:

1. Capture the Storybook screenshot via `preview_screenshot`
2. Capture the Figma verify frame via `figma_capture_screenshot`
3. Compare dimensions, spacing, and colour accuracy between the two renders
4. Record any discrepancies in the `drift[]` list (Structure section §2.4) as implementation drift — the Figma values stay in the spec; never overwrite them with Storybook's computed values

---

## Phase 2: Spec Generation

For each component, generate six spec sections. All sections are generated in a single pass per component — do not re-read the source between sections.

### 2.1 Anatomy

Map the component's internal structure with numbered markers:

```markdown
### Anatomy

| # | Element | HTML | Role | Description |
|---|---------|------|------|-------------|
| 1 | Root | `<button>` | — | Clickable container |
| 2 | Icon slot | `<span>` | `aria-hidden="true"` | Optional leading/trailing icon |
| 3 | Label | text node | — | Button text content |
| 4 | Loading spinner | `<LoadingSpinner>` | `aria-hidden="true"` | Shown when `loading={true}` |
```

Rules:
- Number elements in DOM order (depth-first)
- Include the actual HTML element rendered (not the React component name)
- Note ARIA roles assigned to each element
- Flag conditional elements (shown/hidden based on props)
- For compound components (Dialog, Tabs), show the full assembled structure

### 2.2 API Surface

Document every prop the component accepts:

```markdown
### API

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `intent` | `"primary" \| "secondary" \| "positive" \| "negative"` | `"primary"` | No | Visual style variant |
| `size` | `"small" \| "medium" \| "large"` | `"medium"` | No | Size variant |
| `icon` | `ReactNode` | — | No | Icon element |
| `loading` | `boolean` | `false` | No | Shows loading spinner, disables interaction |
| `disabled` | `boolean` | `false` | No | Disables the button |
| `asChild` | `boolean` | `false` | No | Merges props onto child via Radix Slot |
```

Rules:
- Include inherited HTML attributes — list only notable ones, add a note about the spread
- Show actual TypeScript union types, not simplified descriptions
- Mark required props explicitly
- Document compound component sub-parts separately (e.g., `Dialog.Trigger`, `Dialog.Content`)

### 2.3 Token Mapping

Map every design token used by the component to its CSS property and Figma variable:

```markdown
### Tokens

| Element | Property | Token (CSS) | Light Value | Dark Value | Figma Variable |
|---------|----------|-------------|-------------|------------|----------------|
| Root | background | `--interactive-primary` | `#1B1B1B` | `#FFFFFF` | `interactive-primary` |
| Root | color | `--interactive-primary-foreground` | `#FFFFFF` | `#1B1B1B` | `interactive-primary-foreground` |
| Root | border-radius | `rounded-md` (6px) | — | — | — |
| Root:hover | background | `--interactive-primary-hover` | `#353535` | `#EAEAEA` | `interactive-primary-hover` |
| Root:focus | ring | `--interactive-focus-ring` | `#0080FF` | `#78B6ED` | `interactive-focus-ring` |
```

Rules:
- Cross-reference each Tailwind class against your CSS source to find the CSS custom property
- Use `.claude/ds-token-map.json` to look up the corresponding Figma Variable ID and resolved hex value
- Include state-specific tokens (hover, focus, active, disabled)
- Flag any hardcoded values (not using tokens) as warnings
- Verify light/dark values match between CSS and Figma — flag mismatches

### 2.4 Structure & Measurements

Document the component's dimensions and spacing:

```markdown
### Structure

| Variant | Height | Padding (h) | Padding (v) | Gap | Border | Border Radius |
|---------|--------|-------------|-------------|-----|--------|---------------|
| small | 32px | 12px | 6px | 6px | none | 6px |
| medium | 40px | 16px | 8px | 8px | none | 6px |
| large | 48px | 24px | 12px | 8px | none | 6px |
```

Rules:
- Use computed values from Phase 1.3, not Tailwind class approximations
- Document all size variants
- Include min-width, max-width if constrained
- Note touch target compliance (>= 24px min, 44px recommended)
- Flag spacing values that don't align to the 8px grid

### 2.5 Accessibility Spec

Generate a complete accessibility specification. This covers web (ARIA/HTML) semantics and is structured to inform implementation across platforms.

```markdown
### Accessibility

#### Roles & Semantics
| Element | Role | Semantic Element | Notes |
|---------|------|-----------------|-------|
| Root | `button` | `<button>` | Native semantics, no explicit role needed |

#### States & Properties
| State | ARIA Attribute | Values | Trigger |
|-------|---------------|--------|---------|
| Disabled | `aria-disabled` / `disabled` | `true` / `false` | `disabled` prop |
| Loading | `aria-busy` | `true` / `false` | `loading` prop |
| Pressed (toggle) | `aria-pressed` | `true` / `false` | Toggle variant click |

#### Keyboard Interactions
| Key | Action | Condition |
|-----|--------|-----------|
| `Enter` | Activate button | Always |
| `Space` | Activate button | Always |
| `Tab` | Move focus to next element | Always |

#### Focus Management
- Focus ring: describe the focus ring implementation (e.g., `focus-visible:ring-2`)
- Tab order: natural DOM order / managed
- Focus trap: Yes/No (for containers like dialogs)
- Focus restoration: describe if focus returns to trigger on close

#### Screen Reader Announcements
| Scenario | Announcement | Implementation |
|----------|-------------|----------------|
| Default | "[Label text], button" | Native `<button>` semantics |
| Icon-only | "[aria-label value], button" | Requires `aria-label` prop |
| Loading | "[Label text], button, busy" | `aria-busy="true"` |
| Disabled | "[Label text], button, dimmed" | `disabled` attribute |

#### Contrast Verification
| Element | Foreground | Background | Ratio | Passes | Theme |
|---------|-----------|------------|-------|--------|-------|
| Label (primary) | `#FFFFFF` | `#1B1B1B` | 15.4:1 | AA pass | Light |
| Label (primary) | `#1B1B1B` | `#FFFFFF` | 15.4:1 | AA pass | Dark |
```

Rules:
- Reference the component-specific checklist from `.claude/rules/accessibility.md` section 7 (if available)
- Calculate actual contrast ratios using the WCAG 2.0 relative luminance formula
- Check in both light and dark themes
- For Radix-based components, note which ARIA attributes are handled automatically by the primitive
- For compound components, document the ARIA relationship between parts (e.g., `aria-controls`, `aria-labelledby`)
- Flag any missing attributes as `MISSING — [fix instruction]`

### 2.6 Usage Examples

Provide 2–3 code examples showing common usage patterns:

```markdown
### Usage

#### Basic
\`\`\`tsx
<Button intent="primary" onClick={handleSave}>
  Save changes
</Button>
\`\`\`

#### With icon
\`\`\`tsx
<Button intent="secondary" icon={<RiAddLine />}>
  Add item
</Button>
\`\`\`
```

Rules:
- Use realistic domain data appropriate to your product
- Show the accessibility-correct pattern (e.g., `aria-label` on icon-only buttons)
- Include at least one example demonstrating proper accessible usage

---

## Phase 3: Output

### 3.1 Markdown Report (default)

Write all specs to `.claude/ds-specs/[component-name].md`:

```markdown
# [Component Name] — Design Spec

**Generated:** [ISO date]
**Source:** [source file path]
**Package:** [package name]
**Section:** [section name]
**Storybook:** [story URL]

---

[Anatomy section]

---

[API section]

---

[Token mapping section]

---

[Structure section]

---

[Accessibility section]

---

[Usage examples]
```

Write an index file at `.claude/ds-specs/index.md`:

```markdown
# Design System Specifications

**Generated:** [ISO date]
**Components:** [count]

| Component | Section | Source | Spec |
|-----------|---------|-------|------|
| Button | Actions | `src/components/button/button.tsx` | [View](button.md) |
| Badge | Data Display | `src/components/badge/badge.tsx` | [View](badge.md) |
```

### 3.2 Structured JSON Spec (`--json`)

When `--json` is passed, output a machine-readable JSON spec per component at `.claude/ds-specs/[component-name].spec.json`. This format mirrors the DS Registry conventions and can be consumed by other skills or tooling.

**Schema:**

```json
{
  "_meta": {
    "version": "1.0.0",
    "generatedAt": "2026-03-18T12:00:00.000Z",
    "generatedBy": "/ds-spec",
    "source": "packages/ds/src/components/button/button.tsx",
    "package": "@acme/ds",
    "section": "Actions",
    "storybookPath": "Components/Actions/Button",
    "figmaNodeId": "5321:90928"
  },
  "anatomy": [
    {
      "index": 1,
      "element": "Root",
      "html": "<button>",
      "role": null,
      "description": "Clickable container",
      "conditional": false
    },
    {
      "index": 2,
      "element": "Icon slot",
      "html": "<span>",
      "role": "aria-hidden=\"true\"",
      "description": "Optional leading/trailing icon",
      "conditional": true
    }
  ],
  "api": {
    "props": [
      {
        "name": "intent",
        "type": "\"primary\" | \"secondary\" | \"positive\" | \"negative\"",
        "default": "\"primary\"",
        "required": false,
        "description": "Visual style variant",
        "source": "cva"
      }
    ],
    "inherits": "React.ComponentPropsWithoutRef<\"button\">",
    "forwardRef": { "enabled": true, "element": "HTMLButtonElement" },
    "slots": ["children", "icon"],
    "radixPrimitives": ["Slot"],
    "codeConnect": {
      "figmaProps": { "Type": { "Primary": "primary", "Secondary": "secondary" } },
      "drift": []
    }
  },
  "tokens": [
    {
      "element": "Root",
      "property": "background",
      "cssToken": "--interactive-primary",
      "lightValue": "#1B1B1B",
      "darkValue": "#FFFFFF",
      "figmaVariable": "interactive-primary",
      "figmaVarId": "VariableID:5678:200",
      "state": "default",
      "hardcoded": false
    }
  ],
  "structure": {
    "variants": [
      {
        "variant": "small",
        "height": "32px",
        "paddingH": "12px",
        "paddingV": "6px",
        "gap": "6px",
        "border": "none",
        "borderRadius": "6px",
        "minWidth": null,
        "maxWidth": null,
        "touchTarget": { "size": "32px", "passes": true }
      }
    ],
    "gridAlignment": { "base": 8, "violations": [] }
  },
  "accessibility": {
    "roles": [
      { "element": "Root", "role": "button", "semanticElement": "<button>", "notes": "Native semantics" }
    ],
    "states": [
      { "state": "Disabled", "attribute": "disabled", "values": "true/false", "trigger": "disabled prop" }
    ],
    "keyboard": [
      { "key": "Enter", "action": "Activate button", "condition": "Always" }
    ],
    "focus": {
      "ring": "focus-visible:ring-2",
      "tabOrder": "natural",
      "trap": false,
      "restoration": null
    },
    "screenReader": [
      { "scenario": "Default", "announcement": "[Label text], button", "implementation": "Native <button>" }
    ],
    "contrast": [
      {
        "element": "Label (primary)",
        "foreground": "#FFFFFF",
        "background": "#1B1B1B",
        "ratio": "15.4:1",
        "passes": true,
        "theme": "light"
      }
    ]
  },
  "usage": [
    {
      "title": "Basic",
      "code": "<Button intent=\"primary\" onClick={handleSave}>\n  Save changes\n</Button>"
    }
  ]
}
```

**Rules for JSON output:**
- Use the same key naming conventions as the DS Registry (`camelCase`, matching field names where possible)
- Token entries must include `figmaVarId` from `registry.tokens` or `.claude/ds-token-map.json` — this is the cross-reference that links specs to the live Figma variable bindings
- `api.codeConnect` is populated only when Code Connect `.figma.tsx` files exist; `drift[]` lists any mismatches between Figma variant properties and code props
- `structure.gridAlignment.violations[]` lists any spacing values that don't align to the base grid

Also write a **spec index** at `.claude/ds-specs/index.json`:

```json
{
  "_meta": {
    "version": "1.0.0",
    "generatedAt": "2026-03-18T12:00:00.000Z",
    "generatedBy": "/ds-spec",
    "componentCount": 3,
    "specCount": 3
  },
  "specs": {
    "Button": {
      "section": "Actions",
      "specFile": "button.spec.json",
      "mdFile": "button.md",
      "tokenCount": 12,
      "hardcodedValues": 0,
      "a11yIssues": 0,
      "contrastPass": true
    },
    "Input": {
      "section": "Forms",
      "specFile": "input.spec.json",
      "mdFile": "input.md",
      "tokenCount": 10,
      "hardcodedValues": 0,
      "a11yIssues": 1,
      "contrastPass": false
    }
  },
  "coverage": {
    "totalComponents": 50,
    "specsGenerated": 3,
    "coveragePercent": 6.0,
    "sectionsComplete": [],
    "sectionsPartial": ["Actions", "Forms"]
  }
}
```

This index can be consumed by `/ds-report` to include spec coverage in drift scores, and by other skills to check whether a spec exists before re-generating.

### 3.3 Storybook MDX Docs (`--render`)

When `--render` is passed, additionally generate MDX doc files alongside the story files:

```mdx
import { Meta } from "@storybook/blocks";

<Meta title="Specs/[Section]/[ComponentName]" />

# [Component Name]

[Spec content converted to MDX-compatible markdown]
```

Place the MDX files next to the corresponding story files (path from registry `components[name].stories.file`).

### 3.4 No Figma Write-Back

Specs are never written into the Figma file. Figma is the source the spec is read from, so writing generated content back into it would let a code-derived artifact edit the design file (Guardrail 1, SOURCE-OF-TRUTH.md). If a team wants spec documentation visible in Figma, a designer adds it there by hand, or uses Code Connect / Dev Mode annotations (`guides/code-connect.md`) to publish *implementation status* next to the component.

---

## Phase 4: Summary & Coverage Tracking

### 4.1 Console Summary

Present the user with:

```markdown
## Spec Generation Complete

**Components:** [N] specs generated
**Output:** `.claude/ds-specs/` ([N] files)
**JSON specs:** [Yes/No] ([N] .spec.json files)
**Storybook docs:** [Yes/No] ([N] MDX files)
**Source:** Figma ([N] components read live) / code-derived draft (labelled)

### Highlights

| Component | Tokens | Hardcoded Values | A11y Issues | Contrast | Code Connect |
|-----------|--------|-----------------|-------------|----------|--------------|
| Button | 12 | 0 | 0 | All pass | Mapped |
| Badge | 8 | 1 warning | 0 | All pass | — |
| Input | 10 | 0 | 1 (missing aria-describedby) | Light fail: placeholder 3.8:1 | Drift: 1 prop |

### Token Warnings
[List any hardcoded values found]

### Accessibility Gaps
[List any P0/P1 issues found during spec generation]

### Code Connect Drift
[List any Figma ↔ code prop mapping mismatches, if Code Connect is present]
```

### 4.2 Spec Coverage Tracking

After writing all outputs, update the spec index (`.claude/ds-specs/index.json`) with coverage metrics. The `coverage` object tracks how many components have specs relative to the total inventory (from registry or manifest). This data is available to `/ds-report` for inclusion in drift dashboards — spec coverage is an additional parity dimension alongside code, Storybook, and Figma presence.

---

## Key Rules

0. **Figma is the spec's source; code is checked against it.** Never edit the spec to match the implementation, and never write to Figma.
1. **Single pass** — read the source once, generate all six sections from that read. Do not re-read between sections.
2. **Token verification** — every colour must trace back to a Figma variable binding first, then the CSS custom property that should match it. Use `figmaVarId` from the registry or token map. Flag hardcoded values.
3. **Contrast calculation** — use the WCAG 2.0 relative luminance formula. Check both themes.
4. **Registry-first** — always prefer the registry over individual file reads. The registry field→section mapping in Phase 0.1 is the canonical reference.
5. **Incremental** — if a spec already exists at `.claude/ds-specs/[name].md` or `.spec.json`, update it rather than overwriting (preserve any manual annotations in markdown; merge into existing JSON).
6. **Story IDs are canonical** — always navigate Storybook using story IDs from the registry/mapping and the `storybookBase` URL template. Never hardcode story URLs.
7. **JSON specs are self-contained** — each `.spec.json` must include all token cross-references (`figmaVarId`, hex values) so downstream consumers don't need to re-read the registry.
8. **Code Connect enriches, never blocks** — Code Connect data is optional. If `.figma.tsx` files exist, use them to enrich the API section and flag prop mapping drift. If absent, skip silently.

## Usage

```bash
# Generate spec for a single component
/ds-spec Button

# Generate specs for all form components
/ds-spec "Forms"

# Generate all specs
/ds-spec

# Generate structured JSON specs (machine-readable)
/ds-spec --json Button

# Generate specs with Storybook doc pages
/ds-spec --render Button

# Only the accessibility section
/ds-spec --a11y-only Dialog

# All output formats at once
/ds-spec --json --render

# JSON specs for all components (feeds into ds-report coverage)
/ds-spec --json
```

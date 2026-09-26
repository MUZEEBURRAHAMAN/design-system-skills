---
description: Generate a DESIGN.md file from your Figma variables and typography styles, cross-referenced with code
---

# DESIGN.md Generator

Generate a `DESIGN.md` file from your existing design system data — Figma variables and typography styles first, cross-referenced against code tokens and component patterns, plus design guidelines. The output is a portable, AI-readable file that any agent (Claude Code, Cursor, Lovable, v0, Google Stitch) can consume to generate UI that stays on-brand without additional prompting. Figma is attempted by default — see [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md) — because a DESIGN.md built only from code can silently encode drift that's already crept into the CSS.

## Prerequisites

- Figma Desktop Bridge running (default source for variable values and typography styles — see `--no-figma` below if this genuinely isn't available)
- `.claude/ds-registry.json` — unified component registry (optional, enables fast path)
- `.claude/ds-token-map.json` — CSS token ↔ Figma variable cross-reference (optional; used to cross-check code against the live Figma read)
- CSS token files (e.g., `src/styles/tokens.css`, `src/styles/colors.css`)

## Arguments

- `$ARGUMENTS` — optional flags:
  - `--no-figma` — skip the live Figma read and generate from code-side sources alone. This is a **degraded fallback**, not the normal path — the output is labelled as code-only so nobody mistakes it for a Figma-verified DESIGN.md
  - `--update` — update an existing DESIGN.md, preserving manually written sections
  - `--root` — write to project root `DESIGN.md` instead of `.claude/DESIGN.md` (default)
  - `--spec` — output a [google-labs-code/design.md](https://github.com/google-labs-code/design.md) compliant file: YAML front matter with machine-readable tokens + markdown body in the canonical section order. Compatible with `design.md lint`, `design.md diff`, and `design.md export`.
  - (empty) — generate `.claude/DESIGN.md`, reading live Figma variables and text styles by default

---

## Phase 1: Load Data Sources

### 1.1 Load Registry (Fast Path)

If `.claude/ds-registry.json` exists, load it. The registry provides component names, variants, props, tokens, and section groupings in one read.

### 1.2 Load Figma Variables (default — skip only if `--no-figma`)

```js
// figma_execute
const collections = figma.variables.getLocalVariableCollections();
const allVars = figma.variables.getLocalVariables();
return collections.map(col => ({
  name: col.name,
  modes: col.modes,
  variables: allVars
    .filter(v => v.variableCollectionId === col.id)
    .map(v => ({
      name: v.name,
      resolvedType: v.resolvedType,
      valuesByMode: v.valuesByMode
    }))
}));
```

This is the primary source for the Color Palette section (Phase 2). If the Figma Desktop Bridge isn't reachable and `--no-figma` wasn't passed, stop and tell the user Figma isn't available rather than silently falling back — they can re-run with `--no-figma` if a degraded, code-only file is genuinely what they want.

### 1.3 Load Token Map (cross-check, not a substitute)

Read `.claude/ds-token-map.json` if it exists. This provides the CSS ↔ Figma variable cross-reference — use it to catch any CSS token whose value doesn't match what Phase 1.2 just read live from Figma, and prefer the live Figma value in the generated file.

If neither the token map nor a live Figma read is available (`--no-figma`, or Figma genuinely isn't accessible and the user confirmed they want the degraded fallback), read CSS token files directly:
- `src/styles/tokens.css` — primitive tokens
- `src/styles/colors.css` — semantic color tokens
- `src/styles/index.css` — root theme overrides
- Any file containing `:root {` or `.dark {` blocks with CSS custom properties

### 1.4 Load Typography

Pull text styles from Figma by default:
```js
// figma_execute
return figma.getLocalTextStyles().map(s => ({
  name: s.name,
  fontFamily: s.fontName.family,
  fontStyle: s.fontName.style,
  fontSize: s.fontSize,
  lineHeight: s.lineHeight,
  letterSpacing: s.letterSpacing
}));
```

Only under `--no-figma`, fall back to reading CSS for font declarations instead:
```css
/* Look for patterns like: */
--font-sans: "Inter", system-ui, sans-serif;
--font-mono: "JetBrains Mono", monospace;
```

### 1.5 Load Existing Design Context

Check for `.claude/proto-decisions.md` — extract any established design principles, rejected defaults, or layout decisions recorded during prior prototyping sessions. These become the "Design Guidelines" section, each labelled `(prototype-derived, pending design review)` unless a designer has confirmed it — prototype decisions are implementation choices, not design authority.

Check for an existing `DESIGN.md` or `.claude/DESIGN.md` (relevant for `--update` mode).

---

## Phase 2: Extract Color Palette

From the Figma variables read in Phase 1.2 (or the token map/CSS sources under `--no-figma`), build a structured color palette.

### 2.1 Primitive Colors

Extract all primitive color tokens (non-semantic, e.g., `--color-blue-500`):

```
Group by hue family: blue, red, green, yellow, neutral, etc.
For each family, list the scale steps (50, 100, 200, ... 900)
Record: token name, hex value, usage hint
```

### 2.2 Semantic Colors

Extract semantic tokens grouped by role:

| Role | Light | Dark | Token |
|------|-------|------|-------|
| Interactive primary | `#1a6cf7` | `#1a6cf7` | `--interactive-primary` |
| Surface background | `#f9fafb` | `#111111` | `--surface-background` |
| Primary foreground | `#1a1a1a` | `#f5f5f5` | `--primary-foreground` |
| Border input | `#e5e7eb` | `#374151` | `--border-input` |
| Destructive | `#dc2626` | `#ef4444` | `--destructive` |

Group semantics by category:
- **Interactive** — primary, secondary, hover, focus ring
- **Surface** — background, foreground, muted, card, popover
- **Border** — input, divider, focus
- **Feedback** — error, success, warning, info
- **Text** — primary, secondary, muted, disabled

### 2.3 Resolve Values

For each semantic token, trace alias chains to primitive hex values. For light/dark, record both resolved values.

---

## Phase 3: Extract Typography

### 3.1 Font Families

Identify font families from Figma text styles (default) or CSS `--font-*` tokens (`--no-figma`):
- Primary (sans-serif) — used for body and UI text
- Display — used for headings (if different)
- Mono — used for code

### 3.2 Type Scale

From Figma text styles (default) or CSS `text-*` / `text-size-*` tokens (`--no-figma`), extract the full scale:

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `text-xs` | 12px | 400 | 1.5 | Captions, labels |
| `text-sm` | 14px | 400 | 1.5 | Body, secondary |
| `text-base` | 16px | 400 | 1.5 | Primary body |
| `text-lg` | 18px | 500 | 1.4 | Subheadings |
| `text-xl` | 20px | 600 | 1.3 | Section titles |
| `text-2xl` | 24px | 700 | 1.2 | Page headings |
| `text-3xl` | 30px | 700 | 1.1 | Display |

Identify the naming convention used (Tailwind size names, semantic names like `heading-lg`, or numeric scales).

---

## Phase 4: Extract Spacing & Layout

From CSS token files or Tailwind config, extract the spacing scale:

- **Base unit** — the smallest spacing value (typically 4px or 8px)
- **Scale** — list of multiples (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96...)
- **Common patterns** — padding/gap values most used in components (from registry token data)
- **Border radius** — available radius values and their semantic names
- **Breakpoints** — mobile, tablet, desktop breakpoint values

---

## Phase 5: Extract Component Patterns

From the registry, extract key component guidelines for the DESIGN.md:

For each section (Actions, Forms, Data Display, etc.), document:
- Available components and their key variants
- Size conventions (if consistent across components, e.g., sm/md/lg)
- State conventions (default, hover, active, disabled, loading, error)
- Key constraints (e.g., "Buttons always use semantic tokens, never raw colors")

Focus on patterns, not full API docs (specs cover the full API — DESIGN.md is intent).

---

## Phase 6: Extract Shadows & Elevation

From CSS token files or Figma effects, extract the elevation/shadow system:

```css
/* Look for shadow tokens */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
```

Map to semantic usage:
- Level 0: Flat (cards, panels)
- Level 1: Raised (dropdowns, tooltips)
- Level 2: Overlay (modals, drawers)
- Level 3: Focus highlight (focus rings, selected states)

---

## Phase 7: Generate DESIGN.md

Assemble all extracted data into the standard DESIGN.md format. The file is designed to be read by AI agents as persistent context — keep it scannable, specific, and free of filler. Put a machine-readable provenance comment as the very first line: `<!-- ds-source: figma-live; figmaFile: FIGMA_FILE_KEY; generatedAt: 2026-09-26T00:00:00.000Z -->` (`figma-live` only when Figma was actually read this run). Under `--no-figma` write `<!-- ds-source: code-fallback -->` instead, and add a one-line notice right under the title: `> ⚠️ Generated with --no-figma: code sources only, not verified against Figma.` Omit it entirely when Figma was read successfully.

```markdown
# DESIGN.md

> Design system reference for AI agents. Read this file before generating any UI.

---

## Visual Theme

[2–4 sentences describing the visual identity: aesthetic, mood, personality]

Examples drawn from proto-decisions.md and overall token palette analysis:
- "Minimal, data-dense, dark-first. High contrast with generous whitespace."
- "Warm neutrals with high-saturation accent. Optimized for long reading sessions."

---

## Color Palette

### Semantic Colors

| Role | Light | Dark | Token |
|------|-------|------|-------|
| Interactive primary | `#hex` | `#hex` | `--interactive-primary` |
| Surface background | `#hex` | `#hex` | `--surface-background` |
| Primary foreground | `#hex` | `#hex` | `--primary-foreground` |
| Muted foreground | `#hex` | `#hex` | `--muted-foreground` |
| Border | `#hex` | `#hex` | `--border-input` |
| Destructive | `#hex` | `#hex` | `--destructive` |
| Success | `#hex` | `#hex` | `--feedback-success` |

### Usage Rules

- Use semantic tokens only. Never use primitive values directly in components.
- Light/dark modes switch by toggling the `.dark` class on `<html>`.
- All contrast ratios meet WCAG 2.1 AA (4.5:1 text, 3:1 UI components).

---

## Typography

**Font family:** [Primary font], [fallback stack]
**Mono font:** [Mono font], monospace

### Type Scale

| Name | Size | Weight | Line Height | Use for |
|------|------|--------|-------------|---------|
| ... | ... | ... | ... | ... |

### Rules

- Body text: `text-sm` (14px) or `text-base` (16px)
- Never go below `text-xs` (12px) for readable content
- Headings use `font-semibold` or `font-bold` only
- Code/data: always use the mono font

---

## Spacing

**Base unit:** [N]px

**Scale:** [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96...]px

**Common patterns:**
- Component padding: `[X]px` horizontal, `[Y]px` vertical
- Section gaps: `[N]px`
- Page margins: `[N]px`

**Border radius:** sm (`[N]px`), md (`[N]px`), lg (`[N]px`), full (pill)

---

## Components

### Available by Section

[List sections and key components from the DS registry]

### Size Conventions

[Document if components follow a consistent sm/md/lg system]

### State Conventions

Components support these states: default, hover, active, focus, disabled, loading, error.
- Disabled: use the `disabled` attribute, not visual-only styling
- Loading: `aria-busy="true"`, label preserved
- Error: `aria-invalid="true"` + visible error message

---

## Elevation

| Level | Token | Use for |
|-------|-------|---------|
| 0 — Flat | `--shadow-none` | Cards, panels |
| 1 — Raised | `--shadow-sm` | Dropdowns, tooltips |
| 2 — Overlay | `--shadow-md` | Modals, drawers |

---

## Design Guidelines

[Extracted from proto-decisions.md and design intent analysis]

### Do
- Use semantic color tokens everywhere
- Align spacing to the [N]px grid
- Maintain minimum 4.5:1 contrast for body text
- Use `focus-visible:ring-2` for all interactive elements
- Match density and rhythm from existing app pages

### Do Not
- Use raw hex values or rgba() in component styles
- Skip loading/empty/error states
- Use placeholder text ("Lorem ipsum", "John Doe")
- Create local re-implementations of DS components

---

## Agent Prompt Guide

Quick reference for AI tools generating UI with this design system:

**Package:** `@[org]/ds`
**Storybook:** `http://localhost:6006`
**Token system:** CSS custom properties (light/dark via `.dark` class on `<html>`)
**Component style:** [CVA/Tailwind/CSS Modules/etc.]
**Spacing grid:** [N]px base unit

When generating a component:
1. Import from `@[org]/ds` — never implement DS components locally
2. Use semantic tokens (`--interactive-primary`) not primitive values (`--color-blue-500`)
3. Apply `.dark` class to preview dark mode
4. Check [Storybook](http://localhost:6006) for available variants before inventing new ones
```

---

## Phase 7.5: Spec Format (`--spec`)

When `--spec` is set, prepend a YAML front matter block to the output using all extracted token data, and follow the canonical section order from the [google-labs-code/design.md](https://github.com/google-labs-code/design.md) spec.

### YAML Front Matter

Build the block from extracted tokens. Use `{path.to.token}` references for component values that alias existing color tokens:

```yaml
---
colors:
  primary: "<resolved hex — light mode>"
  background: "<resolved hex — light mode>"
  foreground: "<resolved hex — light mode>"
  muted: "<resolved hex — light mode>"
  border: "<resolved hex — light mode>"
  destructive: "<resolved hex — light mode>"
  success: "<resolved hex — light mode>"
typography:
  fontFamily: "<primary font stack>"
  monoFamily: "<mono font stack>"
  scale:
    xs: { size: "12px", weight: 400, lineHeight: 1.5 }
    sm: { size: "14px", weight: 400, lineHeight: 1.5 }
    base: { size: "16px", weight: 400, lineHeight: 1.5 }
    lg: { size: "18px", weight: 500, lineHeight: 1.4 }
    xl: { size: "20px", weight: 600, lineHeight: 1.3 }
    2xl: { size: "24px", weight: 700, lineHeight: 1.2 }
spacing:
  base: "<base unit in px>"
  scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
rounding:
  sm: "<value>"
  md: "<value>"
  lg: "<value>"
  full: "9999px"
components:
  button:
    background: "{colors.primary}"
    foreground: "#ffffff"
  card:
    background: "{colors.background}"
    border: "{colors.border}"
---
```

Include one entry per component family in the registry. Use `{colors.*}` references where a component token directly aliases a semantic color — the spec linter enforces these resolve.

### Canonical Section Order

Replace the standard section names with the spec's canonical order:

| Spec section | Maps from |
|---|---|
| `## Overview` | Visual Theme |
| `## Colors` | Color Palette |
| `## Typography` | Typography |
| `## Layout` | Spacing (scale, patterns, breakpoints) |
| `## Elevation & Depth` | Elevation |
| `## Shapes` | Border radius values (extracted from Spacing) |
| `## Components` | Components |
| `## Do's and Don'ts` | Design Guidelines |

Omit the **Agent Prompt Guide** section in spec output — it is Claude Code-specific and outside the google-labs-code format.

---

## Phase 8: Write Output

**Default (`--root` not set):** Write to `.claude/DESIGN.md`. This path is automatically loaded by `/ds-proto` and `/ds-spec`.

**With `--root`:** Write to `DESIGN.md` in the project root. This is the path most external AI tools (Cursor, Lovable, Google Stitch) look for by default.

**With `--update`:** Merge with the existing file. Preserve any manually written sections (Visual Theme, Guidelines). Replace auto-generated sections (Color Palette, Typography, Spacing, Components) with fresh data.

---

## Phase 9: Lint (`--spec`)

After writing the file, run the `design.md` linter if the CLI is available:

```bash
# Check for the CLI
npx design.md --version 2>/dev/null

# Lint the output file
npx design.md lint <output-path>
```

The linter checks for:
- Broken token references (e.g., `{colors.undefined}` with no matching key)
- Missing `colors.primary`
- WCAG contrast violations on foreground/background color pairs
- Orphaned tokens (defined in front matter but never referenced in the body)
- Section ordering violations against the canonical order

Report violations to the user. For contrast failures, do **not** change any value in DESIGN.md — it must keep Figma's values. List each failing pair with its ratio and a passing value as a *suggestion for the designer to apply in Figma*, then leave the file as Figma defines it. For structural issues (ordering, broken references), correct and re-lint before finalising the file.

If the CLI is not installed:

```bash
npm install --save-dev design.md
```

---

## Key Rules

1. **Specific over generic** — hex values and token names, not descriptions like "a blue color"
2. **Both themes** — every color entry includes light and dark resolved values
3. **Agent-readable** — tables over prose, scannable structure, no filler text
4. **Design intent lives here** — structural/API docs belong in specs; DESIGN.md captures mood, constraints, and rules
5. **Figma is the source of truth and wins on disagreement** — Figma-resolved values are authoritative: when a live Figma read and the token map/CSS disagree, the file records Figma's value. Always include the CSS custom property name alongside it so agents can still reference the live token in code.
6. **`--no-figma` output is labelled, not silent** — a code-only DESIGN.md must say so at the top of the file, so nobody mistakes it for a Figma-verified one

## Usage

```bash
# Generate .claude/DESIGN.md, reading live Figma variables and text styles by default
/ds-design-md

# Degraded fallback: code sources only, clearly labelled as such (Figma unavailable)
/ds-design-md --no-figma

# Write to project root (for Cursor, Lovable, Google Stitch)
/ds-design-md --root

# Update existing DESIGN.md (preserves manual sections)
/ds-design-md --update

# Full generation from Figma, written to project root
/ds-design-md --root

# Generate google-labs-code/design.md spec-compliant file (YAML front matter + canonical sections)
/ds-design-md --spec --root

# Spec-compliant, degraded code-only fallback with lint validation
/ds-design-md --spec --no-figma --root
```

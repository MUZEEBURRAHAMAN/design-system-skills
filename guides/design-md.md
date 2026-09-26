# DESIGN.md Guide

`DESIGN.md` is a markdown file that captures your design system's visual identity in a format any AI agent can read. Where the DS Registry and token map cover structure and bindings, DESIGN.md covers intent: the palette, the typographic scale, the spacing grid, the component conventions, and the rules that constrain how everything fits together.

AI tools like Cursor, Lovable, v0, and Google Stitch look for `DESIGN.md` in the project root and load it as persistent context when generating UI. Claude Code skills (`/ds-proto`, `/ds-spec`) check for `.claude/DESIGN.md` automatically.

---

## Generate It

Run `/ds-design-md` to generate `DESIGN.md` from your existing design system data. The skill reads your Figma variables and text styles first (the source of truth), then cross-checks your token map and CSS files, and adds the component registry and prior prototyping decisions.

```bash
# Generate .claude/DESIGN.md (used by ds-proto and ds-spec)
/ds-design-md

# Degraded fallback when Figma isn't reachable: code-only, labelled as such in the file
/ds-design-md --no-figma

# Write to project root (picked up by Cursor, Lovable, Google Stitch)
/ds-design-md --root

# Both locations
/ds-design-md --root
```

---

## What It Contains

A complete DESIGN.md has seven sections:

| Section | Source | What it captures |
|---------|--------|-----------------|
| **Visual Theme** | proto-decisions.md + token analysis | Mood, aesthetic, personality (2–4 sentences) |
| **Color Palette** | Figma variables (cross-checked against the token map) | Semantic tokens with light/dark hex values and usage rules |
| **Typography** | Figma text styles (CSS tokens only under `--no-figma`) | Font families, full type scale with sizes/weights/line heights |
| **Spacing** | CSS tokens + Tailwind config | Base unit, scale, common padding/gap patterns, border radius |
| **Components** | DS registry | Available sections, size and state conventions |
| **Elevation** | Figma effects (CSS shadow tokens only under `--no-figma`) | Shadow levels mapped to semantic uses |
| **Design Guidelines** | proto-decisions.md | Do/don'ts distilled from established patterns |
| **Agent Prompt Guide** | Registry + meta | Package name, Storybook URL, token system — quick reference for AI |

---

## Two Locations, Two Uses

| Path | Used by |
|------|---------|
| `.claude/DESIGN.md` | `/ds-proto`, `/ds-spec` — automatically loaded during skill runs |
| `DESIGN.md` (project root) | Cursor, Lovable, v0, Google Stitch — picked up as project context |

Both can coexist. Generate both with `/ds-design-md --root`.

---

## Keeping It in Sync

DESIGN.md is generated from live sources but it's not auto-regenerated on every run. Regenerate it when:

- **Figma changes** — variables, text styles, or effects edited (this is the primary trigger)
- Tokens change (new semantic colors, spacing scale updates)
- Typography is updated (new font, scale changes)
- Major component patterns are added or removed
- The visual identity shifts (rebrand, theme overhaul)

```bash
# Regenerate, preserving any manually written sections
/ds-design-md --update --root
```

The `--update` flag keeps manually written content (Visual Theme, Guidelines) and replaces the auto-generated sections (Color Palette, Typography, Spacing) with fresh data.

---

## Manual Sections

Two sections benefit from human input that can't be derived from tokens alone:

**Visual Theme** — 2–4 sentences describing the mood and personality. The skill generates a draft from token analysis, but edit it to match your actual intent:

```markdown
## Visual Theme

Minimal, data-dense, dark-first. Neutral grays with a single high-saturation accent.
Designed for extended reading sessions in professional tools.
```

**Design Guidelines** — the skill seeds this from `.claude/proto-decisions.md`, but add your own rules here:

```markdown
## Design Guidelines

### Do
- Match the density and rhythm of existing app pages before composing
- Use `font-mono` for all numeric data in tables and metrics

### Do Not
- Use gradients — the palette is flat
- Nest cards inside cards
```

Commit both of these to version control. They're stable design decisions, not generated artifacts.

---

## google-labs-code Spec Format

The [google-labs-code/design.md](https://github.com/google-labs-code/design.md) project defines a formal spec for the format: YAML front matter with machine-readable tokens, plus a markdown body in a canonical section order. The CLI provides `lint`, `diff`, and `export` commands for validating and converting the file.

Pass `--spec` to `/ds-design-md` to generate a spec-compliant file.

### What changes with `--spec`

**YAML front matter** is prepended, containing resolved token values:

```yaml
---
colors:
  primary: "#1a6cf7"
  background: "#f9fafb"
  foreground: "#1a1a1a"
  muted: "#6b7280"
  border: "#e5e7eb"
typography:
  fontFamily: "Inter, system-ui, sans-serif"
  monoFamily: "JetBrains Mono, monospace"
  scale:
    sm: { size: "14px", weight: 400, lineHeight: 1.5 }
    base: { size: "16px", weight: 400, lineHeight: 1.5 }
spacing:
  base: "4px"
  scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
rounding:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
components:
  button:
    background: "{colors.primary}"
---
```

**Section names** follow the spec's canonical order:

| Spec section | Standard section |
|---|---|
| Overview | Visual Theme |
| Colors | Color Palette |
| Typography | Typography |
| Layout | Spacing |
| Elevation & Depth | Elevation |
| Shapes | *(border radius, split out from Spacing)* |
| Components | Components |
| Do's and Don'ts | Design Guidelines |

The Agent Prompt Guide section is omitted in spec output — it's Claude Code-specific.

### CLI tools

With the `design.md` CLI installed (`npm install --save-dev design.md`):

```bash
# Validate the file — broken references, contrast, missing tokens, section order
npx design.md lint DESIGN.md

# Compare two versions — detects token-level regressions
npx design.md diff DESIGN.md DESIGN.md.prev

# Export tokens to Tailwind config or W3C DTCG format
npx design.md export --format tailwind DESIGN.md > tailwind-tokens.js
npx design.md export --format w3c DESIGN.md > tokens.json
```

`/ds-design-md --spec` runs the linter automatically after writing the file and reports any violations.

---

## Relationship to Other Skills

`/ds-proto` loads DESIGN.md in Phase 1.6 and uses the visual theme and guidelines to:
- Ground concept generation (`--concepts`) in the stated identity
- Catch violations during the self-critique (Phase 4.6)

`/ds-spec` loads DESIGN.md in Phase 0.3 and uses it to:
- Keep usage examples consistent with the stated design language
- Verify token names match what the Agent Prompt Guide declares

`/ds-tokens` validates the data that feeds DESIGN.md — run `/ds-tokens --update` before regenerating DESIGN.md to ensure the token map is current.

---

## Example: Minimal DESIGN.md

```markdown
# DESIGN.md

> Design system reference for AI agents. Read before generating UI.

---

## Visual Theme

Minimal, dark-first, high-contrast. Neutral with a single blue accent.
Dense information architecture — every pixel earns its place.

---

## Color Palette

### Semantic Colors

| Role | Light | Dark | Token |
|------|-------|------|-------|
| Interactive primary | `#1a6cf7` | `#1a6cf7` | `--interactive-primary` |
| Surface background | `#f9fafb` | `#111111` | `--surface-background` |
| Primary foreground | `#1a1a1a` | `#f5f5f5` | `--primary-foreground` |
| Muted foreground | `#6b7280` | `#9ca3af` | `--muted-foreground` |
| Border | `#e5e7eb` | `#374151` | `--border-input` |
| Destructive | `#dc2626` | `#ef4444` | `--destructive` |

### Usage Rules
- Semantic tokens only. No primitive values in components.
- Dark mode: `.dark` class on `<html>`.
- All contrast ratios meet WCAG 2.1 AA.

---

## Typography

**Font:** Inter, system-ui, sans-serif
**Mono:** JetBrains Mono, monospace

| Name | Size | Weight | Line Height | Use |
|------|------|--------|-------------|-----|
| `text-xs` | 12px | 400 | 1.5 | Captions |
| `text-sm` | 14px | 400 | 1.5 | Body, labels |
| `text-base` | 16px | 400 | 1.5 | Primary body |
| `text-lg` | 18px | 500 | 1.4 | Subheadings |
| `text-xl` | 20px | 600 | 1.3 | Section titles |
| `text-2xl` | 24px | 700 | 1.2 | Page headings |

---

## Spacing

**Base unit:** 4px

**Common patterns:** Component padding 8px/16px. Section gaps 24px. Page margins 32px.

**Border radius:** sm 4px, md 6px, lg 8px, full 9999px.

---

## Components

**Available sections:** Actions, Forms, Data Display, Feedback, Layout

**Sizes:** sm / md / lg across all interactive components.

**States:** default, hover, focus, active, disabled, loading, error.

---

## Elevation

| Level | Token | Use |
|-------|-------|-----|
| Flat | none | Cards, panels |
| Raised | `--shadow-sm` | Dropdowns |
| Overlay | `--shadow-md` | Modals |

---

## Design Guidelines

### Do
- Use semantic tokens everywhere
- Align spacing to 4px grid
- Match density from existing app pages

### Do Not
- Use raw hex values
- Create local component re-implementations
- Use placeholder data

---

## Agent Prompt Guide

**Package:** `@acme/ds`
**Storybook:** `http://localhost:6006`
**Tokens:** CSS custom properties (`.dark` class for dark mode)
**Stack:** React + CVA + Tailwind

Import from `@acme/ds`. Use semantic tokens. Check Storybook for available variants.
```

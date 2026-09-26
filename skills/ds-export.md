---
description: Convert DESIGN.md front matter tokens to Tailwind config, W3C DTCG, Style Dictionary, or CSS custom properties
---

# DS Export

Convert the YAML front matter in `DESIGN.md` to token formats consumed by other tools: Tailwind config, W3C Design Token Community Group (DTCG) JSON, Style Dictionary input, or CSS custom properties. Run after generating a spec-compliant DESIGN.md with `/ds-design-md --spec`.

## Prerequisites

- `DESIGN.md` or `.claude/DESIGN.md` with YAML front matter
- `design.md` CLI installed (`npm install --save-dev design.md`) for Tailwind and W3C export
- Node.js for Style Dictionary and CSS output

## Arguments

- `$ARGUMENTS` — target format(s): `tailwind`, `w3c`, `style-dictionary`, `css`. Accepts multiple values separated by spaces. Defaults to `tailwind`.
- `--out <dir>` — output directory. Defaults to `.claude/exports/`.
- `--all` — export all four formats in one pass.

---

## Phase 1: Load and Validate

Read `DESIGN.md` from the project root, or `.claude/DESIGN.md` if root file is absent.

Check the `<!-- ds-source: ... -->` provenance comment at the top of DESIGN.md. If it says `code-fallback` or is missing, warn that these exports aren't verified against Figma, and stop unless the user confirms. Then parse the YAML front matter. If front matter is missing, stop and prompt the user to regenerate with `/ds-design-md --spec`.

Validate that `colors.primary` and `typography.fontFamily` exist — these are required by all downstream formats.

---

## Phase 2: Export Tailwind Config

```bash
npx design.md export --format tailwind DESIGN.md
```

Write to `<out>/tailwind-tokens.js`:

```js
/** Generated from DESIGN.md — do not edit by hand */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: "#1a6cf7",
        background: "#f9fafb",
        foreground: "#1a1a1a",
        muted: "#6b7280",
        border: "#e5e7eb",
        destructive: "#dc2626",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      spacing: {
        // scale from DESIGN.md spacing.scale
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        full: "9999px",
      },
    },
  },
};
```

---

## Phase 3: Export W3C DTCG JSON

```bash
npx design.md export --format w3c DESIGN.md
```

Write to `<out>/tokens.json` following the [W3C Design Tokens format](https://www.w3.org/community/design-tokens/):

```json
{
  "color": {
    "primary": { "$value": "#1a6cf7", "$type": "color" },
    "background": { "$value": "#f9fafb", "$type": "color" },
    "foreground": { "$value": "#1a1a1a", "$type": "color" }
  },
  "typography": {
    "fontFamily": { "$value": "Inter, system-ui, sans-serif", "$type": "fontFamily" }
  },
  "spacing": {
    "base": { "$value": "4px", "$type": "dimension" }
  }
}
```

---

## Phase 4: Export Style Dictionary

Transform the YAML front matter into a Style Dictionary properties object. Write to `<out>/tokens.style-dictionary.json`:

```json
{
  "color": {
    "primary": { "value": "#1a6cf7", "attributes": { "category": "color" } },
    "background": { "value": "#f9fafb", "attributes": { "category": "color" } }
  },
  "font": {
    "family": {
      "sans": { "value": "Inter, system-ui, sans-serif" },
      "mono": { "value": "JetBrains Mono, monospace" }
    }
  },
  "size": {
    "spacing": {
      "base": { "value": "4" }
    }
  }
}
```

Also write a minimal `style-dictionary.config.json` to `<out>/`:

```json
{
  "source": ["tokens.style-dictionary.json"],
  "platforms": {
    "css": { "transformGroup": "css", "buildPath": "dist/", "files": [{ "destination": "variables.css", "format": "css/variables" }] },
    "ios": { "transformGroup": "ios-swift", "buildPath": "dist/ios/", "files": [{ "destination": "StyleDictionary.swift", "format": "ios-swift/class.swift" }] },
    "android": { "transformGroup": "android", "buildPath": "dist/android/", "files": [{ "destination": "tokens.xml", "format": "android/resources" }] }
  }
}
```

---

## Phase 5: Export CSS Custom Properties

Transform tokens to a CSS file with `:root` declarations. Write to `<out>/tokens.css`:

```css
/* Generated from DESIGN.md — do not edit by hand */
:root {
  --color-primary: #1a6cf7;
  --color-background: #f9fafb;
  --color-foreground: #1a1a1a;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-destructive: #dc2626;
  --font-sans: Inter, system-ui, sans-serif;
  --font-mono: JetBrains Mono, monospace;
  --spacing-base: 4px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
}
```

---

## Phase 6: Report

List each file written with its path and token count:

```
Exported from DESIGN.md

  tailwind    → .claude/exports/tailwind-tokens.js    (14 tokens)
  w3c         → .claude/exports/tokens.json           (14 tokens)
  css         → .claude/exports/tokens.css            (14 tokens)

Token references resolved: 14 / 14
```

Warn if any `{colors.*}` references in component tokens could not be resolved (broken reference in front matter).

---

## Key Rules

1. **Front matter is the source of truth** — export reads only the YAML block, not the markdown prose.
2. **Resolve references before export** — `{colors.primary}` must resolve to a hex value in the output; no tool downstream handles reference syntax.
3. **Never modify DESIGN.md** — exports are read-only transforms; changes flow back through `/ds-design-md`.

## Usage

```bash
# Export Tailwind config (default)
/ds-export

# Export W3C DTCG JSON
/ds-export w3c

# Export multiple formats
/ds-export tailwind w3c css

# Export all formats to a custom directory
/ds-export --all --out tokens/

# Export Style Dictionary and generate platform configs
/ds-export style-dictionary
```

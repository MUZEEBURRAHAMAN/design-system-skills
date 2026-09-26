---
description: Fork a DESIGN.md into a brand variant by overriding tokens, then validate WCAG contrast on the result
---

# DS Brand

Fork an existing spec-compliant `DESIGN.md` into a brand variant *proposal* by overriding color, typography, and spacing tokens. The overrides come from the command line, not from Figma, so the output is a **proposal, not a design of record**: it is stamped `<!-- ds-source: brand-proposal -->` and only becomes a real brand once a designer builds it in that brand's Figma file (see `guides/multi-brand.md`) and `/ds-design-md` regenerates it from there. The fork inherits all tokens not explicitly overridden, runs the `design.md` linter, and validates WCAG contrast ratios on every foreground/background pair.

## Prerequisites

- A source `DESIGN.md` with YAML front matter (generated with `/ds-design-md --spec`) whose provenance comment is `ds-source: figma-live` — a brand fork of a code-fallback file would spread unverified values; the skill warns and asks before continuing
- `design.md` CLI installed (`npm install --save-dev design.md`)

## Arguments

- `$ARGUMENTS` — brand name, used as the output file prefix (e.g. `partner`, `dark`, `acme-enterprise`)
- `--from <path>` — source DESIGN.md path. Defaults to `DESIGN.md`, then `.claude/DESIGN.md`.
- `--colors <json>` — JSON object of color overrides, e.g. `'{"primary":"#e11d48","background":"#0f172a"}'`
- `--font <family>` — primary font family override, e.g. `"Geist, sans-serif"`
- `--spacing-base <px>` — base spacing unit override, e.g. `8`
- `--out <dir>` — output directory. Defaults to `.claude/brands/`.

---

## Phase 1: Load Source

Read the source DESIGN.md specified by `--from`. Parse the YAML front matter.

If front matter is absent, stop and prompt the user to regenerate the source file with `/ds-design-md --spec` before forking.

Record the source file path and resolved token count for the report.

---

## Phase 2: Apply Overrides

Deep-merge the provided overrides into the source token object:

- `--colors` JSON: merge into `colors.*`. Accepts hex values or `{path.to.token}` references.
- `--font`: set `typography.fontFamily`.
- `--spacing-base`: set `spacing.base`.

All tokens not covered by an override carry over from the source unchanged.

Resolve any `{colors.*}` references introduced by overrides. If a reference points to a key not present in the merged token set, report it as a broken reference and stop — do not write an invalid file.

---

## Phase 3: Generate Brand File

Assemble the brand DESIGN.md:

1. Write the merged YAML front matter.
2. Copy the markdown body from the source file, updating any inline hex values or token names that appear in the prose to match the overrides. Sections that contain no token references carry over verbatim.
3. Update the `## Overview` section to note the brand variant: append one sentence identifying it as a fork of the source (e.g. "This is the Partner brand variant. Primary and surface colors differ from the base.").

Write to `<out>/<brand-name>.DESIGN.md`, starting with `<!-- ds-source: brand-proposal; base: <source path>; generatedAt: <ISO> -->` so no downstream tool mistakes it for a Figma-verified file.

---

## Phase 4: Lint

Run the linter on the output file:

```bash
npx design.md lint <out>/<brand-name>.DESIGN.md
```

Report all violations. Fix broken token references and section ordering automatically. For missing `colors.primary`, stop and ask the user to supply a value — do not invent one.

Re-lint after any auto-fix to confirm clean output.

---

## Phase 5: WCAG Contrast Validation

For every foreground/background pair in the brand token set, compute the contrast ratio:

| Pair | Tokens | Ratio | AA (4.5:1) | AA Large (3:1) |
|---|---|---|---|---|
| Text on surface | foreground / background | 12.4:1 | ✓ | ✓ |
| Primary on surface | primary / background | 3.1:1 | ✗ | ✓ |
| Muted text | muted / background | 4.6:1 | ✓ | ✓ |

Flag any pair that fails the relevant threshold. For failures, suggest the minimum hex adjustment that achieves AA while staying within the hue family the user provided.

---

## Phase 6: Report

```
Brand variant: <brand-name>
Source: DESIGN.md
Output: .claude/brands/<brand-name>.DESIGN.md

Overrides applied: N tokens
Inherited from source: N tokens

Lint: ✓ clean

Contrast
  ✓ foreground / background   12.4:1
  ✗ primary / background       3.1:1  — fails AA text (4.5:1)
    Suggested adjustment: #c0152d (4.6:1)
  ✓ muted / background         4.6:1

Action required: 1 contrast failure. Ask the brand's designer to adjust colors.primary in that brand's Figma file (a passing value is suggested above) — don't ship these overrides from code.
```

---

## Key Rules

1. **Inherit, don't duplicate** — a brand variant is a diff against the source, not a full copy. Overrides only.
2. **Never invent token values** — if the user doesn't provide a value, inherit from source. Ask rather than guess.
3. **Lint before reporting** — a brand file with broken references is invalid; don't hand the user a broken file.
4. **Contrast failures are advisory, not blocking** — report them clearly, but write the file. The user may be designing for a specific context (e.g., dark UI where different thresholds apply).

## Usage

```bash
# Fork with a color override
/ds-brand partner --colors '{"primary":"#e11d48","background":"#0f172a","foreground":"#f8fafc"}'

# Fork with a font override
/ds-brand enterprise --font "Geist, sans-serif"

# Fork a specific source file to a custom output directory
/ds-brand dark --from .claude/DESIGN.md --colors '{"background":"#09090b","foreground":"#fafafa"}' --out brands/

# Full override: colors, font, spacing
/ds-brand acme --colors '{"primary":"#7c3aed"}' --font "Manrope, sans-serif" --spacing-base 8
```

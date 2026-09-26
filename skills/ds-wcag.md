---
description: WCAG 2.1 Level AA accessibility audit for design system components
---

# Accessibility Checker (WCAG 2.1 AA)

Audit design system components for WCAG 2.1 Level AA compliance. Checks semantic HTML, ARIA attributes, keyboard navigation, color contrast, and screen reader support.

## Prerequisites

- Storybook dev server running on `http://localhost:6006` (launch with `/storybook` if not running)
- `.claude/ds-registry.json` — unified component registry (optional, enables fast path)
- `design-system-manifest.json` in project root (component inventory, fallback)
- `.claude/ds-story-figma-map.json` — for Storybook story IDs and source file paths (fallback)
- `.claude/rules/accessibility.md` — the full WCAG 2.1 AA criteria checklist

## Arguments

- `$ARGUMENTS` — optional component name filter. Examples:
  - `Button` — audit Button only
  - `"Forms"` — audit all form components
  - (empty) — audit ALL components

---

## Phase 1: Setup

### 1.0 Load the DS Registry (Fast Path)

If `.claude/ds-registry.json` exists, load it as the primary component inventory. The registry provides component names, source file paths, variants, props, tokens, and story IDs — replacing separate reads of the manifest and mapping file for phases 1.1–1.2.

If the registry does not exist, fall back to the multi-file approach in 1.1.

### 1.1 Load Rules & Component Inventory

1. **Read `.claude/rules/accessibility.md`** — the full WCAG 2.1 AA criteria checklist
2. **Read `design-system-manifest.json`** — component inventory with props and argTypes (skip if registry loaded)
3. **Read `.claude/ds-story-figma-map.json`** — for Storybook story IDs and source file paths (skip if registry loaded)

### 1.2 Filter Components

If `$ARGUMENTS` is provided, filter to matching components (case-insensitive partial match on component name or section name). Otherwise audit all components.

### 1.3 Ensure Storybook

Verify Storybook is running on `http://localhost:6006`. If not, start it with `preview_start`.

---

## Phase 2: Per-Component Audit

For each component, run a four-part audit:

### 2.1 Source Code Analysis (Static)

Read the component source file and verify:

**Semantic HTML:**
- Interactive elements use correct native elements (`<button>`, `<a>`, `<input>`, not `<div onClick>`)
- Form inputs have associated labels (via `htmlFor`/`id` or `aria-label`)
- Error messages linked via `aria-describedby`
- Required fields marked with `required` or `aria-required`
- Tables use proper `<table>`, `<th scope>`, `<caption>` structure

**ARIA Attributes:**
- Custom widgets have explicit ARIA roles
- Dynamic state communicated via `aria-expanded`, `aria-selected`, `aria-checked`, etc.
- Live regions for async updates (`aria-live`, `role="alert"`, `role="status"`)
- No redundant or abstract roles
- Radix-based components: verify primitive used correctly, consumer labels provided

**Keyboard:**
- All click handlers have keyboard equivalents (or use native `<button>`)
- Focus ring present via `focus-visible:ring-*` classes
- No positive `tabIndex` values
- Dialog/popover: focus trap and restoration logic present

**Motion:**
- Animations use `motion-safe:` prefix or check `prefers-reduced-motion`

### 2.2 Rendered Audit (Storybook + axe-core)

Navigate to the component's default story in Storybook and run axe-core programmatically:

```js
// In preview_eval:
const results = await new Promise((resolve) => {
  const el = document.querySelector('#storybook-root') || document.querySelector('.sb-show-main');
  if (window.axe) {
    window.axe.run(el).then(resolve);
  } else {
    resolve({ violations: [], passes: [], incomplete: [] });
  }
});
JSON.stringify({
  violations: results.violations.map(v => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.length,
    help: v.helpUrl
  })),
  passCount: results.passes.length,
  incompleteCount: results.incomplete.length
});
```

If `axe` is not available on `window`, inject it first:
```js
if (!window.axe) {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.11.1/axe.min.js';
  document.head.appendChild(script);
  await new Promise(r => script.onload = r);
}
```

### 2.3 Keyboard Navigation Test

For each component, test keyboard interactions:

1. **Tab to component** — verify focus ring appears
2. **Activate** — Enter/Space triggers the expected action
3. **Component-specific keys** — check against the keyboard interaction table in `.claude/rules/accessibility.md` section 3.2
4. **Tab away** — verify focus moves to next element, no focus trap (except modals)

For interactive states (dropdown open, dialog open):
```js
// Tab to element
preview_eval: document.querySelector('[data-testid="component"]')?.focus()
// Check focus visible
preview_inspect: selector for :focus-visible styles
// Trigger keyboard event
preview_eval: document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
```

### 2.4 Contrast Audit

For the component's default and key variant states:

1. Use `preview_inspect` to capture `color`, `background-color`, `border-color`
2. Calculate contrast ratios using the WCAG formula (see `.claude/rules/accessibility.md` section 4.4)
3. Verify:
   - Normal text: >= 4.5:1
   - Large text (>= 18px or >= 14px bold): >= 3.0:1
   - UI components against adjacent background: >= 3.0:1
4. Repeat for dark theme (reload story with `&globals=theme:dark`)

**Token-level check (if Figma connected):**
If the Figma Desktop Bridge is available, also cross-reference the Storybook computed colors against Figma's variable bindings (the reference) and flag any place the implementation uses a different token than Figma binds — that's a code fix, never a Figma change.

---

## Phase 3: Report

### 3.1 Per-Component Report

For each component, generate:

```markdown
## [Component Name]

### Positive Points
- [List detected good practices]

### Issues Detected

#### Critical (P0) — Blocking
- [ ] [File:Line] [Problem description]
      Solution: [How to fix]

#### Important (P1) — To fix
- [ ] [File:Line] [Problem description]
      Solution: [How to fix]

#### Minor (P2) — Improvement
- [ ] [File:Line] [Problem description]
      Solution: [How to fix]

### Scores
| Category | Score |
|----------|-------|
| Semantic HTML | X/5 |
| ARIA Attributes | X/5 |
| Keyboard / Focus | X/5 |
| Color / Contrast | X/5 |
| **Total** | **X/20** |

### Verdict: [COMPLIANT / MINOR ISSUES / TO FIX / NON-COMPLIANT]

### axe-core Results
- Violations: N (X critical, Y serious, Z moderate)
- Passes: N
- Incomplete: N
```

### 3.2 Summary Report

After auditing all components, write `.claude/ds-wcag-report.md`:

```markdown
# WCAG 2.1 AA Accessibility Audit Report
**Date:** [ISO date]
**Components audited:** N
**Filter:** [component filter or "all"]

## Summary

| Verdict | Count |
|---------|-------|
| COMPLIANT (18-20) | X |
| MINOR ISSUES (14-17) | Y |
| TO FIX (10-13) | Z |
| NON-COMPLIANT (0-9) | W |

## Component Scores

| Component | Semantic | ARIA | Keyboard | Contrast | Total | Verdict | P0 Issues |
|-----------|----------|------|----------|----------|-------|---------|-----------|
| Button | 5 | 5 | 5 | 5 | 20 | COMPLIANT | 0 |
| Input | 4 | 3 | 5 | 5 | 17 | MINOR | 0 |
| ... | | | | | | | |

## Critical Issues (P0)

| Component | Issue | File:Line | Impact |
|-----------|-------|-----------|--------|
| Select | Missing aria-expanded | select.tsx:45 | Screen readers |
| ... | | | |

## axe-core Violation Summary

| Rule ID | Impact | Components Affected | Description |
|---------|--------|-------------------|-------------|
| color-contrast | serious | Badge, Tabs | Insufficient contrast ratio |
| ... | | | |

## Recommendations

1. [Prioritised list of fixes]
2. ...
```

---

## Phase 4: Auto-Fix Loop

For P0 and P1 issues where the fix is clear and mechanical, run a fix-then-verify loop until no fixable issues remain or manual intervention is required.

### 4.1 Identify Auto-Fixable Issues

After Phase 3, collect all P0 and P1 issues across all components. Classify each as:

- **AUTO** — can be applied mechanically with the Edit tool
- **MANUAL** — requires design or structural judgment. **Colour contrast failures are always MANUAL/design issues**: the colours come from Figma's variables, so the fix is a designer's decision in Figma. Never auto-fix contrast by editing a token or picking a different colour in code (that would make code the design authority). The only code-side contrast fix is when code's value *differs* from Figma's — that's drift, fixed toward Figma via `/ds-sync`

**Auto-fixable patterns:**

| Issue | Pattern | Fix |
|-------|---------|-----|
| Missing `aria-label` on icon-only button | `<button>` with no text, no `aria-label` | Add `aria-label` prop to component signature and usage |
| Missing `aria-invalid` on error state | `error` prop exists but no `aria-invalid` | Add `aria-invalid={!!error}` to the input element |
| Missing `aria-describedby` for error | Error message rendered but not linked | Add `id` to error element, add `aria-describedby={errorId}` to input |
| Missing `aria-required` | `required` prop not forwarded to element | Add `aria-required={required}` or forward `required` attribute |
| Missing `role="alert"` on error container | Error container has no live region | Add `role="alert"` or `aria-live="assertive"` |
| Missing `sr-only` on icon-only action | Icon rendered with no accessible label | Add `<span className="sr-only">[label]</span>` inside the button |
| Missing `aria-hidden` on decorative icon | Icon alongside visible text has no `aria-hidden` | Add `aria-hidden="true"` to the icon element |
| Redundant `role` on native element | `<button role="button">` | Remove the redundant `role` attribute |
| Missing `focus-visible` ring | Interactive element has no `focus-visible:ring-*` | Add `focus-visible:ring-2 focus-visible:ring-interactive-focus-ring focus-visible:ring-offset-2` |

### 4.2 Fix → Verify Loop

For each AUTO issue, in order of severity (P0 first):

**Step 1 — Present the fix:**

```
Component: Input (src/components/Input.tsx:34)
Issue: Missing aria-invalid on error state (P0)
Proposed fix:
  Before: <input id={id} {...props} />
  After:  <input id={id} aria-invalid={!!error} {...props} />
Apply? [y/n]
```

**Step 2 — Apply on approval:**

Use the Edit tool to apply the change. Record the file path, line number, before, and after.

**Step 3 — Re-verify:**

After applying the fix, re-run the targeted axe-core check on the affected component:

```js
// preview_eval — re-run axe after fix (requires Storybook hot-reload)
await new Promise(r => setTimeout(r, 1500)); // wait for HMR
const results = await window.axe.run(document.querySelector('#storybook-root'));
return results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
```

If the violation is gone → mark the issue as **FIXED**. If the violation persists → escalate to **MANUAL**.

**Step 4 — Re-score the component:**

After all fixes for a component are applied, re-run the full Phase 2 audit on that component and update its score. Show before/after:

```
Button — Before: 14/20 (MINOR ISSUES) → After: 20/20 (COMPLIANT)
Input  — Before: 11/20 (TO FIX)       → After: 17/20 (MINOR ISSUES) [1 manual issue remains]
```

### 4.3 Fix Summary

After the loop completes, append a fix summary to `.claude/ds-wcag-report.md`:

```markdown
## Auto-Fix Summary

| Component | Issues Fixed | Issues Remaining (Manual) | Score Before | Score After |
|-----------|:---:|:---:|:---:|:---:|
| Button | 3 | 0 | 14/20 | 20/20 |
| Input | 2 | 1 | 11/20 | 17/20 |
| Select | 0 | 4 | 8/20 | 8/20 |

**Total auto-fixed:** X issues across Y components
**Still requiring manual work:** Z issues

### Remaining Manual Issues

| Component | Issue | Severity | Why Manual |
|-----------|-------|----------|------------|
| Select | Missing keyboard type-ahead | P0 | Requires logic change |
| Dialog | Focus restoration missing | P0 | Requires ref wiring |
```

---

## Phase 5: Dual-Theme Contrast Audit

A standalone pass that ensures contrast ratios pass in **both** light and dark themes for every component. Run this after Phase 2.4, or invoke independently with `--themes-only`.

### 5.1 Build a Theme Color Map

For each CSS token used by the components under audit, record its resolved value in both modes:

```js
// Read light and dark CSS variables from the document
// Light: load story at &globals=theme:light, then getComputedStyle(document.documentElement)
// Dark:  load story at &globals=theme:dark,  then getComputedStyle(document.documentElement)
const tokens = ['--surface-background', '--primary-foreground', '--border-input', ...];
const lightValues = tokens.map(t => ({ token: t, value: getComputedStyle(document.documentElement).getPropertyValue(t).trim() }));
```

Resolve any `var(--alias)` references until raw hex/rgb values are reached. Build:

```json
{
  "--surface-background": { "light": "#f9fafb", "dark": "#111111" },
  "--primary-foreground": { "light": "#1a1a1a", "dark": "#f5f5f5" }
}
```

### 5.2 Per-Component, Per-Theme Contrast Check

For each component, for each of its foreground/background token pairs, calculate contrast in both modes:

```
Pair: text (--primary-foreground) on background (--surface-background)
  Light: #1a1a1a on #f9fafb → ratio: 17.5:1 ✅
  Dark:  #f5f5f5 on #111111 → ratio: 14.2:1 ✅

Pair: placeholder (--muted-foreground) on background (--surface-background)
  Light: #6b7280 on #f9fafb → ratio: 4.6:1 ✅
  Dark:  #6b7280 on #111111 → ratio: 3.1:1 ❌ FAIL (< 4.5:1 for normal text)
```

Use the WCAG 2.0 luminance formula from `.claude/rules/accessibility.md` section 4.4.

### 5.3 Theme Contrast Report

```markdown
## Dual-Theme Contrast Audit

| Component | Token Pair | Light Ratio | Light | Dark Ratio | Dark | Issue |
|-----------|-----------|-------------|:---:|------------|:---:|-------|
| Input | text / surface | 17.5:1 | ✅ | 14.2:1 | ✅ | — |
| Input | placeholder / surface | 4.6:1 | ✅ | 3.1:1 | ❌ | P0: Dark placeholder fails 4.5:1 |
| Badge | text / badge-bg | 5.2:1 | ✅ | 2.8:1 | ❌ | P0: Dark badge insufficient contrast |

### Failing Pairs
| Component | Theme | Pair | Ratio | Required | Fix |
|-----------|-------|------|-------|----------|-----|
| Input | Dark | --muted-foreground / --surface-background | 3.1:1 | 4.5:1 | **Design issue** — Figma variable `muted-foreground` (Dark) fails 4.5:1; designer adjusts it in Figma (a passing value is ≥ ~#8a8f98 for reference). Do not override the token in code |
```

---

## Key Reference

- **Rules file:** `.claude/rules/accessibility.md`
- **Report output:** `.claude/ds-wcag-report.md`
- **Storybook a11y addon:** If configured, provides per-story axe-core panel
- **WCAG 2.1 Quick Reference:** https://www.w3.org/WAI/WCAG21/quickref/
- **ARIA Authoring Practices:** https://www.w3.org/WAI/ARIA/apg/

## Usage

```bash
# Audit all components
/ds-wcag

# Audit a specific component
/ds-wcag Button

# Audit a section
/ds-wcag "Forms"

# Run only the dual-theme contrast audit (fast)
/ds-wcag --themes-only

# Audit a component and run the auto-fix loop
/ds-wcag Button --fix
```

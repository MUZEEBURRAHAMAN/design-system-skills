# Component Versioning & Migration Guide

This guide covers how to version design system components, communicate breaking changes, and provide migration paths for consumers upgrading across major versions.

---

## Versioning Strategy

Design system components follow **semantic versioning** at the package level, with per-component changelog tracking. A breaking change to any component bumps the package major version.

### What Counts as a Breaking Change

| Change | Breaking? | Notes |
|--------|:---------:|-------|
| Removing a prop | ✅ Yes | Always breaking |
| Renaming a prop | ✅ Yes | Treat as remove + add |
| Changing a prop's type | ✅ Yes | e.g., `string` → `enum` |
| Changing default behaviour | ✅ Yes | e.g., button type default changes |
| Removing a variant value | ✅ Yes | e.g., `variant="ghost"` removed |
| Changing HTML element rendered | ✅ Yes | Affects styling and accessibility |
| Adding a **required** prop | ✅ Yes | Breaks all current usages |
| Adding an **optional** prop | ❌ No | Backwards-compatible |
| Renaming a CSS class | ✅ Yes | If consumers rely on class names |
| Changing a token name | ✅ Yes | Consumers applying tokens break |
| Visual/spacing changes | ⚠️ Sometimes | Breaking if consumers rely on pixel dimensions |
| Renaming/removing a **Figma** variant or property | ✅ Yes | Figma is the source of truth, so a Figma-side change to a component's variants/properties is a breaking change for the code that implements it — version and migrate it the same way |
| Accessibility improvements | ❌ No | Safe, but document for QA |
| Performance refactors | ❌ No | Safe if API is unchanged |

---

## Per-Component Changelog

Every component has a `changelog` array in the DS registry. Update it on every release:

```json
{
  "Button": {
    "changelog": [
      {
        "version": "3.0.0",
        "date": "2026-04-01",
        "type": "breaking",
        "description": "Renamed `variant` prop values: `default` → `primary`, `outline` → `ghost`.",
        "migration": "Replace variant=\"default\" with variant=\"primary\". Replace variant=\"outline\" with variant=\"ghost\".",
        "codemod": "codemods/button-v3-variants.ts"
      },
      {
        "version": "2.1.0",
        "date": "2025-11-15",
        "type": "feature",
        "description": "Added `loading` prop with aria-busy support.",
        "migration": null,
        "codemod": null
      },
      {
        "version": "2.0.0",
        "date": "2025-06-01",
        "type": "breaking",
        "description": "Removed `size=\"xs\"`. Use size=\"sm\" instead.",
        "migration": "Replace size=\"xs\" with size=\"sm\".",
        "codemod": "codemods/button-v2-size.ts"
      }
    ]
  }
}
```

**Changelog entry types:** `breaking`, `feature`, `fix`, `deprecation`, `removal`

---

## Codemods

For mechanical breaking changes (prop renames, value renames), provide a codemod in `codemods/`. Codemods use `jscodeshift` or simple regex transforms:

### Example: Button variant rename (v3.0.0)

```ts
// codemods/button-v3-variants.ts
import type { Transform } from 'jscodeshift';

const transform: Transform = (fileInfo, api) => {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // Replace variant="default" → variant="primary"
  root.find(j.JSXAttribute, {
    name: { name: 'variant' },
    value: { value: 'default' }
  }).forEach(path => {
    path.node.value = j.stringLiteral('primary');
  });

  // Replace variant="outline" → variant="ghost"
  root.find(j.JSXAttribute, {
    name: { name: 'variant' },
    value: { value: 'outline' }
  }).forEach(path => {
    path.node.value = j.stringLiteral('ghost');
  });

  return root.toSource();
};

export default transform;
```

**Run the codemod:**

```bash
npx jscodeshift -t codemods/button-v3-variants.ts apps/ src/ --extensions=tsx,ts
```

---

## Deprecation Flow (in Code)

When a prop is deprecated before removal, add a `@deprecated` JSDoc and a runtime warning:

```tsx
interface ButtonProps {
  /** @deprecated Use variant="ghost" instead. Will be removed in v4.0. */
  outline?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
}

function Button({ outline, variant, ...props }: ButtonProps) {
  if (outline && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[DS] Button: `outline` prop is deprecated. Use `variant="ghost"` instead. ' +
      'Will be removed in v4.0.'
    );
  }
  const resolvedVariant = outline ? 'ghost' : variant;
  // ...
}
```

This gives consumers a two-version migration window with visible warnings.

---

## Version Upgrade Guide Format

For each major version, publish a migration guide at `guides/migrations/vN.md`:

```markdown
# Migrating from v2 to v3

## Breaking Changes

### Button

**Prop rename:** `variant` values updated.

Before:
```tsx
<Button variant="default" />
<Button variant="outline" />
```

After:
```tsx
<Button variant="primary" />
<Button variant="ghost" />
```

**Automated migration:**
```bash
npx jscodeshift -t node_modules/@yourorg/ds/codemods/button-v3-variants.ts apps/ --extensions=tsx,ts
```

---

### Input

**Removed:** `legacy` prop removed. Use `variant="filled"` instead.

Before:
```tsx
<Input legacy />
```

After:
```tsx
<Input variant="filled" />
```

No codemod available — manual update required.
```

---

## Registry Integration

The `ds-lifecycle` skill reads `changelog` entries to:

1. Detect when a deprecated prop has been present for more than 2 major versions (trigger for removal)
2. Surface migration paths in the `promote` and `deprecate` commands
3. Generate a "what changed" summary when promoting a component from beta → stable

Keep the `changelog` array in sync with `CHANGELOG.md` at the package level.

---

## Communicating Changes

| Audience | Channel | When |
|----------|---------|------|
| Consuming teams | Slack `#design-system` | Before any major release |
| Individual files | `@deprecated` JSDoc + runtime warning | When prop is deprecated |
| CI pipelines | Lifecycle gate fails on deprecated usage | On every PR |
| Documentation | `guides/migrations/vN.md` | Alongside the release |
| Figma | A note on the component (by a designer) linking the release, or Code Connect status | When stable or deprecated — this records the code release next to the design; it never changes the design |

---

## Checklist Before a Breaking Release

- [ ] All breaking changes documented in `changelog` entries with `type: "breaking"`
- [ ] Codemods provided for mechanical renames/removals
- [ ] `guides/migrations/vN.md` written and reviewed
- [ ] Consuming teams notified (2-week minimum notice for breaking changes)
- [ ] Deprecated props have been live for at least one minor version with runtime warnings
- [ ] ds-lifecycle entry updated (stage: stable, promotedAt recorded)
- [ ] Designers told (Figma owners record the release next to the component themselves)
- [ ] If a Figma variant/property was renamed or removed, that's a breaking change for code too — versioned, codemodded, and migrated like any other

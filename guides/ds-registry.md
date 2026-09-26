# DS Registry

The DS Registry is a single JSON file (`.claude/ds-registry.json`) that combines component metadata, Storybook stories, Figma mappings, and token data into one file every skill can read.

**Figma-first:** the registry is built by enumerating Figma's sections/components *first*, then merging in code. A component that exists in Figma but has no implementation yet still gets a full entry — `presence: { inFigma: true, inCode: false }` — not a footnote. See [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md) Guardrail 6.

**Provenance & freshness:** the generator stamps `_meta.snapshot` (Figma file/version/modified time plus SHA-256 of the mapping and token map it read). `node scripts/check-snapshot.mjs` verifies the registry matches the committed mapping, isn't too old, and — given a live Figma value — isn't older than Figma.

**Time estimate:** 15 minutes to set up generation, then fully automatic.

---

## Why a Registry?

Each skill (`/ds-sync`, `/ds-report`, `/ds-proto`) reads multiple files to build context:

1. **Figma mapping file** (`.claude/ds-story-figma-map.json`) to discover the component set as Figma knows it, including anything not yet built
2. **Barrel export** (`src/main.tsx`) to cross-reference which of those are implemented, and find any code-only component with no Figma section
3. **Each component source file** to extract CVA variants, props, tokens, Radix primitives
4. **Each story file** to find Storybook story names and argTypes
5. **Token map** (`.claude/ds-token-map.json`) to cross-reference CSS tokens with Figma variables
6. **Design system manifest** (`design-system-manifest.json`) for icon inventory

For a design system with 50+ components, this means **~85 file operations** per skill invocation — barrel reads, source file reads, story file globs and reads, JSON loads. Each of these is a tool call with latency overhead.

The registry collapses all of that into **one file read**: ~3,100 lines for a typical DS, loaded in a single `Read` operation.

### Before vs After

| Metric | Without Registry | With Registry |
|--------|-----------------|---------------|
| File reads per skill run | ~85 | 1 |
| Tool calls for context loading | ~15-25 | 1 |
| Time to load DS context | 30-60 seconds | 2-3 seconds |
| Stale data risk | High (reads live files) | Low (regenerated on Storybook start) |

---

## Schema

The registry JSON has five top-level sections:

```json
{
  "_meta": { ... },
  "components": { ... },
  "tokens": { ... },
  "icons": { ... },
  "sections": [ ... ],
  "outliers": { ... }
}
```

### `_meta`

Generation metadata and global identifiers.

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Schema version (`"1.0.0"`) |
| `generatedAt` | `string` | ISO 8601 timestamp |
| `generatedBy` | `string` | Script that generated the file |
| `figmaFile` | `string?` | Figma file key (from mapping file) |
| `tokenStats` | `object?` | `{ primitives: number, semantic: number }` |

### `components`

A flat object keyed by PascalCase component name — the name is stable identity; it comes from whichever side (Figma or code) knows about the component. Each entry:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Component name (matches the key) |
| `partOf` | string (optional) | A code-only export that lives in the source file of a Figma-known component (compound part such as `CardHeader`). Not a design gap; excluded from "built without Figma" counts. |
| `codeIdentity` | `"mapped"` (optional) | Presence in code came from the mapping file's `sourceFile` because the export has a different name from the Figma component (Figma `Toast` ↔ `ToastProvider`). |
| `presence` | `{ inFigma: boolean, inCode: boolean }` | Whether the component actually exists on each side. `{inFigma:true, inCode:false}` is a real component pending implementation. `{inFigma:false, inCode:true}` was built without a Figma source — worth a second look under a Figma-first policy. |
| `section` | `string` | Storybook/Figma section (e.g., `"Actions"`, `"Forms"`) |
| `package` | `string?` | Package name (e.g., `@acme/ds`) — absent when `presence.inCode` is false |
| `sourceFile` | `string?` | Relative path to the component source file — absent when `presence.inCode` is false |
| `variants` | `Record<string, string[]>?` | CVA variant keys and their options (code-derived) |
| `defaultVariants` | `Record<string, string>?` | CVA default variant values |
| `props` | `Record<string, string>?` | Interface props (name to TypeScript type) |
| `tokens` | `string[]?` | Semantic tokens referenced in component source |
| `radixPrimitives` | `string[]?` | Radix UI primitives used (e.g., `["slot", "dialog"]`) |
| `stories` | `object?` | `{ file?, path?, variants, argTypes? }` — `file`/`path` are absent when the stories are only pre-named in the Figma mapping file, not yet implemented |
| `figma` | `object?` | `{ nodeId, type, variantCount?, sectionFrameId? }` |

### `tokens`

Token cross-reference data (only present if a token map file exists).

| Field | Type | Description |
|-------|------|-------------|
| `primitives` | `Record<string, { hex, figmaVarId, figmaName }>` | Primitive colour tokens |
| `semantic` | `Record<string, { figmaVarId, figmaName, darkAlias?, lightAlias? }>` | Semantic tokens with mode aliases |

### `icons`

Icon inventory (only present if a manifest with icons exists).

| Field | Type | Description |
|-------|------|-------------|
| `custom` | `string[]` | Custom icon component names |
| `remix` | `string[]` | Remix Icon component names used |

### `sections`

Sorted array of all section names found across components (e.g., `["Actions", "Data Display", "Forms", "Layout"]`).

### `outliers`

**Not where a not-yet-built component lives** — that's a normal `components` entry with `presence.inCode: false` (see above). `outliers` is only for *permanent, documented* exceptions pulled straight from the mapping file's own `storybookOnly`/`figmaOnly` keys: things that were never meant to have a counterpart on the other side (a hook with no visual form, a documentation-only Figma frame like a color-swatch sheet).

| Field | Type | Description |
|-------|------|-------------|
| `storybookOnly` | `Record<string, { reason: string }>` | Code export name → why it has no Figma counterpart by design |
| `figmaOnly` | `Record<string, { figmaId?: string, reason: string }>` | Figma node name → why it has no code counterpart by design |

---

## Example Entry

A component built on both sides:

```json
{
  "Button": {
    "name": "Button",
    "presence": { "inFigma": true, "inCode": true },
    "package": "@acme/ds",
    "sourceFile": "packages/ds/src/components/button/button.tsx",
    "section": "Actions",
    "variants": {
      "intent": ["primary", "secondary", "positive", "negative"],
      "size": ["small", "medium", "large"]
    },
    "defaultVariants": { "size": "small" },
    "props": {
      "icon": "ReactNode",
      "loading": "boolean",
      "asChild": "boolean"
    },
    "tokens": ["primary-foreground", "surface-background", "blue-bay"],
    "radixPrimitives": ["slot"],
    "stories": {
      "file": "packages/ds/stories/button.stories.tsx",
      "path": "Components/Actions/Button",
      "variants": ["Primary", "Secondary", "Loading", "Disabled"]
    },
    "figma": {
      "nodeId": "5321:90928",
      "type": "COMPONENT_SET",
      "variantCount": 48,
      "sectionFrameId": "5321:90953"
    }
  }
}
```

A component designed in Figma but not yet implemented — a real, actionable entry, not a footnote:

```json
{
  "DatePicker": {
    "name": "DatePicker",
    "presence": { "inFigma": true, "inCode": false },
    "section": "Forms",
    "stories": {
      "variants": ["forms-datepicker--default", "forms-datepicker--range"]
    },
    "figma": {
      "nodeId": "5321:91204",
      "type": "COMPONENT_SET",
      "variantCount": 6,
      "sectionFrameId": "5321:90980"
    }
  }
}
```

---

## Generating the Registry

The registry is generated by a TypeScript script that reads your source files and produces `.claude/ds-registry.json`.

### 1. Install the Script

Copy `scripts/generate-ds-registry.ts` into your project's `scripts/` directory. See [the template script](../scripts/generate-ds-registry.ts) for the full implementation.

### 2. Configure Paths

Edit the constants at the top of the script to match your project structure:

```typescript
// Component source directories
const DS_SRC = join(ROOT, "packages/ds/src");

// Story file directories
const STORIES_DIRS = [
  join(ROOT, "packages/ds/stories"),
];

// Optional data files
const FIGMA_MAP_PATH = join(ROOT, ".claude/ds-story-figma-map.json");
const TOKEN_MAP_PATH = join(ROOT, ".claude/ds-token-map.json");

// Output
const OUTPUT_PATH = join(ROOT, ".claude/ds-registry.json");
```

### 3. Add an npm Script

```json
{
  "scripts": {
    "ds:registry": "npx tsx scripts/generate-ds-registry.ts"
  }
}
```

### 4. Run It

```bash
pnpm ds:registry
```

Output:

```
ds-registry.json generated:
  52 components across 8 sections
  340 tokens mapped
  12 custom icons, 87 remix icons
  Output: .claude/ds-registry.json
```

---

## Auto-Sync with Storybook

The registry should always be fresh when Storybook starts. Add a `prestorybook` hook to your `package.json`:

```json
{
  "scripts": {
    "ds:registry": "npx tsx scripts/generate-ds-registry.ts",
    "prestorybook": "pnpm ds:registry",
    "storybook": "storybook dev -p 6006"
  }
}
```

Now every time you (or any skill) starts Storybook, the registry is regenerated first. This guarantees the data is never stale.

You can also add it to CI if you want to validate the registry is committed and up to date:

```bash
pnpm ds:registry
git diff --exit-code .claude/ds-registry.json || echo "Registry out of date"
```

---

## How Skills Use the Registry

Each skill checks for the registry as its first action in context loading:

```
If `.claude/ds-registry.json` exists:
  Read it as the primary data source (single file read).
  Skip individual file discovery (barrel exports, story globs, Figma map, token map).
Otherwise:
  Fall back to reading individual files.
```

### `/ds-report` (Parity Report)

The registry provides the complete component inventory, story metadata, and Figma mapping in one read. Phase 1 (Collect Inventories) shrinks from ~40 file reads to 1 registry read + 1 Figma API call.

### `/ds-sync` (Figma-to-Code Sync)

Phase 1 loads the token map, component metadata, and Figma node IDs from the registry instead of reading the barrel export, each component source, the mapping file, and the token CSS files separately.

### `/ds-proto` (Prototyper)

Phase 1 loads the full component inventory (names, variants, props, tokens, stories) from the registry. The prototyper gets the same data it would from reading the manifest + barrel + story files, but in a single operation.

---

## What the Script Reads

The generation script reads these source files and merges them:

| Source | What It Extracts |
|--------|-----------------|
| **Figma mapping** (`.claude/ds-story-figma-map.json`) | The base component list (every name in every section), Figma node IDs, types, variant counts, section frame IDs, pre-named stories for not-yet-built components |
| **Barrel export** (`main.tsx`) | Component names and source file paths — merged into the Figma-seeded list, or added new for a code-only component |
| **Component source files** (`.tsx`) | CVA variants, default variants, interface props, Tailwind token references, Radix primitives |
| **Story files** (`.stories.tsx`) | Story title, section, exported story names, argTypes |
| **Token map** (`.claude/ds-token-map.json`) | Primitive and semantic token cross-references |
| **Manifest** (`design-system-manifest.json`) | Icon inventory |

Only the barrel export and component source files are required for the script to run at all (an empty Figma map still lets it build a code-only registry, with every entry showing `presence.inFigma: false`). Every other source is optional; a missing file just omits that data, not the whole entry.

---

## Keeping the Registry in Sync

The registry is a **generated artifact**. To keep it accurate:

1. **Regenerate after adding/removing components** — run `pnpm ds:registry`
2. **Regenerate after modifying CVA variants** — variant changes in source files are only picked up on regeneration
3. **Regenerate after updating the Figma mapping** — new Figma node IDs need to flow into the registry
4. **Commit the registry** — it should be checked into version control so that CI and other developers have it available without running the script
5. **Use the `prestorybook` hook** — this is the easiest way to ensure freshness during development

---

## Troubleshooting

### Registry is empty or missing components

- Check that your barrel export path is correct in the script
- Verify that components use `export const` or `export function` patterns
- Check the console output for the component count

### CVA variants not detected

- The parser uses brace-counting to find the `variants: { ... }` block in CVA calls
- Make sure your `variants:` key is at the top level of the CVA config (not nested inside another function)
- Single-line variant definitions (`key: "value",`) and multi-line definitions are both supported

### Stories not linked to components

- The script matches stories to components by comparing the last segment of the Storybook `title` to the component name
- Example: title `"Components/Actions/Button"` matches component `Button`
- If your naming convention differs, update the matching logic in `parseStoryFiles()`

### Figma data missing

- Verify `.claude/ds-story-figma-map.json` exists and has the correct structure
- A Figma-mapped component does **not** need a matching barrel export — a `presence.inCode: false` entry is expected and correct for anything not yet built. If a component you *have* implemented shows `inCode: false`, check that its code export name matches the Figma map's component name exactly (PascalCase).

### A component I know is in Figma isn't showing up at all

- Confirm it's listed under `sections[sectionName].components`, not under the top-level `figmaOnly` key — `figmaOnly` is only for permanent exceptions (documentation frames, etc.) and intentionally does not produce a `components` entry. A real, not-yet-built component belongs in a section.

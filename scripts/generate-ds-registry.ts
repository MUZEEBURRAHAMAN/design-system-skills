/**
 * Design System Registry Generator (Figma-first)
 *
 * Enumerates components from the Figma mapping file FIRST — every component
 * that exists in a Figma section gets a registry entry even if no code
 * implementation exists yet (`presence.inCode: false`). Code (barrel exports,
 * CVA variants, story metadata) is then read and merged in as a second pass.
 * Figma is the source of truth for what the design system's component set
 * *is*; code is what has been *built* of it so far. See ../SOURCE-OF-TRUTH.md.
 *
 * This script has no live Figma access of its own (it only reads whatever is
 * already in `.claude/ds-story-figma-map.json` / `.claude/ds-token-map.json`).
 * Populating those files with real Figma variant/property/token data is the
 * job of the interactive skills (ds-sync, ds-tokens, ds-spec), which do have
 * `figma_execute` access. This script's job is just to merge what's already
 * there — never to guess or invent Figma-side data.
 *
 * Run:       pnpm ds:registry
 * Auto-sync: called by Storybook's `prestorybook` hook
 *
 * ----- CUSTOMISATION -----
 * Update the constants below to match your project structure.
 * Search for "CUSTOMISE:" to find all configurable sections.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// CUSTOMISE: Configuration
// ---------------------------------------------------------------------------

export interface PackageSource {
  /** Absolute path to the package's src directory */
  srcDir: string;
  /** Name of the barrel export file (e.g., "main.tsx", "index.ts") */
  barrelFile: string;
  /** npm package name (used in registry output) */
  packageName: string;
  /** Priority: higher-priority packages win when both export the same name */
  priority: number;
}

export interface RegistryConfig {
  root: string;
  packageSources: PackageSource[];
  storiesDirs: string[];
  figmaMapPath: string;
  tokenMapPath: string;
  manifestPath: string;
  outputPath: string;
  /** Injectable clock so tests are deterministic. */
  now?: () => Date;
}

/**
 * CUSTOMISE: the defaults below match a `packages/ds` monorepo layout.
 * Tests build their own RegistryConfig pointing at fixture directories.
 */
export function defaultConfig(root: string = ROOT): RegistryConfig {
  return {
    root,
    // CUSTOMISE: component library source directories (each needs a barrel export).
    packageSources: [
      {
        srcDir: join(root, "packages/ds/src"),
        barrelFile: "main.tsx",
        packageName: "@acme/ds",
        priority: 1,
      },
      // CUSTOMISE: add more packages if your DS spans several:
      // { srcDir: join(root, "packages/form/src"), barrelFile: "main.tsx", packageName: "@acme/form", priority: 0 },
    ],
    // CUSTOMISE: directories containing *.stories.tsx files.
    storiesDirs: [join(root, "packages/ds/stories")],
    // The Figma mapping file is the base component list (Figma-first).
    figmaMapPath: join(root, ".claude/ds-story-figma-map.json"),
    tokenMapPath: join(root, ".claude/ds-token-map.json"),
    manifestPath: join(root, "design-system-manifest.json"),
    outputPath: join(root, ".claude/ds-registry.json"),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/**
 * Extract CVA variant keys from a component source file via brace-counting.
 * Returns { variantName: string[] } — e.g. { intent: ["primary","secondary"], size: ["sm","md"] }
 */
function extractCvaVariants(
  source: string,
): Record<string, string[]> | undefined {
  // Find the start of the variants block
  const variantsIdx = source.indexOf("variants:");
  if (variantsIdx === -1) return undefined;
  const openBrace = source.indexOf("{", variantsIdx + 9);
  if (openBrace === -1) return undefined;

  // Brace-count to find the matching closing brace of the entire variants block
  let depth = 1;
  let i = openBrace + 1;
  let inString = false;
  let stringChar = "";
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (inString) {
      if (ch === stringChar && source[i - 1] !== "\\") inString = false;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    if (depth > 0) i++;
  }
  if (depth !== 0) return undefined;
  const variantsBlock = source.slice(openBrace + 1, i);

  const result: Record<string, string[]> = {};

  // Match each variant group using brace counting
  const groupStartRe = /(\w+)\s*:\s*\{/g;
  let groupMatch = groupStartRe.exec(variantsBlock);
  while (groupMatch) {
    const variantName = groupMatch[1];
    const bodyStart = groupMatch.index + groupMatch[0].length;

    // Find matching closing brace for this group
    let gDepth = 1;
    let gi = bodyStart;
    let gInString = false;
    let gStringChar = "";
    while (gi < variantsBlock.length && gDepth > 0) {
      const ch = variantsBlock[gi];
      if (gInString) {
        if (ch === gStringChar && variantsBlock[gi - 1] !== "\\")
          gInString = false;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        gInString = true;
        gStringChar = ch;
      } else if (ch === "{") {
        gDepth++;
      } else if (ch === "}") {
        gDepth--;
      }
      if (gDepth > 0) gi++;
    }

    const variantBody = variantsBlock.slice(bodyStart, gi);
    const keys: string[] = [];

    // Line-based extraction: match keys at the start of lines (after whitespace).
    // This avoids matching Tailwind pseudo-classes like hover: inside string values.
    for (const line of variantBody.split("\n")) {
      // Multi-line: key on own line, value on next
      const lineMatch = line.match(
        /^\s+(?:"([^"]+)"|'([^']+)'|(\w[\w-]*))\s*:\s*$/,
      );
      if (lineMatch) {
        keys.push(lineMatch[1] || lineMatch[2] || lineMatch[3]);
        continue;
      }
      // Single-line: key: "value",
      const singleLineMatch = line.match(
        /^\s+(?:"([^"]+)"|'([^']+)'|(\w[\w-]*))\s*:\s*(?:"|'|`)/,
      );
      if (singleLineMatch) {
        keys.push(
          singleLineMatch[1] || singleLineMatch[2] || singleLineMatch[3],
        );
      }
    }

    if (keys.length > 0) {
      result[variantName] = keys;
    }
    groupMatch = groupStartRe.exec(variantsBlock);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Extract CVA default variants from source.
 */
function extractCvaDefaults(
  source: string,
): Record<string, string> | undefined {
  const match = source.match(/defaultVariants\s*:\s*\{([\s\S]*?)\}/);
  if (!match) return undefined;
  const body = match[1];
  const result: Record<string, string> = {};
  const re = /(?:"([^"]+)"|'([^']+)'|(\w+))\s*:\s*(?:"([^"]+)"|'([^']+)')/g;
  let m = re.exec(body);
  while (m) {
    const key = m[1] || m[2] || m[3];
    const val = m[4] || m[5];
    result[key] = val;
    m = re.exec(body);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Extract exported interface props (simple heuristic — grabs named fields).
 * Skips VariantProps extends, className, children, and ref.
 */
function extractInterfaceProps(
  source: string,
): Record<string, string> | undefined {
  const ifaceMatch = source.match(
    /export\s+interface\s+\w+Props[\s\S]*?\{([\s\S]*?)\}/,
  );
  if (!ifaceMatch) return undefined;
  const body = ifaceMatch[1];
  const result: Record<string, string> = {};
  const propRe = /(\w+)\??\s*:\s*([^;\n]+)/g;
  let m = propRe.exec(body);
  while (m) {
    const name = m[1];
    const type = m[2].trim();
    if (
      !type.includes("VariantProps") &&
      name !== "className" &&
      name !== "children" &&
      name !== "ref"
    ) {
      result[name] = type;
    }
    m = propRe.exec(body);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Extract tokens referenced in Tailwind classes from a source string.
 * Matches patterns like bg-surface-background, text-primary-foreground, etc.
 */
function extractReferencedTokens(source: string): string[] {
  const semanticTokens = new Set<string>();
  const tokenPatterns = [
    /(?:bg|text|border|ring|fill|stroke|shadow|outline|from|via|to)-([a-z][a-z0-9-]+(?:\/[a-z0-9-]+)*)/g,
    /ring-offset-([a-z][a-z0-9-]+(?:\/[a-z0-9-]+)*)/g,
  ];
  for (const re of tokenPatterns) {
    let m = re.exec(source);
    while (m) {
      const token = m[1];
      // CUSTOMISE: Adjust this filter to match your token naming convention.
      // This filters to semantic tokens (hyphenated names, not raw Tailwind
      // utilities like 'white', 'xs', or numeric values).
      if (
        token.includes("-") &&
        !token.match(/^\d/) &&
        !["no-repeat", "center", "full"].includes(token)
      ) {
        semanticTokens.add(token);
      }
      m = re.exec(source);
    }
  }
  return [...semanticTokens].sort();
}

/**
 * Detect Radix UI primitives used in a source file.
 */
function extractRadixPrimitives(source: string): string[] {
  const radixRe = /@radix-ui\/react-(\w+)/g;
  const prims = new Set<string>();
  let m = radixRe.exec(source);
  while (m) {
    prims.add(m[1]);
    m = radixRe.exec(source);
  }
  return [...prims].sort();
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface StoryMeta {
  file: string;
  title: string;
  section: string;
  component: string;
  stories: string[];
  argTypes: Record<string, { options?: string[] }>;
}

interface FigmaComponentEntry {
  figmaId: string;
  figmaType: string;
  variantCount?: number;
  stories?: string[];
  sourceFile?: string;
}

interface FigmaSection {
  sectionFrameId: string;
  verifyLight?: string;
  verifyDark?: string;
  components: Record<string, FigmaComponentEntry>;
}

interface FigmaMap {
  _meta: {
    figmaFile: string;
    storybookBase: string;
    semanticCollection: string;
    lightMode: string;
    darkMode: string;
    /** Figma file version/last-modified at the time the mapping was refreshed from live Figma. Used by check-snapshot.mjs. */
    figmaVersion?: string;
    figmaModifiedAt?: string;
  };
  sections: Record<string, FigmaSection>;
  /** Code exports with no visual Figma counterpart by design (hooks, utilities) — a permanent, documented exception, not a gap to fill. */
  storybookOnly: Record<string, { reason: string }>;
  /** Figma nodes with no code counterpart by design (documentation frames, color swatches) — a permanent, documented exception. A real component pending implementation belongs in `sections[x].components`, not here — see `presence.inCode` on the registry entry it produces. */
  figmaOnly: Record<string, { figmaId?: string; reason: string }>;
  keyVariableIds: Record<string, string>;
}

interface TokenMapEntry {
  cssRgb?: string;
  figmaHex: string;
  figmaVarId: string;
  figmaVarName: string;
  darkAlias?: string;
  lightAlias?: string;
  darkHex?: string;
  lightHex?: string;
}

interface TokenMap {
  primitives: Record<string, TokenMapEntry>;
  semantic: Record<string, TokenMapEntry>;
  stats: { totalPrimitivesMapped: number; totalSemanticMapped: number };
}

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

interface RegistryComponent {
  name: string;
  section: string;
  /**
   * Whether this component actually exists on each side. `inFigma: true,
   * inCode: false` is a real component proposed in Figma with no
   * implementation yet — a first-class entry, not a footnote. See Guardrail 6
   * in ../SOURCE-OF-TRUTH.md.
   */
  presence: { inFigma: boolean; inCode: boolean };
  package?: string;
  sourceFile?: string;
  /** Set on a code-only export that lives in the source file of a Figma-known component (a compound part). */
  partOf?: string;
  /** "mapped": presence comes from the mapping file's sourceFile, not from an export with the same name */
  codeIdentity?: "mapped";
  variants?: Record<string, string[]>;
  defaultVariants?: Record<string, string>;
  props?: Record<string, string>;
  tokens?: string[];
  radixPrimitives?: string[];
  /** Storybook story IDs — from the mapping file when `presence.inCode` is false (a designer may have pre-listed intended story names), from the parsed story file otherwise. */
  stories?: {
    file?: string;
    path?: string;
    variants: string[];
    argTypes?: Record<string, { options?: string[] }>;
  };
  figma?: {
    nodeId: string;
    type: string;
    variantCount?: number;
    sectionFrameId?: string;
  };
}

interface Registry {
  _meta: {
    version: string;
    generatedAt: string;
    generatedBy: string;
    figmaFile?: string;
    /**
     * Provenance of the Figma-derived data this registry was built from.
     * `scripts/check-snapshot.mjs` uses it to prove the snapshot is fresh.
     */
    snapshot?: {
      source: "figma-mapping";
      figmaFile?: string;
      figmaVersion?: string;
      figmaModifiedAt?: string;
      figmaMapSha256: string;
      tokenMapSha256?: string;
    };
    tokenStats?: {
      primitives: number;
      semantic: number;
    };
  };
  components: Record<string, RegistryComponent>;
  tokens?: {
    primitives: Record<
      string,
      { hex: string; figmaVarId: string; figmaName: string }
    >;
    semantic: Record<
      string,
      {
        figmaVarId: string;
        figmaName: string;
        darkAlias?: string;
        lightAlias?: string;
      }
    >;
  };
  icons?: {
    custom: string[];
    remix: string[];
  };
  sections: string[];
  /**
   * Permanent, documented exceptions only (a hook with no visual form, a
   * documentation-only Figma frame) — NOT where a real not-yet-built
   * component lives. Those are first-class entries in `components` with
   * `presence.inCode: false`. See SOURCE-OF-TRUTH.md Guardrail 6.
   */
  outliers?: {
    storybookOnly: Record<string, { reason: string }>;
    figmaOnly: Record<string, { figmaId?: string; reason: string }>;
  };
}

// ---------------------------------------------------------------------------
// 1. Parse barrel exports -> component source paths
// ---------------------------------------------------------------------------

/**
 * Follow a barrel export to the files that actually define components.
 * Handles `export * from "./X"` and named re-exports (`export { A, B } from "./X"`),
 * and keeps following them through directory index files (`./Button` ->
 * `Button/index.ts` -> `Button/Button.tsx`) — the common "one folder per
 * component, each with an index.ts" layout. `export type { ... } from` is
 * ignored (types aren't components).
 */
function parseBarrelExports(
  mainPath: string,
  seen: Set<string> = new Set(),
): Array<{ exportPath: string; resolvedPath: string }> {
  if (!existsSync(mainPath) || seen.has(mainPath)) return [];
  seen.add(mainPath);
  const source = readFileSync(mainPath, "utf-8");
  const results: Array<{ exportPath: string; resolvedPath: string }> = [];
  const re = /export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
  let m = re.exec(source);
  while (m) {
    const relPath = m[1];
    const base = dirname(mainPath);
    // Try .tsx, .ts, /index.tsx, /index.ts
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      const full = resolve(base, `${relPath}${ext}`);
      if (existsSync(full)) {
        if (!results.some((r) => r.resolvedPath === full)) {
          results.push({ exportPath: relPath, resolvedPath: full });
        }
        // The target may itself be a barrel: follow its re-exports too.
        for (const inner of parseBarrelExports(full, seen)) {
          if (!results.some((r) => r.resolvedPath === inner.resolvedPath)) results.push(inner);
        }
        break;
      }
    }
    m = re.exec(source);
  }
  return results;
}

// ---------------------------------------------------------------------------
// 2. Parse story files
// ---------------------------------------------------------------------------

function parseStoryFiles(config: RegistryConfig): StoryMeta[] {
  const stories: StoryMeta[] = [];
  for (const dir of config.storiesDirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".stories.tsx"));
    for (const file of files) {
      const fullPath = join(dir, file);
      const source = readFileSync(fullPath, "utf-8");

      // Extract title from meta
      const titleMatch = source.match(/title:\s*["']([^"']+)["']/);
      if (!titleMatch) continue;
      const title = titleMatch[1];

      // CUSTOMISE: Adjust section extraction to match your Storybook title convention.
      // Default assumes titles like "Components/Actions/Button" where the middle
      // segments are the section and the last segment is the component name.
      const parts = title.split("/");
      const component = parts[parts.length - 1];
      const section =
        parts.length >= 3 ? parts.slice(1, -1).join(" / ") : parts[0];

      // Extract story export names
      const storyExports: string[] = [];
      const exportRe =
        /export\s+const\s+(\w+)\s*(?::\s*StoryObj|=\s*\{|:\s*Story\b)/g;
      let em = exportRe.exec(source);
      while (em) {
        storyExports.push(em[1]);
        em = exportRe.exec(source);
      }

      // Extract argTypes options
      const argTypes: Record<string, { options?: string[] }> = {};
      const argTypesMatch = source.match(
        /argTypes\s*:\s*\{([\s\S]*?)\}\s*,?\s*(?:\}|tags)/,
      );
      if (argTypesMatch) {
        const argBody = argTypesMatch[1];
        const argRe = /(\w+)\s*:\s*\{([^}]*)\}/g;
        let am = argRe.exec(argBody);
        while (am) {
          const argName = am[1];
          const argInner = am[2];
          const optionsMatch = argInner.match(/options\s*:\s*\[([\s\S]*?)\]/);
          if (optionsMatch) {
            const opts = optionsMatch[1]
              .match(/["']([^"']+)["']/g)
              ?.map((s) => s.replace(/["']/g, ""));
            argTypes[argName] = { options: opts || [] };
          } else {
            argTypes[argName] = {};
          }
          am = argRe.exec(argBody);
        }
      }

      const relPath = fullPath.replace(`${config.root}/`, "");
      stories.push({
        file: relPath,
        title,
        section,
        component,
        stories: storyExports,
        argTypes,
      });
    }
  }
  return stories;
}

// ---------------------------------------------------------------------------
// 3. Build registry
// ---------------------------------------------------------------------------

export function buildRegistry(config: RegistryConfig = defaultConfig()): Registry {
  // Load optional data files
  const figmaMap = readJson<FigmaMap>(config.figmaMapPath);
  const tokenMap = readJson<TokenMap>(config.tokenMapPath);

  // Parse barrel exports from all configured packages (sorted by priority, highest first)
  const sortedPackages = [...config.packageSources].sort(
    (a, b) => b.priority - a.priority,
  );
  const allExports: Array<{
    resolvedPath: string;
    packageName: string;
    priority: number;
  }> = [];

  for (const pkg of sortedPackages) {
    const exports = parseBarrelExports(join(pkg.srcDir, pkg.barrelFile));
    for (const exp of exports) {
      allExports.push({
        resolvedPath: exp.resolvedPath,
        packageName: pkg.packageName,
        priority: pkg.priority,
      });
    }
  }

  // Parse story files
  const storyMetas = parseStoryFiles(config);

  // Build lookups: component name -> story meta
  const storyByComponent = new Map<string, StoryMeta>();
  for (const sm of storyMetas) {
    storyByComponent.set(sm.component, sm);
    const pascal = sm.component.replace(/\s+/g, "");
    if (pascal !== sm.component) storyByComponent.set(pascal, sm);
  }

  // Build lookup: component name -> Figma entry
  const figmaByComponent = new Map<
    string,
    { entry: FigmaComponentEntry; section: string; sectionFrameId: string }
  >();
  if (figmaMap) {
    for (const [sectionName, section] of Object.entries(figmaMap.sections)) {
      for (const [compName, entry] of Object.entries(section.components)) {
        figmaByComponent.set(compName, {
          entry,
          section: sectionName,
          sectionFrameId: section.sectionFrameId,
        });
      }
    }
  }

  const components: Record<string, RegistryComponent> = {};
  const allSections = new Set<string>();

  // ---------------------------------------------------------------------
  // PASS 1 — seed from Figma. Every component Figma already knows about
  // gets a registry entry now, whether or not code exists for it yet.
  // This is the Figma-first fix: previously, a component sitting in
  // figmaMap.sections[x].components with no matching barrel export was
  // silently invisible in the registry. Now it's a real entry with
  // `presence: { inFigma: true, inCode: false }`.
  // ---------------------------------------------------------------------
  for (const [name, figma] of figmaByComponent) {
    allSections.add(figma.section);
    const entry: RegistryComponent = {
      name,
      section: figma.section,
      presence: { inFigma: true, inCode: false },
      figma: {
        nodeId: figma.entry.figmaId,
        type: figma.entry.figmaType,
      },
    };
    if (figma.entry.variantCount)
      entry.figma!.variantCount = figma.entry.variantCount;
    entry.figma!.sectionFrameId = figma.sectionFrameId;
    // The mapping file may list intended story IDs before any code exists
    // (a designer or PM pre-naming the stories a future implementation
    // should produce). Surface them so the gap is actionable, not just known.
    if (figma.entry.stories && figma.entry.stories.length > 0) {
      entry.stories = { variants: figma.entry.stories };
    }
    components[name] = entry;
  }

  // ---------------------------------------------------------------------
  // PASS 2 — merge in code. Fills in implementation details for entries
  // Pass 1 already created, and adds any code-only component Figma has no
  // section entry for yet (presence.inFigma: false — a real, separate
  // signal worth surfacing: this was built without a Figma source).
  // ---------------------------------------------------------------------
  const codeClaimedNames = new Set<string>();

  for (const { resolvedPath, packageName, priority } of allExports) {
    const source = readFileSync(resolvedPath, "utf-8");
    const relPath = resolvedPath.replace(`${config.root}/`, "");

    // Find exported component names (forwardRef pattern or plain export)
    const exportedNames: string[] = [];
    const frRe =
      /export\s+const\s+(\w+)\s*=\s*(?:forwardRef|memo|React\.forwardRef)/g;
    let frm = frRe.exec(source);
    while (frm) {
      exportedNames.push(frm[1]);
      frm = frRe.exec(source);
    }
    // Also plain function/const exports
    const fnRe = /export\s+(?:function|const)\s+(\w+)/g;
    let fnm = fnRe.exec(source);
    while (fnm) {
      const name = fnm[1];
      if (
        !exportedNames.includes(name) &&
        name[0] === name[0].toUpperCase() &&
        !name.endsWith("Props") &&
        !name.endsWith("Variants") &&
        !name.startsWith("use")
      ) {
        exportedNames.push(name);
      }
      fnm = fnRe.exec(source);
    }

    // Aliased re-exports declared in the component file itself, e.g.
    // `export { Drawer as Sheet, DrawerClose as SheetClose } from '../Drawer'` — the alias is the public name.
    const aliasRe = /export\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
    let am = aliasRe.exec(source);
    while (am) {
      for (const part of am[1].split(",")) {
        if (!/\sas\s/.test(part)) continue; // plain re-exports are barrel plumbing, not declarations
        const alias = part.trim().split(/\s+as\s+/).pop()!.trim();
        if (/^[A-Z]\w*$/.test(alias) && !alias.endsWith("Props") && !alias.endsWith("Variants") && !exportedNames.includes(alias)) exportedNames.push(alias);
      }
      am = aliasRe.exec(source);
    }

    if (exportedNames.length === 0) continue;

    const cvaVariants = extractCvaVariants(source);
    const cvaDefaults = extractCvaDefaults(source);
    const interfaceProps = extractInterfaceProps(source);
    const tokens = extractReferencedTokens(source);
    const radix = extractRadixPrimitives(source);

    for (const name of exportedNames) {
      // CUSTOMISE: Skip patterns for your project. These skip icon components
      // and Remix Icon re-exports by default. Adjust or remove as needed.
      if (name !== "Icon" && name.endsWith("Icon") && !name.includes("Button")) continue;
      if (name.startsWith("Ri")) continue;

      // Higher-priority packages win: skip if a higher-priority package
      // already claimed this name (independent of the Figma seed pass).
      if (codeClaimedNames.has(name)) continue;
      codeClaimedNames.add(name);

      // Find matching story
      const storyMeta =
        storyByComponent.get(name) ||
        storyByComponent.get(name.replace(/([A-Z])/g, " $1").trim());

      const figma = figmaByComponent.get(name);
      const existing = components[name]; // set in Pass 1 if Figma knows this component

      const section =
        existing?.section ||
        figma?.section ||
        storyMeta?.section ||
        "Uncategorized";
      allSections.add(section);

      const entry: RegistryComponent = existing ?? {
        name,
        section,
        presence: { inFigma: false, inCode: false },
      };
      entry.presence.inCode = true;
      entry.package = packageName;
      entry.sourceFile = relPath;

      if (cvaVariants) entry.variants = cvaVariants;
      if (cvaDefaults) entry.defaultVariants = cvaDefaults;
      if (interfaceProps) entry.props = interfaceProps;
      if (tokens.length > 0) entry.tokens = tokens;
      if (radix.length > 0) entry.radixPrimitives = radix;

      if (storyMeta) {
        // Code-derived story data is more precise than the mapping file's
        // pre-listed names (Pass 1) — replace, don't just fall back to it.
        entry.stories = {
          file: storyMeta.file,
          path: storyMeta.title,
          variants: storyMeta.stories,
        };
        if (Object.keys(storyMeta.argTypes).length > 0) {
          entry.stories.argTypes = storyMeta.argTypes;
        }
      }

      components[name] = entry;
    }
  }

  // ---------------------------------------------------------------------
  // PASS 2b — a mapping entry that names its own `sourceFile` is the project
  // stating "this Figma component is implemented here", even when the code
  // exports it under another name (e.g. Figma "Toast" -> ToastProvider/useToast,
  // Figma "File" -> FileItem). Honour it instead of reporting a built
  // component as Figma-only. Only when the file really exists.
  // ---------------------------------------------------------------------
  for (const [name, figma] of figmaByComponent) {
    const entry = components[name];
    const declared = figma.entry.sourceFile;
    if (!entry || entry.presence.inCode || !declared) continue;
    if (!existsSync(join(config.root, declared))) continue;
    entry.presence.inCode = true;
    entry.sourceFile = declared;
    entry.codeIdentity = "mapped";
  }

  // ---------------------------------------------------------------------
  // PASS 2c — compound parts. A code-only export that lives in the same source
  // file as a component Figma does know (CardHeader in Card.tsx, DialogTitle in
  // Dialog.tsx) is a part of that Figma component, not a component built without
  // a design. Tag it `partOf` so reports don't list it as "no Figma source".
  // ---------------------------------------------------------------------
  const ownerBySource = new Map<string, string>();
  for (const c of Object.values(components)) {
    if (c.presence.inFigma && c.presence.inCode && c.sourceFile && !ownerBySource.has(c.sourceFile)) ownerBySource.set(c.sourceFile, c.name);
  }
  for (const c of Object.values(components)) {
    if (c.presence.inFigma || !c.presence.inCode || !c.sourceFile) continue;
    const owner = ownerBySource.get(c.sourceFile);
    if (owner && owner !== c.name) c.partOf = owner;
  }

  // Build tokens section (compact form)
  let tokens: Registry["tokens"];
  if (tokenMap) {
    const primitives: Record<
      string,
      { hex: string; figmaVarId: string; figmaName: string }
    > = {};
    for (const [cssVar, entry] of Object.entries(tokenMap.primitives)) {
      primitives[cssVar] = {
        hex: entry.figmaHex,
        figmaVarId: entry.figmaVarId,
        figmaName: entry.figmaVarName,
      };
    }

    const semantic: Record<
      string,
      {
        figmaVarId: string;
        figmaName: string;
        darkAlias?: string;
        lightAlias?: string;
      }
    > = {};
    for (const [cssVar, entry] of Object.entries(tokenMap.semantic)) {
      const s: (typeof semantic)[string] = {
        figmaVarId: entry.figmaVarId,
        figmaName: entry.figmaVarName,
      };
      if (entry.darkAlias) s.darkAlias = entry.darkAlias;
      if (entry.lightAlias) s.lightAlias = entry.lightAlias;
      semantic[cssVar] = s;
    }

    tokens = { primitives, semantic };
  }

  // Load existing manifest for icons (optional)
  const manifest = readJson<{ icons?: { custom: string[]; remix: string[] } }>(
    config.manifestPath,
  );

  // Assemble the registry
  const registry: Registry = {
    _meta: {
      version: "1.0.0",
      generatedAt: (config.now?.() ?? new Date()).toISOString(),
      generatedBy: "scripts/generate-ds-registry.ts",
    },
    components,
    sections: [...allSections].sort(),
  };

  if (figmaMap?._meta?.figmaFile) {
    registry._meta.figmaFile = figmaMap._meta.figmaFile;
  }

  const figmaMapSha256 = sha256(config.figmaMapPath);
  if (figmaMapSha256) {
    registry._meta.snapshot = {
      source: "figma-mapping",
      figmaFile: figmaMap?._meta?.figmaFile,
      figmaVersion: figmaMap?._meta?.figmaVersion,
      figmaModifiedAt: figmaMap?._meta?.figmaModifiedAt,
      figmaMapSha256,
      tokenMapSha256: sha256(config.tokenMapPath),
    };
  }

  if (tokenMap?.stats) {
    registry._meta.tokenStats = {
      primitives: tokenMap.stats.totalPrimitivesMapped,
      semantic: tokenMap.stats.totalSemanticMapped,
    };
  }

  if (tokens) registry.tokens = tokens;
  if (manifest?.icons) registry.icons = manifest.icons;

  if (figmaMap) {
    registry.outliers = {
      storybookOnly: Object.fromEntries(
        Object.entries(figmaMap.storybookOnly || {}).filter(
          ([k]) => k !== "_comment",
        ),
      ),
      figmaOnly: Object.fromEntries(
        Object.entries(figmaMap.figmaOnly || {}).filter(
          ([k]) => k !== "_comment",
        ),
      ),
    };
  }

  return registry;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function writeRegistry(config: RegistryConfig = defaultConfig()): Registry {
  const registry = buildRegistry(config);
  writeFileSync(config.outputPath, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

function main(): void {
  const config = defaultConfig();
  const registry = writeRegistry(config);

  const allComponents = Object.values(registry.components);
  const componentCount = allComponents.length;
  const sectionCount = registry.sections.length;
  const tokenCount =
    (registry._meta.tokenStats?.primitives ?? 0) +
    (registry._meta.tokenStats?.semantic ?? 0);
  const notYetBuilt = allComponents.filter(
    (c) => c.presence.inFigma && !c.presence.inCode,
  );
  const builtWithoutFigma = allComponents.filter(
    (c) => c.presence.inCode && !c.presence.inFigma && !c.partOf,
  );

  console.log(`ds-registry.json generated:`);
  console.log(`  ${componentCount} components across ${sectionCount} sections`);
  console.log(`  ${tokenCount} tokens mapped`);
  console.log(
    `  ${registry.icons?.custom.length ?? 0} custom icons, ${registry.icons?.remix.length ?? 0} remix icons`,
  );
  if (notYetBuilt.length > 0) {
    console.log(
      `  ${notYetBuilt.length} in Figma, not yet built: ${notYetBuilt.map((c) => c.name).join(", ")}`,
    );
}
if (builtWithoutFigma.length > 0) {
  console.log(
    `  ${builtWithoutFigma.length} built without a Figma source: ${builtWithoutFigma.map((c) => c.name).join(", ")}`,
  );
}
console.log(`  Output: ${config.outputPath.replace(`${config.root}/`, "")}`);
}

// Only run when executed directly (`tsx scripts/generate-ds-registry.ts`), not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === __filename) main();

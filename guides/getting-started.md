# Getting Started

Set up Claude Code skills for design system workflows. By the end you'll have a Figma-first workflow: Figma defines the design system, and these skills audit — and propose fixes to — your Storybook/code implementation against it. Read [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md) first; it's the one policy every skill follows.

**Time estimate:** 1–2 hours (mostly Figma MCP setup and mapping file creation)

---

## Prerequisites

You need:

- **A component library** with [Storybook](https://storybook.js.org/) stories
- **A Figma file** with your design system's Variables, Styles, and Components — this is the source of truth (it can be ahead of your code; components not built yet are welcome)
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** installed (`npm install -g @anthropic-ai/claude-code`)
- **[Figma Desktop](https://www.figma.com/downloads/)** (not the browser version — the Desktop Bridge plugin requires it)
- **Node.js** 18+ and a package manager (npm, pnpm, or yarn)

---

## Step 1: Set Up Figma Console MCP

The Figma Console MCP server gives Claude access to your Figma file: reading nodes, variables, and styles. The skills in this toolkit only read from Figma; they never write to it.

### 1.1 Install the MCP Server

```bash
# Using Claude Code's MCP management
claude mcp add figma-console npx -- figma-console-mcp
```

Or add it manually to your Claude Code MCP config (`.claude/mcp.json` or global settings):

```json
{
  "mcpServers": {
    "figma-console": {
      "command": "npx",
      "args": ["figma-console-mcp"]
    }
  }
}
```

### 1.2 Install the Desktop Bridge Plugin

The MCP server communicates with Figma Desktop via a WebSocket bridge plugin:

1. In Figma Desktop, go to **Menu → Plugins → Development → Import plugin from manifest**
2. Or search for **"Figma Desktop Bridge"** in the Figma Community
3. Run the plugin: **Right-click → Plugins → Development → Figma Desktop Bridge**
4. Keep the plugin running while using any Figma skills

### 1.3 Verify the Connection

In Claude Code, verify the MCP is connected:

```
> Check if the Figma Console MCP is connected. List available tools.
```

You should see tools like `figma_execute`, `figma_get_variables`, `figma_capture_screenshot`, etc.

### 1.4 Generate a Figma Personal Access Token (Optional)

Some MCP features (like the REST API for screenshots) require a Figma Personal Access Token:

1. Go to **Figma → Settings → Account → Personal access tokens**
2. Create a token with **read/write** access
3. Set it as an environment variable: `export FIGMA_ACCESS_TOKEN=your-token-here`

---

## Step 2: Set Up Storybook

If you already have Storybook running, skip to Step 3.

### 2.1 Install Storybook

```bash
npx storybook@latest init
```

### 2.2 Add Recommended Addons

These addons are used by the skills:

```bash
# Accessibility testing (used by /ds-wcag)
npm install --save-dev @storybook/addon-a11y

# Theme switching (used by /ds-sync for light/dark comparison)
npm install --save-dev @storybook/addon-themes
```

### 2.3 Configure Theme Switching

In `.storybook/preview.ts`, set up light/dark theme globals:

```typescript
import type { Preview } from "@storybook/react";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Theme for components",
      toolbar: {
        title: "Theme",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || "light";
      document.documentElement.className = theme;
      return <Story />;
    },
  ],
};

export default preview;
```

### 2.4 Create a Launch Config

Create `.claude/launch.json` so Claude Code can start Storybook automatically:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "storybook",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["storybook", "dev", "-p", "6006"],
      "port": 6006
    }
  ]
}
```

---

## Step 3: Create the Mapping File

The mapping file (`.claude/ds-story-figma-map.json`) is the key artifact — it connects every Storybook story to its Figma counterpart. See the [Mapping File Guide](mapping-file.md) for detailed instructions.

### Quick Start

1. Copy the template:
   ```bash
   cp templates/ds-story-figma-map.example.json .claude/ds-story-figma-map.json
   ```

2. Fill in your Figma file key (from the URL: `figma.com/design/<FILE_KEY>/...`)

3. Add your first component mapping:
   ```json
   {
     "_meta": {
       "figmaFile": "YOUR_FIGMA_FILE_KEY",
       "storybookBase": "http://localhost:6006/iframe.html?id={storyId}&viewMode=story&globals=theme:{theme}"
     },
     "sections": {
       "Actions": {
         "sectionFrameId": "FIGMA_SECTION_NODE_ID",
         "components": {
           "Button": {
             "figmaId": "FIGMA_COMPONENT_NODE_ID",
             "figmaType": "COMPONENT_SET",
             "stories": [
               "components-actions-button--primary",
               "components-actions-button--secondary"
             ],
             "sourceFile": "src/components/button/button.tsx"
           }
         }
       }
     }
   }
   ```

4. To find Figma node IDs: right-click any element in Figma → **Copy/Paste as → Copy link** → the node ID is in the URL after `node-id=` (replace `-` with `:`)

### Auto-Generate the Mapping

You can also ask Claude to help build the mapping:

```
> Read my Storybook index at localhost:6006 and my Figma file structure.
> Generate a ds-story-figma-map.json mapping each story to its Figma component.
```

---

## Step 4: Generate the DS Registry (Recommended)

The DS Registry (`.claude/ds-registry.json`) unifies all component metadata, Storybook stories, Figma mappings, and token data into a single AI-readable file. Instead of skills reading 15+ files on every run, they read one file. See the [DS Registry Guide](ds-registry.md) for full details.

### Quick Setup

1. Copy the generation script into your project:
   ```bash
   cp design-system-skills/scripts/generate-ds-registry.ts your-project/scripts/
   ```

2. Edit the constants at the top of the script to match your project paths (barrel export location, story directories, package names).

3. Add npm scripts to your `package.json`:
   ```json
   {
     "scripts": {
       "ds:registry": "npx tsx scripts/generate-ds-registry.ts",
       "prestorybook": "pnpm ds:registry",
       "storybook": "storybook dev -p 6006"
     }
   }
   ```

4. Generate the registry:
   ```bash
   pnpm ds:registry
   ```

The `prestorybook` hook ensures the registry is regenerated every time Storybook starts, so the data is always fresh. All skills automatically detect and use the registry when it exists, falling back to individual file reads when it does not.

---

## Step 5: Create a Component Manifest (Optional)

The `design-system-manifest.json` file provides component metadata (props, argTypes, variants) for richer audits:

```json
[
  {
    "file": "src/stories/button.stories.tsx",
    "title": "Components/Actions/Button",
    "section": "Actions",
    "component": "Button",
    "stories": ["Primary", "Secondary", "Loading", "Disabled"],
    "argTypes": {
      "intent": { "options": ["primary", "secondary", "positive", "negative"] },
      "size": { "options": ["small", "medium", "large"] }
    }
  }
]
```

You can generate this from Storybook's `/index.json` endpoint:

```
> Fetch http://localhost:6006/index.json and generate a design-system-manifest.json
> with component names, sections, story variants, and argTypes.
```

---

## Step 6: Install the Skills

Copy the skills into your project:

```bash
# Create directories
mkdir -p .claude/commands .claude/rules

# Copy skills
cp design-system-skills/skills/ds-sync.md .claude/commands/
cp design-system-skills/skills/ds-wcag.md .claude/commands/
cp design-system-skills/skills/ds-report.md .claude/commands/
cp design-system-skills/skills/ds-proto.md .claude/commands/
cp design-system-skills/skills/ds-audit-figma.md .claude/commands/
cp design-system-skills/skills/storybook.md .claude/commands/

# Copy rules
cp design-system-skills/rules/accessibility.md .claude/rules/
```

### Customise File Paths

Open each skill and update the file paths to match your project:

- **Component barrel export** — where your components are exported from (e.g., `src/index.ts`)
- **Story file locations** — where your `.stories.tsx` files live
- **Token/CSS files** — where your design tokens are defined
- **Application source** — where your app code lives (for duplicate detection)

---

## Step 7: Run Your First Skill

### Accessibility Audit

```bash
# Start Claude Code in your project
claude

# Audit a single component
/ds-wcag Button
```

Claude reads the Button source, renders it in Storybook, runs axe-core, tests keyboard navigation, checks contrast in both themes, and scores the result on a 0–20 scale.

### Parity Report

To see the full state of your design system across all three pillars:

```bash
/ds-report
```

This produces a drift score and a component-by-component parity matrix.

### Bring Code Into Line With Figma

To align a component's implementation with its Figma design:

```bash
/ds-sync Button
```

This renders the Button in Storybook, compares it to the Figma component, and reports drift. Token-value fixes are applied to your CSS token file; spacing and structural fixes are proposed for you to confirm. Nothing is written to Figma.

To see what Figma has designed that isn't built yet:

```bash
pnpm ds:registry   # entries with presence.inCode: false
/ds-spec RatingStars   # spec generated from the Figma component, ready to implement from
```

---

## Troubleshooting

### Figma Console MCP not connecting

1. Make sure Figma Desktop is running (not the browser)
2. Make sure the Desktop Bridge plugin is running
3. Restart Claude Code to refresh MCP connections
4. Check `claude mcp list` to verify the server is registered

### Storybook not starting

1. Verify your launch config matches your Storybook command
2. Check if port 6006 is already in use: `lsof -i :6006`
3. Try starting Storybook manually first to catch errors

### Wrong Figma node IDs

1. Node IDs change when components are deleted and recreated
2. After major Figma restructuring, regenerate your mapping file
3. Use `figma_execute` to enumerate current page children and update IDs

---

## Optional: Set Up Figma Code Connect

[Figma Code Connect](code-connect.md) publishes your real component API (props, variants, import paths) to Figma's Dev Mode and the MCP server. Publishing is an explicit, approved action (a dry run first, then a person decides) — see the guide. It publishes implementation status against your Figma components — Figma's own variant and property definitions stay canonical, and Code Connect records which code implements them.

Two options:
- **Code Connect CLI** — write `.figma.tsx` files alongside your components, publish from terminal
- **Code Connect UI** — map components visually inside Figma's browser, connect to a GitHub repo

See the full [Code Connect Guide](code-connect.md) for setup instructions. Entirely optional. All skills work without it.

---

## Next Steps

- **Read the [Mapping File Guide](mapping-file.md)** for detailed mapping strategies
- **Set up [Code Connect](code-connect.md)** for richer AI context from Figma
- **Customise the [accessibility rules](../rules/accessibility.md)** for your project's standards
- **Try `/ds-proto`** to prototype new features using your existing component library
- **Set up CI gates** to run `/ds-report` on PRs and track drift over time (see [CI Integration](../guides/ci-integration.md))

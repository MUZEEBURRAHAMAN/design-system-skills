# Figma Code Connect (Optional)

[Figma Code Connect](https://developers.figma.com/docs/code-connect/) links your production components to Figma's Dev Mode and the MCP server. Developers inspecting a component in Figma see your real API. Claude gets your actual prop names, variant mappings, and import paths instead of inferring them from node names.

Optional. All skills work without it and improve with it.

---

## What Code Connect Does

Figma's component — its variants, properties, and values — is the canonical definition of what a "Button" is (see [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md)). Code Connect records how your implementation *maps onto* that definition: the import path, prop names and types, value mappings (Figma's `Type = Primary` maps to `variant="primary"`), and a working code example. It publishes implementation status against Figma; it does not correct or redefine the Figma component. If a mapping can't be written because the code lacks a Figma variant, that's implementation drift to fix in code, not a reason to change the Figma property.

`/ds-sync` compares against real prop mappings. `/ds-proto` composes with your actual API. `/ds-report` can verify Figma variant properties against code props.

---

## Two Approaches

### Code Connect CLI

Write `.figma.tsx` files alongside your components. Publish from your terminal.

Best for: teams that want precise, version-controlled prop mappings with full control.

```tsx
import figma from "@figma/code-connect";
import { Button } from "./Button";

figma.connect(Button, "https://figma.com/design/FILE_KEY/DS?node-id=1-234", {
  props: {
    label: figma.string("Label"),
    disabled: figma.boolean("Disabled"),
    variant: figma.enum("Type", {
      Primary: "primary",
      Secondary: "secondary",
      Danger: "danger",
    }),
    icon: figma.instance("Icon"),
  },
  example: ({ label, disabled, variant, icon }) => (
    <Button variant={variant} disabled={disabled} icon={icon}>
      {label}
    </Button>
  ),
});
```

### Code Connect UI

Map components visually inside Figma's browser interface. Connect to a GitHub repo for autocomplete and context.

Best for: teams that want a faster setup without touching the terminal, or designers who want to create the mappings themselves.

The UI also supports custom LLM instructions per component, which directly improve the quality of MCP output.

---

## Setup (CLI)

### 1. Install

```bash
npm install --save-dev @figma/code-connect
```

### 2. Generate a Token

In Figma, go to **Settings → Account → Personal access tokens**. Create a token with:
- **Code Connect Write** scope
- **File Content Read** scope

Set it as an environment variable:
```bash
export FIGMA_ACCESS_TOKEN=your-token-here
```

### 3. Run the Interactive Setup

```bash
npx figma connect
```

The wizard will:
- Ask for your component directory (e.g., `src/components`)
- Ask for your Figma file URL
- Optionally use AI to auto-map components to Figma nodes
- Generate `figma.config.json` and scaffold `.figma.tsx` files

### 4. Edit the Generated Files

Review each `.figma.tsx` file. Map Figma variant properties to your real props using the helpers:

| Helper | Maps | Example |
|--------|------|---------|
| `figma.string("Prop")` | Text property | `label: figma.string("Label")` |
| `figma.boolean("Prop")` | Boolean toggle | `disabled: figma.boolean("Disabled")` |
| `figma.enum("Prop", map)` | Variant options | `size: figma.enum("Size", { Small: "sm", Large: "lg" })` |
| `figma.instance("Prop")` | Instance swap | `icon: figma.instance("Icon")` |
| `figma.children("Name")` | Child layers | `tabs: figma.children("Tab")` |
| `figma.textContent("Layer")` | Text layer content | `title: figma.textContent("Heading")` |
| `figma.className([...])` | CSS class builder | See Tailwind example below |

#### Tailwind Example

```tsx
figma.connect(Badge, "https://...", {
  props: {
    className: figma.className([
      "badge",
      figma.enum("Variant", {
        Success: "badge-success",
        Warning: "badge-warning",
        Error: "badge-error",
      }),
      figma.enum("Size", { Small: "badge-sm", Large: "badge-lg" }),
    ]),
  },
  example: ({ className }) => <span className={className}>Status</span>,
});
```

### 5. Publish

```bash
npx figma connect publish
```

### 6. Verify

Open Figma, enter Dev Mode, select a connected component. You should see your production code snippet.

---

## Storybook Integration (React Only)

If you already have Storybook stories, you can connect them to Figma without separate `.figma.tsx` files:

```tsx
import figma from "@figma/code-connect/storybook";

export default {
  component: Button,
  parameters: {
    design: {
      type: "figma",
      url: "https://figma.com/design/FILE_KEY/DS?node-id=1-234",
      examples: [PrimaryButton],
      props: {
        label: figma.string("Label"),
        variant: figma.enum("Type", {
          Primary: "primary",
          Secondary: "secondary",
        }),
      },
      imports: ['import { Button } from "./Button"'],
    },
  },
};

function PrimaryButton() {
  return <Button variant="primary">Click me</Button>;
}
```

This reuses your existing stories as Code Connect examples.

---

## CI/CD

Auto-publish on merge to main:

```yaml
name: Code Connect
on:
  push:
    paths:
      - "src/components/**/*.figma.tsx"
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npx figma connect publish
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
```

---

## How It Improves the Skills

| Skill | Without Code Connect | With Code Connect |
|-------|---------------------|-------------------|
| `/ds-sync` | Compares visuals and token bindings | Also verifies code props cover every Figma variant property, via published mappings; gaps are reported as code drift |
| `/ds-proto` | Composes from manifest and source code | MCP server provides real component API and examples, reducing hallucinated props |
| `/ds-report` | Counts components and variants | Can cross-reference Code Connect publication status as a fourth parity dimension |
| `/ds-audit-figma` | Visual spot-check | Can verify Code Connect coverage alongside visual parity |

All skills work without Code Connect. Accuracy improves when it's present.

---

## Requirements

- Figma Organization or Enterprise plan
- Full Design seat or Dev Mode seat
- Node.js 18+
- `@figma/code-connect` package (v1.4+)

## Resources

- [Code Connect docs](https://developers.figma.com/docs/code-connect/)
- [CLI vs UI comparison](https://developers.figma.com/docs/code-connect/comparing-cc/)
- [React guide](https://developers.figma.com/docs/code-connect/react/)
- [Storybook integration](https://developers.figma.com/docs/code-connect/storybook/)
- [GitHub repo](https://github.com/figma/code-connect)

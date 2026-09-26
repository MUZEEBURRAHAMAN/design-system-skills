# CI Integration Guide

Run design system skills as automated checks in CI pipelines. Use them to enforce drift thresholds, block new accessibility regressions, and track adoption — without requiring Figma Desktop or a Storybook GUI.

**Figma stays the reference in CI.** CI runners can't run Figma Desktop, so the every-PR gate compares your code against a **committed Figma snapshot** — `.claude/ds-registry.json`, `.claude/ds-token-map.json`, and `DESIGN.md`, all regenerated *from live Figma* (`/ds-tokens --generate`, `pnpm ds:registry`, `/ds-design-md`) by whoever changes the Figma file, on a machine that has Figma Desktop. A PR that drifts from the snapshot fails; a Figma change is never "fixed" by editing code to match a stale snapshot — refresh the snapshot first. See [SOURCE-OF-TRUTH.md](../SOURCE-OF-TRUTH.md).

---

## What Can Run in CI

| Skill | CI Compatible | Requires Figma | Requires Browser |
|-------|:---:|:---:|:---:|
| `/ds-wcag` (static analysis only) | ✅ | No | No |
| `/ds-wcag` (rendered + axe-core) | ✅ | No | Yes (headless) |
| `/ds-report --snapshot` (code + Storybook vs. the committed Figma snapshot) | ✅ | No (reads the snapshot) | Yes (headless) |
| `/ds-report` (live Figma read) | ❌ | Yes (Desktop) | Yes |
| `/ds-usage` | ✅ | No | No |
| `/ds-tokens` (CSS side only) | ✅ | No | No |
| `/ds-lifecycle audit` | ✅ | No | No |
| `/ds-sync` | ❌ | Yes (Desktop) | Yes |
| `/ds-audit-figma` | ❌ | Yes (Desktop) | Yes |

---

## Setup

### 1. Install Claude Code in CI

```yaml
# .github/workflows/ds-checks.yml
- name: Install Claude Code
  run: npm install -g @anthropic-ai/claude-code

- name: Set Anthropic API key
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Store your API key as a GitHub Actions secret named `ANTHROPIC_API_KEY`.

### 2. Start Storybook in CI (for rendered checks)

```yaml
- name: Build and serve Storybook
  run: |
    npm run build-storybook
    npx http-server storybook-static -p 6006 --silent &
    npx wait-on http://localhost:6006 --timeout 60000
```

### 3. Run Skills Non-Interactively

Claude Code supports non-interactive mode via the `--print` flag:

```bash
claude --print "/ds-wcag --static-only" > wcag-report.txt
claude --print "/ds-usage --unused" > usage-report.txt
claude --print "/ds-lifecycle audit" > lifecycle-report.txt
```

The `--print` flag runs the skill, writes output to stdout, and exits. Non-zero exit code on errors.

---

## GitHub Actions Workflows

### WCAG Accessibility Gate

Fails the PR if new P0 accessibility violations are introduced.

```yaml
# .github/workflows/ds-wcag.yml
name: DS Accessibility Check

on:
  pull_request:
    paths:
      - 'packages/ds/src/**'
      - 'packages/ds/stories/**'

jobs:
  wcag:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Build and serve Storybook
        run: |
          npm run build-storybook --workspace=packages/ds
          npx http-server storybook-static -p 6006 --silent &
          npx wait-on http://localhost:6006

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run WCAG audit
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: claude --print "/ds-wcag" > .claude/ds-wcag-report.md

      - name: Check for new P0 violations
        run: |
          # Compare against baseline stored in the repo
          python3 scripts/check-wcag-regression.py \
            --baseline .claude/ds-wcag-baseline.md \
            --current .claude/ds-wcag-report.md \
            --fail-on-new-p0

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: wcag-report
          path: .claude/ds-wcag-report.md
```

### Drift Score Gate

Fails the PR if the overall parity drift score rises above a threshold.

```yaml
# .github/workflows/ds-drift.yml
name: DS Drift Check

on:
  pull_request:
    paths:
      - 'packages/ds/src/**'

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm ci

      - name: Start Storybook
        run: |
          npm run build-storybook --workspace=packages/ds
          npx http-server storybook-static -p 6006 --silent &
          npx wait-on http://localhost:6006

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run DS report (code + Storybook vs. the committed Figma snapshot)
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: claude --print "/ds-report --snapshot" > .claude/ds-report.md

      - name: Enforce drift threshold
        run: |
          python3 scripts/check-drift-threshold.py \
            --report .claude/ds-report.md \
            --max-drift 5
          # Fails if overall drift > 5%
```

### Usage / Shadow Copy Gate

Fails the PR if new shadow copies (local re-implementations of DS components) are introduced.

```yaml
# .github/workflows/ds-usage.yml
name: DS Usage Check

on:
  pull_request:
    paths:
      - 'apps/**'
      - 'src/**'

jobs:
  usage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm ci

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Scan for shadow copies
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude --print "/ds-usage --overrides" > .claude/ds-usage-report.md

      - name: Block new shadow copies
        run: |
          python3 scripts/check-shadow-copies.py \
            --report .claude/ds-usage-report.md \
            --baseline .claude/ds-usage-baseline.json \
            --fail-on-new
```

### Lifecycle Gate

Ensures no deprecated components are re-introduced.

```yaml
# .github/workflows/ds-lifecycle.yml
name: DS Lifecycle Check

on: [pull_request]

jobs:
  lifecycle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run lifecycle audit
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: claude --print "/ds-lifecycle audit" > .claude/ds-lifecycle-report.md

      - name: Block new usages of deprecated components
        run: |
          python3 scripts/check-lifecycle.py \
            --report .claude/ds-lifecycle-report.md \
            --fail-on-new-deprecated-usage
```

---

## Baseline Management

Most gates compare current results against a stored baseline. Manage baselines as committed files:

```
.claude/
  ds-wcag-baseline.md        # Last accepted WCAG state
  ds-usage-baseline.json     # Last accepted shadow copy count
  ds-benchmarks.json         # Historical drift scores (written by ds-report)
```

**Updating a baseline (when intentional regressions are accepted):**

```bash
# After a reviewed PR that intentionally changes the baseline:
claude --print "/ds-wcag" > .claude/ds-wcag-baseline.md
git add .claude/ds-wcag-baseline.md
git commit -m "chore: update WCAG baseline after Input refactor"
```

---

## Helper Scripts

The gate scripts referenced above (e.g., `scripts/check-wcag-regression.py`) are simple parsers. Examples:

### `scripts/check-drift-threshold.py`

```python
import sys, re, argparse

parser = argparse.ArgumentParser()
parser.add_argument('--report', required=True)
parser.add_argument('--max-drift', type=float, default=5.0)
args = parser.parse_args()

with open(args.report) as f:
    content = f.read()

match = re.search(r'Overall Drift.*?(\d+\.?\d*)%', content)
if not match:
    print("Could not parse drift score from report.")
    sys.exit(1)

drift = float(match.group(1))
print(f"Drift score: {drift}% (threshold: {args.max_drift}%)")

if drift > args.max_drift:
    print(f"FAIL: Drift {drift}% exceeds threshold {args.max_drift}%")
    sys.exit(1)

print("PASS")
```

---

## Scheduled Full Audits

Run a live-Figma audit on a schedule as a **freshness check on the snapshot itself**: it catches the case where Figma changed but nobody refreshed the committed snapshot, so every-PR gates are quietly comparing against stale design data. These need Figma Desktop, so they run on a dedicated Mac runner or via a local trigger. If you don't have one, refresh the snapshot by hand whenever the Figma file changes — that's a required step of changing Figma, not an optional extra.

```yaml
# .github/workflows/ds-full-audit.yml
name: DS Weekly Full Audit

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am UTC
  workflow_dispatch:

jobs:
  full-audit:
    runs-on: [self-hosted, macos, figma]  # Requires Figma Desktop available
    steps:
      - uses: actions/checkout@v4
      - name: Run full report
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude --print "/ds-report" > .claude/ds-report.md
          claude --print "/ds-wcag" > .claude/ds-wcag-report.md

      - name: Commit updated benchmarks
        run: |
          git config user.name "DS Bot"
          git config user.email "ds-bot@yourorg.com"
          git add .claude/ds-benchmarks.json .claude/ds-report.md .claude/ds-wcag-report.md
          git commit -m "chore: weekly DS audit [skip ci]" || echo "No changes"
          git push
```

---

## PR Comment Integration

Post a summary of DS health as a PR comment using the GitHub API:

```yaml
- name: Post DS report to PR
  uses: actions/github-script@v7
  if: always()
  with:
    script: |
      const fs = require('fs');
      const report = fs.readFileSync('.claude/ds-wcag-report.md', 'utf8');
      const summary = report.match(/## Summary[\s\S]*?(?=##|$)/)?.[0] ?? 'No summary found.';
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `## DS Accessibility Check\n\n${summary}`
      });
```

---

## Recommended Gate Strategy

| Gate | When to Run | Fail Condition |
|------|-------------|----------------|
| WCAG static analysis | Every PR touching DS components | Any new P0 issue |
| WCAG rendered (axe-core) | Every PR touching DS components | New critical/serious violation |
| Drift vs. Figma snapshot (`/ds-report --snapshot`) | Every PR touching DS source | Drift > 5% (adjust per team) |
| Shadow copy check | Every PR touching app code | New local re-implementation |
| Lifecycle audit | Every PR | New import of deprecated component |
| Token validation | Weekly or on token file changes | Parity score drops below 90% |
| Live-Figma report + snapshot freshness | Weekly scheduled, and on any Figma change | Snapshot older than the Figma file, or drift increase > 3% from last week |

# Contributing

## Adding a Detector

1. Create `src/detectors/your-detector.ts`
2. Implement the `Detector` interface
3. Register it in `src/detectors/index.ts`
4. Add tests in `tests/detectors/your-detector.test.ts`

```typescript
import type { Detector, ScanContext } from "../types";

export const yourDetector: Detector = {
  name: "your-detector",
  category: "your-category",
  async detect(ctx: ScanContext) {
    return { key: "value" };
  }
};
```

## Adding an Integration

1. Create `src/integrations/your-tool.ts`
2. Implement the `Integration` interface
3. Register it in `src/integrations/index.ts`

```typescript
import type { Integration } from "../types";

export const yourTool: Integration = {
  name: "your-tool",
  detect(root) { return existsSync(join(root, ".yourtoolrc")); },
  inject(root) { /* append .codebase.json reference */ },
  remove(root) { /* remove .codebase.json reference */ }
};
```

## Rules

- **Zero runtime dependencies.** Node.js built-ins only. No exceptions.
- **No AI calls.** Detection is pure heuristics. Deterministic in, deterministic out.
- **Facts, not opinions.** Detectors report what exists, not what's good or bad.
- **Under 10KB.** Manifest must stay small enough for a single AI context read.

## Running Locally

```bash
npm install       # dev dependencies only (typescript, tsup)
npm test          # run all tests
npm run dev       # run CLI in dev mode
```

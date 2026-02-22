import type { Detector, ScanContext } from "../types.js";

const KNOWN_CONFIG_FILES = [
  // TypeScript / JavaScript
  "tsconfig.json", "jsconfig.json",
  // Bundlers / Build
  "tsup.config.ts", "tsup.config.js",
  "next.config.js", "next.config.mjs", "next.config.ts",
  "vite.config.ts", "vite.config.js", "vite.config.mjs",
  "webpack.config.js", "webpack.config.ts",
  "rollup.config.js", "rollup.config.mjs",
  "esbuild.config.js", "esbuild.config.mjs",
  "turbo.json", "nx.json",
  // Styling
  "tailwind.config.js", "tailwind.config.ts", "tailwind.config.mjs",
  "postcss.config.js", "postcss.config.mjs", "postcss.config.ts",
  // Transpilers
  "babel.config.js", "babel.config.json", ".babelrc",
  "swc.config.json", ".swcrc",
  // Testing
  "jest.config.js", "jest.config.ts",
  "vitest.config.ts", "vitest.config.js", "vitest.config.mts",
  "playwright.config.ts", "playwright.config.js",
  "cypress.config.ts", "cypress.config.js",
  // Linting / Formatting
  ".prettierrc", ".prettierrc.js", ".prettierrc.json", "prettier.config.js", "prettier.config.mjs",
  ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml",
  "eslint.config.js", "eslint.config.mjs", "eslint.config.ts",
  "biome.json", "biome.jsonc",
  "dprint.json",
  ".editorconfig",
  // Containers / Infra
  "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
  "Dockerfile",
  "fly.toml", "render.yaml", "vercel.json", "netlify.toml",
  // Python
  "pyproject.toml", "setup.cfg", "setup.py", "tox.ini",
  "ruff.toml", ".ruff.toml",
  // Go
  "go.mod",
  // Rust
  "Cargo.toml",
  // Ruby
  "Gemfile",
  // PHP
  "composer.json",
  // Misc
  "Makefile", "Taskfile.yml",
  ".nvmrc", ".node-version", ".python-version", ".ruby-version", ".tool-versions",
];

const FEATURE_FLAG_MARKERS: Record<string, string> = {
  "launchdarkly-node-server-sdk": "launchdarkly",
  "@unleash/proxy-client-react": "unleash",
  "flagsmith": "flagsmith",
  "@growthbook/growthbook-react": "growthbook",
};

export const configDetector: Detector = {
  name: "config",
  category: "config",

  async detect(ctx: ScanContext) {
    const envFiles = ctx.files.filter(f =>
      f.match(/^\.env(\..+)?$/) || f.match(/^\.env\./)
    );

    const configFiles = KNOWN_CONFIG_FILES.filter(f => ctx.fileExists(f));

    const featureFlags = await detectFeatureFlags(ctx);

    return {
      env_files: envFiles,
      config_files: configFiles,
      feature_flags: featureFlags,
    };
  },
};

async function detectFeatureFlags(ctx: ScanContext): Promise<string | null> {
  const content = await ctx.readFile("package.json");
  if (!content) return null;

  try {
    const pkg = JSON.parse(content);
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const [dep, name] of Object.entries(FEATURE_FLAG_MARKERS)) {
      if (allDeps[dep]) return name;
    }
  } catch {}

  return null;
}

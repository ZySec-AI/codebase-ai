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

    const envVars = await detectEnvVars(ctx);

    return {
      env_files: envFiles,
      config_files: configFiles,
      feature_flags: featureFlags,
      env_vars: envVars,
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

async function detectEnvVars(ctx: ScanContext): Promise<Record<string, { description?: string; required: boolean }>> {
  const envVars: Record<string, { description?: string; required: boolean }> = {};

  // Try .env.example first (most common for documentation)
  const envExampleContent = await ctx.readFile(".env.example");
  if (envExampleContent) {
    parseEnvFile(envExampleContent, envVars, false); // .env.example vars are typically not marked as required
  }

  // Try .env (may have more vars)
  const envContent = await ctx.readFile(".env");
  if (envContent) {
    parseEnvFile(envContent, envVars, true);
  }

  // Try .env.sample
  const envSampleContent = await ctx.readFile(".env.sample");
  if (envSampleContent) {
    parseEnvFile(envSampleContent, envVars, false);
  }

  // Try .env.template
  const envTemplateContent = await ctx.readFile(".env.template");
  if (envTemplateContent) {
    parseEnvFile(envTemplateContent, envVars, false);
  }

  return envVars;
}

function parseEnvFile(content: string, envVars: Record<string, { description?: string; required: boolean }>, isProductionEnv: boolean): void {
  const lines = content.split("\n");
  let currentComment = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Capture comments as descriptions
    if (trimmed.startsWith("#")) {
      currentComment += (currentComment ? " " : "") + trimmed.slice(1).trim();
      continue;
    }

    // Parse VAR=value or VAR=value syntax
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, name, value] = match;
      const isEmpty = value === '""' || value === "''" || value === "";

      envVars[name] = {
        description: currentComment || undefined,
        required: isProductionEnv || isEmpty, // Mark as required if it's empty or from production .env
      };

      currentComment = ""; // Reset comment for next variable
    }
  }
}

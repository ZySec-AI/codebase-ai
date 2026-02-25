import type { Detector, ScanContext } from "../types.js";

const NOTABLE_PACKAGES = new Set([
  // Frameworks
  "next", "react", "vue", "angular", "svelte", "nuxt", "remix", "astro", "gatsby",
  "express", "fastify", "hono", "nestjs", "koa",
  // ORM / DB
  "prisma", "@prisma/client", "drizzle-orm", "typeorm", "sequelize", "mongoose", "knex",
  // State
  "zustand", "redux", "@reduxjs/toolkit", "mobx", "jotai", "recoil", "pinia", "vuex",
  "@tanstack/react-query",
  // Validation
  "zod", "joi", "yup", "ajv",
  // API
  "@trpc/server", "graphql", "apollo-server", "@apollo/client",
  // Testing
  "jest", "vitest", "mocha", "playwright", "@playwright/test", "cypress",
  // Build
  "webpack", "vite", "esbuild", "rollup", "turbo", "nx", "tsup", "unbuild", "pkgroll",
  // Styling
  "tailwindcss", "styled-components", "@emotion/react", "@chakra-ui/react",
  "@mui/material", "@mantine/core",
  // Auth
  "next-auth", "@auth/core", "passport", "jsonwebtoken",
  // Deployment
  "@vercel/node", "@netlify/functions", "serverless",
  // Misc
  "docker", "typescript",
]);

const NOTABLE_PYTHON = new Set([
  "django", "flask", "fastapi", "starlette", "tornado", "aiohttp",
  "sqlalchemy", "alembic", "pydantic", "celery", "redis",
  "pytest", "numpy", "pandas", "scipy", "scikit-learn",
  "tensorflow", "torch", "transformers", "langchain",
  "requests", "httpx", "boto3",
]);

const NOTABLE_RUST = new Set([
  "serde", "tokio", "axum", "actix-web", "rocket", "warp", "hyper",
  "sqlx", "diesel", "sea-orm", "clap", "tracing", "anyhow",
  "thiserror", "reqwest", "tonic", "prost",
]);

const NOTABLE_GO = new Set([
  "gin", "echo", "fiber", "chi", "mux",
  "gorm", "sqlx", "cobra", "viper", "zap",
  "testify", "grpc", "protobuf", "wire",
]);

export const dependenciesDetector: Detector = {
  name: "dependencies",
  category: "dependencies",

  async detect(ctx: ScanContext) {
    const lockFile = detectLockFile(ctx);

    // Node.js — package.json (highest priority)
    const pkgContent = await ctx.readFile("package.json");
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const deps = pkg.dependencies || {};
        const devDeps = pkg.devDependencies || {};
        const allDeps = { ...deps, ...devDeps };

        const notable = Object.keys(allDeps)
          .filter(d => NOTABLE_PACKAGES.has(d))
          .sort();

        return { direct_count: Object.keys(deps).length, dev_count: Object.keys(devDeps).length, lock_file: lockFile, notable };
      } catch {
        // malformed package.json — fall through
      }
    }

    // Python — pyproject.toml
    const pyprojectContent = await ctx.readFile("pyproject.toml");
    if (pyprojectContent) {
      const result = parsePyprojectToml(pyprojectContent);
      if (result) {
        const notable = findNotable([...result.direct, ...result.dev], NOTABLE_PYTHON);
        return { direct_count: result.direct.length, dev_count: result.dev.length, lock_file: lockFile, notable };
      }
    }

    // Python — requirements.txt
    const reqContent = await ctx.readFile("requirements.txt");
    if (reqContent) {
      const names = parseRequirementsTxt(reqContent);
      const notable = findNotable(names, NOTABLE_PYTHON);
      return { direct_count: names.length, dev_count: 0, lock_file: lockFile, notable };
    }

    // Rust — Cargo.toml
    const cargoContent = await ctx.readFile("Cargo.toml");
    if (cargoContent) {
      const result = parseCargoToml(cargoContent);
      const notable = findNotable([...result.direct, ...result.dev], NOTABLE_RUST);
      return { direct_count: result.direct.length, dev_count: result.dev.length, lock_file: lockFile, notable };
    }

    // Go — go.mod
    const goModContent = await ctx.readFile("go.mod");
    if (goModContent) {
      const names = parseGoMod(goModContent);
      // Extract last path segment as package name for notable matching
      const shortNames = names.map(n => n.split("/").pop()!);
      const notable = findNotable(shortNames, NOTABLE_GO);
      return { direct_count: names.length, dev_count: 0, lock_file: lockFile, notable };
    }

    return { direct_count: 0, dev_count: 0, lock_file: lockFile, notable: [] };
  },
};

function findNotable(names: string[], notableSet: Set<string>): string[] {
  return names.filter(n => notableSet.has(n)).sort();
}

function parsePyprojectToml(content: string): { direct: string[]; dev: string[] } | null {
  const direct: string[] = [];
  const dev: string[] = [];

  // PEP 621: [project] dependencies = ["flask>=2.0", ...]
  const pep621Match = content.match(/\[project\]\s[\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (pep621Match) {
    direct.push(...extractQuotedNames(pep621Match[1]));
  }

  // PEP 621: [project.optional-dependencies] dev = ["pytest", ...]
  const optDepsMatch = content.match(/\[project\.optional-dependencies\]\s*[\s\S]*?(?=\n\[|$)/);
  if (optDepsMatch) {
    // Match all arrays in the section
    const arrayMatches = optDepsMatch[0].matchAll(/\w+\s*=\s*\[([\s\S]*?)\]/g);
    for (const m of arrayMatches) {
      dev.push(...extractQuotedNames(m[1]));
    }
  }

  // Poetry: [tool.poetry.dependencies]
  const poetryDepsMatch = content.match(/\[tool\.poetry\.dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (poetryDepsMatch) {
    const names = extractTomlKeys(poetryDepsMatch[1]);
    direct.push(...names.filter(n => n !== "python"));
  }

  // Poetry: [tool.poetry.group.dev.dependencies] or [tool.poetry.dev-dependencies]
  const poetryDevMatch = content.match(/\[tool\.poetry\.(?:group\.dev\.|dev-)dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (poetryDevMatch) {
    dev.push(...extractTomlKeys(poetryDevMatch[1]));
  }

  if (direct.length === 0 && dev.length === 0) return null;
  return { direct, dev };
}

function extractQuotedNames(block: string): string[] {
  const names: string[] = [];
  const matches = block.matchAll(/"([^"]+)"|'([^']+)'/g);
  for (const m of matches) {
    const raw = m[1] || m[2];
    // Extract package name: strip version specifiers, extras, markers
    const name = raw.split(/[>=<!;\[]/)[0].trim().toLowerCase();
    if (name) names.push(name);
  }
  return names;
}

function extractTomlKeys(block: string): string[] {
  const names: string[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
    if (match) names.push(match[1].toLowerCase());
  }
  return names;
}

function parseRequirementsTxt(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const name = trimmed.split(/[>=<!;\[]/)[0].trim().toLowerCase();
    if (name) names.push(name);
  }
  return names;
}

function parseCargoToml(content: string): { direct: string[]; dev: string[] } {
  const direct: string[] = [];
  const dev: string[] = [];

  // [dependencies] section
  const depsMatch = content.match(/\[dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (depsMatch) {
    direct.push(...extractTomlKeys(depsMatch[1]));
  }

  // [dev-dependencies] section
  const devDepsMatch = content.match(/\[dev-dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (devDepsMatch) {
    dev.push(...extractTomlKeys(devDepsMatch[1]));
  }

  return { direct, dev };
}

function parseGoMod(content: string): string[] {
  const names: string[] = [];

  // require ( ... ) blocks
  const blockMatches = content.matchAll(/require\s*\(([\s\S]*?)\)/g);
  for (const m of blockMatches) {
    for (const line of m[1].split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      const parts = trimmed.split(/\s+/);
      if (parts[0]) names.push(parts[0]);
    }
  }

  // Single-line: require github.com/foo/bar v1.2.3
  const singleMatches = content.matchAll(/^require\s+(\S+)[ \t]+\S+/gm);
  for (const m of singleMatches) {
    names.push(m[1]);
  }

  return names;
}

function detectLockFile(ctx: ScanContext): string | null {
  if (ctx.fileExists("pnpm-lock.yaml")) return "pnpm-lock.yaml";
  if (ctx.fileExists("yarn.lock")) return "yarn.lock";
  if (ctx.fileExists("package-lock.json")) return "package-lock.json";
  if (ctx.fileExists("bun.lockb") || ctx.fileExists("bun.lock")) return "bun.lockb";
  if (ctx.fileExists("Cargo.lock")) return "Cargo.lock";
  if (ctx.fileExists("poetry.lock")) return "poetry.lock";
  if (ctx.fileExists("Pipfile.lock")) return "Pipfile.lock";
  if (ctx.fileExists("go.sum")) return "go.sum";
  if (ctx.fileExists("Gemfile.lock")) return "Gemfile.lock";
  if (ctx.fileExists("composer.lock")) return "composer.lock";
  return null;
}

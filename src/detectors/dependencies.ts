import type { Detector, ScanContext } from "../types.js";

const NOTABLE_PACKAGES = new Set([
  // === JavaScript/TypeScript ===
  // Frameworks
  "next",
  "react",
  "vue",
  "angular",
  "svelte",
  "nuxt",
  "remix",
  "astro",
  "gatsby",
  "express",
  "fastify",
  "hono",
  "nestjs",
  "koa",
  "solid",
  "solid-js",
  "qwik",
  // ORM / DB
  "prisma",
  "@prisma/client",
  "drizzle-orm",
  "typeorm",
  "sequelize",
  "mongoose",
  "knex",
  // State
  "zustand",
  "redux",
  "@reduxjs/toolkit",
  "mobx",
  "jotai",
  "recoil",
  "pinia",
  "vuex",
  "@tanstack/react-query",
  "@swr/core",
  "react-query",
  // Validation
  "zod",
  "joi",
  "yup",
  "ajv",
  "class-validator",
  // API
  "@trpc/server",
  "graphql",
  "apollo-server",
  "@apollo/client",
  "graphql-yoga",
  // Testing
  "jest",
  "vitest",
  "mocha",
  "playwright",
  "@playwright/test",
  "cypress",
  "msw",
  // Build
  "webpack",
  "vite",
  "esbuild",
  "rollup",
  "turbo",
  "nx",
  "tsup",
  "unbuild",
  "pkgroll",
  // Styling
  "tailwindcss",
  "styled-components",
  "@emotion/react",
  "@chakra-ui/react",
  "@mui/material",
  "@mantine/core",
  // Auth
  "next-auth",
  "@auth/core",
  "passport",
  "jsonwebtoken",
  "lucia-auth",
  // Deployment
  "@vercel/node",
  "@netlify/functions",
  "serverless",
  "sst",

  // === Python ===
  "fastapi",
  "django",
  "flask",
  "starlette",
  "tornado",
  "aiohttp",
  "sqlalchemy",
  "alembic",
  "pydantic",
  "typer",
  "click",
  "pytest",
  "black",
  "ruff",
  "mypy",
  "pylint",
  "celery",
  "redis",
  "pymongo",
  "psycopg2",
  "numpy",
  "pandas",
  "torch",
  "tensorflow",
  "scikit-learn",

  // === Go ===
  "gin-gonic",
  "gorilla/mux",
  "go-chi/chi",
  "labstack/echo",
  "gofiber/fiber",
  "gorm",
  "sqlx",
  "lib/pq",
  "go-redis",
  "testify",
  "stretchr",
  "grpc",
  "protobuf",
  "cobra",

  // === Rust ===
  "actix-web",
  "axum",
  "rocket",
  "warp",
  "tokio",
  "serde",
  "diesel",
  "sqlx",
  "sea-orm",
  "clap",
  "anyhow",
  "thiserror",
  "tracing",

  // === Ruby ===
  "rails",
  "sinatra",
  "grape",
  "hanami",
  "roda",
  "activerecord",
  "pg",
  "mysql2",
  "redis",
  "sidekiq",
  "rspec",
  "rubocop",
  "pry",
  "byebug",

  // === PHP ===
  "laravel",
  "symfony",
  "slim",
  "guzzlehttp",
  "illuminate",
  "doctrine/orm",
  "ramsey/uuid",
  "phpunit",
  "mockery",

  // === Java/Kotlin ===
  "spring-boot",
  "spring-framework",
  "micronaut",
  "quarkus",
  "hibernate",
  "jakarta.persistence",
  "junit",
  "mockito",
  "testng",

  // === C# ===
  "Microsoft.AspNetCore",
  "EntityFramework",
  "Newtonsoft",
  "NUnit",
  "xUnit",
  "Moq",

  // === Misc ===
  "docker",
  "typescript",
  "kubernetes",
]);

const NOTABLE_PYTHON = new Set([
  "django",
  "flask",
  "fastapi",
  "starlette",
  "tornado",
  "aiohttp",
  "sqlalchemy",
  "alembic",
  "pydantic",
  "celery",
  "redis",
  "pytest",
  "numpy",
  "pandas",
  "scipy",
  "scikit-learn",
  "tensorflow",
  "torch",
  "transformers",
  "langchain",
  "requests",
  "httpx",
  "boto3",
]);

const NOTABLE_RUST = new Set([
  "serde",
  "tokio",
  "axum",
  "actix-web",
  "rocket",
  "warp",
  "hyper",
  "sqlx",
  "diesel",
  "sea-orm",
  "clap",
  "tracing",
  "anyhow",
  "thiserror",
  "reqwest",
  "tonic",
  "prost",
]);

const NOTABLE_GO = new Set([
  "gin",
  "echo",
  "fiber",
  "chi",
  "mux",
  "gorm",
  "sqlx",
  "cobra",
  "viper",
  "zap",
  "testify",
  "grpc",
  "protobuf",
  "wire",
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
          .filter((d) => NOTABLE_PACKAGES.has(d))
          .sort();

        return {
          direct_count: Object.keys(deps).length,
          dev_count: Object.keys(devDeps).length,
          lock_file: lockFile,
          notable,
        };
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
        return {
          direct_count: result.direct.length,
          dev_count: result.dev.length,
          lock_file: lockFile,
          notable,
        };
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
      return {
        direct_count: result.direct.length,
        dev_count: result.dev.length,
        lock_file: lockFile,
        notable,
      };
    }

    // Go — go.mod
    const goModContent = await ctx.readFile("go.mod");
    if (goModContent) {
      const names = parseGoMod(goModContent);
      const shortNames = names.map((n) => n.split("/").pop()!);
      const notable = findNotable(shortNames, NOTABLE_GO);
      return { direct_count: names.length, dev_count: 0, lock_file: lockFile, notable };
    }

    // Ruby — Gemfile
    const rubyResult = await detectRubyDeps(ctx);
    if (rubyResult.direct_count > 0) {
      return { ...rubyResult, lock_file: lockFile };
    }

    // PHP — composer.json
    const phpResult = await detectPhpDeps(ctx);
    if (phpResult.direct_count > 0) {
      return { ...phpResult, lock_file: lockFile };
    }

    // Java — pom.xml / build.gradle
    const javaResult = await detectJavaDeps(ctx);
    if (javaResult.direct_count > 0) {
      return { ...javaResult, lock_file: lockFile };
    }

    // C# — .csproj
    const csharpResult = await detectCSharpDeps(ctx);
    if (csharpResult.direct_count > 0) {
      return { ...csharpResult, lock_file: lockFile };
    }

    return { direct_count: 0, dev_count: 0, lock_file: lockFile, notable: [] };
  },
};

function findNotable(names: string[], notableSet: Set<string>): string[] {
  return names.filter((n) => notableSet.has(n)).sort();
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
    const arrayMatches = optDepsMatch[0].matchAll(/\w+\s*=\s*\[([\s\S]*?)\]/g);
    for (const m of arrayMatches) {
      dev.push(...extractQuotedNames(m[1]));
    }
  }

  // Poetry: [tool.poetry.dependencies]
  const poetryDepsMatch = content.match(/\[tool\.poetry\.dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (poetryDepsMatch) {
    const names = extractTomlKeys(poetryDepsMatch[1]);
    direct.push(...names.filter((n) => n !== "python"));
  }

  // Poetry: [tool.poetry.group.dev.dependencies] or [tool.poetry.dev-dependencies]
  const poetryDevMatch = content.match(
    /\[tool\.poetry\.(?:group\.dev\.|dev-)dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/
  );
  if (poetryDevMatch) {
    dev.push(...extractTomlKeys(poetryDevMatch[1]));
  }

  if (direct.length === 0 && dev.length === 0) {
    return null;
  }
  return { direct, dev };
}

function extractQuotedNames(block: string): string[] {
  const names: string[] = [];
  const matches = block.matchAll(/"([^"]+)"|'([^']+)'/g);
  for (const m of matches) {
    const raw = m[1] || m[2];
    const name = raw
      .split(/[>=<!;\[]/)[0]
      .trim()
      .toLowerCase();
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function extractTomlKeys(block: string): string[] {
  const names: string[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
    if (match) {
      names.push(match[1].toLowerCase());
    }
  }
  return names;
}

function parseRequirementsTxt(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) {
      continue;
    }
    const name = trimmed
      .split(/[>=<!;\[]/)[0]
      .trim()
      .toLowerCase();
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function parseCargoToml(content: string): { direct: string[]; dev: string[] } {
  const direct: string[] = [];
  const dev: string[] = [];

  const depsMatch = content.match(/\[dependencies\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (depsMatch) {
    direct.push(...extractTomlKeys(depsMatch[1]));
  }

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
      if (!trimmed || trimmed.startsWith("//")) {
        continue;
      }
      const parts = trimmed.split(/\s+/);
      if (parts[0]) {
        names.push(parts[0]);
      }
    }
  }

  // Single-line: require github.com/foo/bar v1.2.3
  const singleMatches = content.matchAll(/^require\s+(\S+)[ \t]+\S+/gm);
  for (const m of singleMatches) {
    names.push(m[1]);
  }

  return names;
}

async function detectRubyDeps(
  ctx: ScanContext
): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const gemfile = await ctx.readFile("Gemfile");
  if (!gemfile) {
    return { direct_count: 0, dev_count: 0, notable: [] };
  }

  const deps: string[] = [];
  const notable: string[] = [];

  for (const line of gemfile.split("\n")) {
    const match = line.match(/gem\s+["']([^"']+)["']/);
    if (match) {
      deps.push(match[1]);
      if (NOTABLE_PACKAGES.has(match[1])) {
        notable.push(match[1]);
      }
    }
  }

  return {
    direct_count: deps.length,
    dev_count: 0,
    notable: [...new Set(notable)].sort(),
  };
}

async function detectPhpDeps(
  ctx: ScanContext
): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const composer = await ctx.readFile("composer.json");
  if (!composer) {
    return { direct_count: 0, dev_count: 0, notable: [] };
  }

  try {
    const pkg = JSON.parse(composer);
    const deps = pkg.require || {};
    const devDeps = pkg["require-dev"] || {};
    const allDeps = { ...deps, ...devDeps };

    const notable = Object.keys(allDeps)
      .filter((d) => NOTABLE_PACKAGES.has(d))
      .sort();

    return {
      direct_count: Object.keys(deps).length,
      dev_count: Object.keys(devDeps).length,
      notable,
    };
  } catch {
    return { direct_count: 0, dev_count: 0, notable: [] };
  }
}

async function detectJavaDeps(
  ctx: ScanContext
): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const pom = await ctx.readFile("pom.xml");
  const gradle = await ctx.readFile("build.gradle");
  const gradleKts = await ctx.readFile("build.gradle.kts");
  const content = (pom || "") + "\n" + (gradle || "") + "\n" + (gradleKts || "");

  if (!content.trim()) {
    return { direct_count: 0, dev_count: 0, notable: [] };
  }

  const deps: string[] = [];
  const notable: string[] = [];

  const artifactIdRegex = /<artifactId>([^<]+)<\/artifactId>/g;
  let match;
  while ((match = artifactIdRegex.exec(content)) !== null) {
    deps.push(match[1]);
    if (NOTABLE_PACKAGES.has(match[1])) {
      notable.push(match[1]);
    }
  }

  const gradleDepsRegex = /(?:implementation|compile|api)\s+['"]([^:'"]+)/g;
  while ((match = gradleDepsRegex.exec(content)) !== null) {
    const dep = match[1].split(":").pop();
    if (dep) {
      deps.push(dep);
      if (NOTABLE_PACKAGES.has(dep)) {
        notable.push(dep);
      }
    }
  }

  return {
    direct_count: [...new Set(deps)].length,
    dev_count: 0,
    notable: [...new Set(notable)].sort(),
  };
}

async function detectCSharpDeps(
  ctx: ScanContext
): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const csprojFiles = ctx.files.filter((f) => f.endsWith(".csproj"));
  if (csprojFiles.length === 0) {
    return { direct_count: 0, dev_count: 0, notable: [] };
  }

  const deps: string[] = [];
  const notable: string[] = [];

  for (const file of csprojFiles) {
    const content = await ctx.readFile(file);
    const packageRegex = /<PackageReference\s+Include="([^"]+)"/g;
    let match;
    while ((match = packageRegex.exec(content)) !== null) {
      deps.push(match[1]);
      const name = match[1].split(".")[0].toLowerCase();
      if (NOTABLE_PACKAGES.has(name)) {
        notable.push(match[1]);
      }
    }
  }

  return {
    direct_count: [...new Set(deps)].length,
    dev_count: 0,
    notable: [...new Set(notable)].sort(),
  };
}

function detectLockFile(ctx: ScanContext): string | null {
  // JavaScript/TypeScript
  if (ctx.fileExists("pnpm-lock.yaml")) {
    return "pnpm-lock.yaml";
  }
  if (ctx.fileExists("yarn.lock")) {
    return "yarn.lock";
  }
  if (ctx.fileExists("package-lock.json")) {
    return "package-lock.json";
  }
  if (ctx.fileExists("bun.lockb") || ctx.fileExists("bun.lock")) {
    return "bun.lock";
  }
  // Rust
  if (ctx.fileExists("Cargo.lock")) {
    return "Cargo.lock";
  }
  // Python
  if (ctx.fileExists("poetry.lock")) {
    return "poetry.lock";
  }
  if (ctx.fileExists("Pipfile.lock")) {
    return "Pipfile.lock";
  }
  if (ctx.fileExists("uv.lock")) {
    return "uv.lock";
  }
  // Go
  if (ctx.fileExists("go.sum")) {
    return "go.sum";
  }
  // Ruby
  if (ctx.fileExists("Gemfile.lock")) {
    return "Gemfile.lock";
  }
  // PHP
  if (ctx.fileExists("composer.lock")) {
    return "composer.lock";
  }
  // Java
  if (ctx.fileExists(".mvn/jvm.config")) {
    return "maven";
  }
  // Kotlin/Gradle
  if (ctx.fileExists(".gradle")) {
    return "gradle";
  }
  // Swift
  if (ctx.fileExists("Package.resolved")) {
    return "swift";
  }
  // Dart/Flutter
  if (ctx.fileExists("pubspec.lock")) {
    return "pubspec.lock";
  }
  // Elixir
  if (ctx.fileExists("mix.lock")) {
    return "mix.lock";
  }
  // Scala
  if (ctx.fileExists("project/target/resolution-cache")) {
    return "sbt";
  }
  // NuGet (.NET)
  if (ctx.fileExists("packages.lock.json")) {
    return "nuget";
  }
  return null;
}

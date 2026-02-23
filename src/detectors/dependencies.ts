import type { Detector, ScanContext } from "../types.js";

const NOTABLE_PACKAGES = new Set([
  // === JavaScript/TypeScript ===
  // Frameworks
  "next", "react", "vue", "angular", "svelte", "nuxt", "remix", "astro", "gatsby",
  "express", "fastify", "hono", "nestjs", "koa", "solid", "solid-js", "qwik",
  // ORM / DB
  "prisma", "@prisma/client", "drizzle-orm", "typeorm", "sequelize", "mongoose", "knex",
  // State
  "zustand", "redux", "@reduxjs/toolkit", "mobx", "jotai", "recoil", "pinia", "vuex",
  "@tanstack/react-query", "@swr/core", "react-query",
  // Validation
  "zod", "joi", "yup", "ajv", "class-validator",
  // API
  "@trpc/server", "graphql", "apollo-server", "@apollo/client", "graphql-yoga",
  // Testing
  "jest", "vitest", "mocha", "playwright", "@playwright/test", "cypress", "msw",
  // Build
  "webpack", "vite", "esbuild", "rollup", "turbo", "nx", "tsup", "unbuild", "pkgroll",
  // Styling
  "tailwindcss", "styled-components", "@emotion/react", "@chakra-ui/react",
  "@mui/material", "@mantine/core",
  // Auth
  "next-auth", "@auth/core", "passport", "jsonwebtoken", "lucia-auth",
  // Deployment
  "@vercel/node", "@netlify/functions", "serverless", "sst",

  // === Python ===
  "fastapi", "django", "flask", "starlette", "tornado", "aiohttp",
  "sqlalchemy", "alembic", "pydantic", "typer", "click",
  "pytest", "black", "ruff", "mypy", "pylint",
  "celery", "redis", "pymongo", "psycopg2",
  "numpy", "pandas", "torch", "tensorflow", "scikit-learn",

  // === Go ===
  "gin-gonic", "gorilla/mux", "go-chi/chi", "labstack/echo", "gofiber/fiber",
  "gorm", "sqlx", "lib/pq", "go-redis",
  "testify", "stretchr",
  "grpc", "protobuf", "cobra",

  // === Rust ===
  "actix-web", "axum", "rocket", "warp", "tokio",
  "serde", "diesel", "sqlx", "sea-orm",
  "clap", "anyhow", "thiserror", "tracing",

  // === Ruby ===
  "rails", "sinatra", "grape", "hanami", "roda",
  "activerecord", "pg", "mysql2", "redis", "sidekiq",
  "rspec", "rubocop", "pry", "byebug",

  // === PHP ===
  "laravel", "symfony", "slim", "guzzlehttp",
  "illuminate", "doctrine/orm", "ramsey/uuid",
  "phpunit", "mockery",

  // === Java/Kotlin ===
  "spring-boot", "spring-framework", "micronaut", "quarkus",
  "hibernate", "jakarta.persistence",
  "junit", "mockito", "testng",

  // === C# ===
  "Microsoft.AspNetCore", "EntityFramework", "Newtonsoft",
  "NUnit", "xUnit", "Moq",

  // === Misc ===
  "docker", "typescript", "kubernetes",
]);

export const dependenciesDetector: Detector = {
  name: "dependencies",
  category: "dependencies",

  async detect(ctx: ScanContext) {
    // Try JavaScript/TypeScript (package.json)
    const npmResult = await detectNpmDeps(ctx);
    if (npmResult.direct_count > 0 || npmResult.dev_count > 0) {
      return { ...npmResult, lock_file: detectLockFile(ctx) };
    }

    // Try Python (requirements.txt, pyproject.toml)
    const pythonResult = await detectPythonDeps(ctx);
    if (pythonResult.direct_count > 0) {
      return { ...pythonResult, lock_file: detectLockFile(ctx) };
    }

    // Try Rust (Cargo.toml)
    const rustResult = await detectRustDeps(ctx);
    if (rustResult.direct_count > 0) {
      return { ...rustResult, lock_file: detectLockFile(ctx) };
    }

    // Try Go (go.mod)
    const goResult = await detectGoDeps(ctx);
    if (goResult.direct_count > 0) {
      return { ...goResult, lock_file: detectLockFile(ctx) };
    }

    // Try Ruby (Gemfile)
    const rubyResult = await detectRubyDeps(ctx);
    if (rubyResult.direct_count > 0) {
      return { ...rubyResult, lock_file: detectLockFile(ctx) };
    }

    // Try PHP (composer.json)
    const phpResult = await detectPhpDeps(ctx);
    if (phpResult.direct_count > 0) {
      return { ...phpResult, lock_file: detectLockFile(ctx) };
    }

    // Try Java (pom.xml)
    const javaResult = await detectJavaDeps(ctx);
    if (javaResult.direct_count > 0) {
      return { ...javaResult, lock_file: detectLockFile(ctx) };
    }

    // Try C# (.csproj)
    const csharpResult = await detectCSharpDeps(ctx);
    if (csharpResult.direct_count > 0) {
      return { ...csharpResult, lock_file: detectLockFile(ctx) };
    }

    // Fallback: just lock file info
    return {
      direct_count: 0,
      dev_count: 0,
      lock_file: detectLockFile(ctx),
      notable: [],
    };
  },
};

async function detectNpmDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const content = await ctx.readFile("package.json");
  if (!content) return { direct_count: 0, dev_count: 0, notable: [] };

  try {
    const pkg = JSON.parse(content);
    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };

    const notable = Object.keys(allDeps)
      .filter(d => NOTABLE_PACKAGES.has(d))
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

async function detectPythonDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const requirements = await ctx.readFile("requirements.txt");
  const pyproject = await ctx.readFile("pyproject.toml");
  const setup = await ctx.readFile("setup.py");
  const content = requirements + "\n" + pyproject + "\n" + setup;

  if (!content.trim()) return { direct_count: 0, dev_count: 0, notable: [] };

  const lines = content.split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));

  // Parse package names (strip version specs)
  const packages = lines
    .map(line => line.split(/[=>!<~\[]/)[0].toLowerCase())
    .filter(pkg => pkg && pkg !== "" && !pkg.startsWith("-"));

  const notable = packages.filter(p => NOTABLE_PACKAGES.has(p));

  return {
    direct_count: packages.length,
    dev_count: 0, // Python doesn't always separate dev deps
    notable: [...new Set(notable)].sort(),
  };
}

async function detectRustDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const cargo = await ctx.readFile("Cargo.toml");
  if (!cargo) return { direct_count: 0, dev_count: 0, notable: [] };

  const deps: string[] = [];
  const devDeps: string[] = [];
  const notable: string[] = [];

  const depsMatch = cargo.match(/\[dependencies\]([\s\S]*?)\[/g);
  const devDepsMatch = cargo.match(/\[dev-dependencies\]([\s\S]*?)\[/g);

  if (depsMatch) {
    for (const line of depsMatch[0].split("\n")) {
      const match = line.match(/^(\w+)/);
      if (match) deps.push(match[1]);
    }
  }

  if (devDepsMatch) {
    for (const line of devDepsMatch[0].split("\n")) {
      const match = line.match(/^(\w+)/);
      if (match) devDeps.push(match[1]);
    }
  }

  const allDeps = [...deps, ...devDeps];
  for (const dep of allDeps) {
    if (NOTABLE_PACKAGES.has(dep)) notable.push(dep);
  }

  return {
    direct_count: deps.length,
    dev_count: devDeps.length,
    notable: [...new Set(notable)].sort(),
  };
}

async function detectGoDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const gomod = await ctx.readFile("go.mod");
  if (!gomod) return { direct_count: 0, dev_count: 0, notable: [] };

  const deps: string[] = [];
  const notable: string[] = [];

  for (const line of gomod.split("\n")) {
    const match = line.match(/^\s*require\s+([^\s]+)/);
    if (match) {
      const pkg = match[1];
      deps.push(pkg);
      // Extract package name from path
      const name = pkg.split("/").pop();
      if (name && NOTABLE_PACKAGES.has(name)) notable.push(pkg);
    }
  }

  return {
    direct_count: deps.length,
    dev_count: 0, // Go doesn't separate dev deps
    notable: [...new Set(notable)].sort(),
  };
}

async function detectRubyDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const gemfile = await ctx.readFile("Gemfile");
  if (!gemfile) return { direct_count: 0, dev_count: 0, notable: [] };

  const deps: string[] = [];
  const notable: string[] = [];

  for (const line of gemfile.split("\n")) {
    const match = line.match(/gem\s+["']([^"']+)["']/);
    if (match) {
      deps.push(match[1]);
      if (NOTABLE_PACKAGES.has(match[1])) notable.push(match[1]);
    }
  }

  return {
    direct_count: deps.length,
    dev_count: 0,
    notable: [...new Set(notable)].sort(),
  };
}

async function detectPhpDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const composer = await ctx.readFile("composer.json");
  if (!composer) return { direct_count: 0, dev_count: 0, notable: [] };

  try {
    const pkg = JSON.parse(composer);
    const deps = pkg.require || {};
    const devDeps = pkg["require-dev"] || {};
    const allDeps = { ...deps, ...devDeps };

    const notable = Object.keys(allDeps)
      .filter(d => NOTABLE_PACKAGES.has(d))
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

async function detectJavaDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  const pom = await ctx.readFile("pom.xml");
  const gradle = await ctx.readFile("build.gradle");
  const gradleKts = await ctx.readFile("build.gradle.kts");
  const content = pom + "\n" + gradle + "\n" + gradleKts;

  if (!content.trim()) return { direct_count: 0, dev_count: 0, notable: [] };

  const deps: string[] = [];
  const notable: string[] = [];

  // Simple regex to extract dependencies
  const artifactIdRegex = /<artifactId>([^<]+)<\/artifactId>/g;
  let match;
  while ((match = artifactIdRegex.exec(content)) !== null) {
    deps.push(match[1]);
    if (NOTABLE_PACKAGES.has(match[1])) notable.push(match[1]);
  }

  // Also check for implementation/compile in Gradle
  const gradleDepsRegex = /(?:implementation|compile|api)\s+['"]([^:'"]+)/g;
  while ((match = gradleDepsRegex.exec(content)) !== null) {
    const dep = match[1].split(":").pop();
    if (dep) {
      deps.push(dep);
      if (NOTABLE_PACKAGES.has(dep)) notable.push(dep);
    }
  }

  return {
    direct_count: [...new Set(deps)].length,
    dev_count: 0,
    notable: [...new Set(notable)].sort(),
  };
}

async function detectCSharpDeps(ctx: ScanContext): Promise<{ direct_count: number; dev_count: number; notable: string[] }> {
  // .NET dependencies are in .csproj files - check for PackageReference
  const csprojFiles = ctx.files.filter(f => f.endsWith(".csproj"));
  if (csprojFiles.length === 0) return { direct_count: 0, dev_count: 0, notable: [] };

  const deps: string[] = [];
  const notable: string[] = [];

  for (const file of csprojFiles) {
    const content = await ctx.readFile(file);
    const packageRegex = /<PackageReference\s+Include="([^"]+)"/g;
    let match;
    while ((match = packageRegex.exec(content)) !== null) {
      deps.push(match[1]);
      const name = match[1].split(".")[0].toLowerCase();
      if (NOTABLE_PACKAGES.has(name)) notable.push(match[1]);
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
  if (ctx.fileExists("pnpm-lock.yaml")) return "pnpm-lock.yaml";
  if (ctx.fileExists("yarn.lock")) return "yarn.lock";
  if (ctx.fileExists("package-lock.json")) return "package-lock.json";
  if (ctx.fileExists("bun.lockb") || ctx.fileExists("bun.lock")) return "bun.lock";
  // Rust
  if (ctx.fileExists("Cargo.lock")) return "Cargo.lock";
  // Python
  if (ctx.fileExists("poetry.lock")) return "poetry.lock";
  if (ctx.fileExists("Pipfile.lock")) return "Pipfile.lock";
  if (ctx.fileExists("uv.lock")) return "uv.lock";
  // Go
  if (ctx.fileExists("go.sum")) return "go.sum";
  // Ruby
  if (ctx.fileExists("Gemfile.lock")) return "Gemfile.lock";
  // PHP
  if (ctx.fileExists("composer.lock")) return "composer.lock";
  // Java
  if (ctx.fileExists(".mvn/jvm.config")) return "maven";
  // Kotlin/Gradle
  if (ctx.fileExists(".gradle")) return "gradle";
  // Swift
  if (ctx.fileExists("Package.resolved")) return "swift";
  // Dart/Flutter
  if (ctx.fileExists("pubspec.lock")) return "pubspec.lock";
  // Elixir
  if (ctx.fileExists("mix.lock")) return "mix.lock";
  // Scala
  if (ctx.fileExists("project/target/resolution-cache")) return "sbt";
  // NuGet (.NET)
  if (ctx.fileExists("packages.lock.json")) return "nuget";
  return null;
}

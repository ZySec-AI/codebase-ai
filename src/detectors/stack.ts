import type { Detector, ScanContext } from "../types.js";

const LANG_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".dart": "dart",
  ".ex": "elixir", ".exs": "elixir",
  ".zig": "zig",
};

const FRAMEWORK_MAP: Record<string, string> = {
  "next": "next.js", "react": "react", "react-dom": "react",
  "vue": "vue", "nuxt": "nuxt",
  "@angular/core": "angular", "svelte": "svelte", "@sveltejs/kit": "sveltekit",
  "express": "express", "fastify": "fastify", "hono": "hono", "koa": "koa",
  "nestjs": "nestjs", "@nestjs/core": "nestjs",
  "remix": "remix", "@remix-run/react": "remix",
  "astro": "astro", "gatsby": "gatsby",
  "electron": "electron", "tauri": "tauri",
  "react-native": "react-native", "expo": "expo",
  "@trpc/server": "trpc", "@trpc/client": "trpc",
};

const DB_MARKERS: Record<string, string> = {
  "pg": "postgresql", "postgres": "postgresql",
  "mysql2": "mysql", "mysql": "mysql",
  "better-sqlite3": "sqlite", "sqlite3": "sqlite",
  "mongodb": "mongodb", "mongoose": "mongodb",
  "redis": "redis", "ioredis": "redis",
};

const ORM_MARKERS: Record<string, string> = {
  "prisma": "prisma", "@prisma/client": "prisma",
  "drizzle-orm": "drizzle",
  "typeorm": "typeorm",
  "sequelize": "sequelize",
  "@mikro-orm/core": "mikro-orm",
  "knex": "knex",
  "mongoose": "mongoose",
};

const STYLING_MARKERS: Record<string, string> = {
  "tailwindcss": "tailwindcss",
  "styled-components": "styled-components",
  "@emotion/react": "emotion",
  "sass": "sass",
  "@chakra-ui/react": "chakra-ui",
  "@mui/material": "material-ui",
  "@mantine/core": "mantine",
};

const BUILD_TOOL_MARKERS: Record<string, string> = {
  "vite": "vite",
  "webpack": "webpack",
  "esbuild": "esbuild",
  "tsup": "tsup",
  "rollup": "rollup",
  "parcel": "parcel",
  "turbopack": "turbopack",
  "unbuild": "unbuild",
  "pkgroll": "pkgroll",
  "@swc/core": "swc",
  "snowpack": "snowpack",
};

export const stackDetector: Detector = {
  name: "stack",
  category: "stack",

  async detect(ctx: ScanContext) {
    const languages = detectLanguages(ctx);
    const pkgData = await parsePkgJson(ctx);
    const frameworks = detectFrameworks(pkgData);
    const packageManager = detectPackageManager(ctx, pkgData);
    const databases = detectAllFromMap(pkgData, DB_MARKERS);
    const orm = detectFirstFromMap(pkgData, ORM_MARKERS);
    const styling = detectFirstFromMap(pkgData, STYLING_MARKERS);
    const buildTool = detectFirstFromMap(pkgData, BUILD_TOOL_MARKERS);

    // Prisma: parse schema for actual DB provider instead of guessing
    if (orm === "prisma") {
      const prismaDb = await detectPrismaProvider(ctx);
      if (prismaDb && !databases.includes(prismaDb)) {
        databases.unshift(prismaDb);
      }
    }

    // Python detection
    const pyFramework = await detectPythonFramework(ctx);
    if (pyFramework) frameworks.push(pyFramework);

    // Go detection
    const goFramework = await detectGoFramework(ctx);
    if (goFramework) frameworks.push(goFramework);

    // Rust detection
    const rustFramework = await detectRustFramework(ctx);
    if (rustFramework) frameworks.push(rustFramework);

    return {
      languages: [...new Set(languages)],
      frameworks: [...new Set(frameworks)],
      package_manager: packageManager,
      database: databases.length > 1 ? databases.join(" + ") : databases[0] || null,
      orm,
      styling,
      build_tool: buildTool,
    };
  },
};

function detectLanguages(ctx: ScanContext): string[] {
  const counts: Record<string, number> = {};

  for (const file of ctx.files) {
    if (file.endsWith("/")) continue;
    const ext = "." + file.split(".").pop();
    const lang = LANG_EXTENSIONS[ext];
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  }

  // Sort by frequency, return names
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

async function parsePkgJson(ctx: ScanContext): Promise<Record<string, string>> {
  const content = await ctx.readFile("package.json");
  if (!content) return {};

  try {
    const pkg = JSON.parse(content);
    return {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
  } catch {
    return {};
  }
}

function detectFrameworks(deps: Record<string, string>): string[] {
  const frameworks: string[] = [];

  for (const [dep, version] of Object.entries(deps)) {
    const name = FRAMEWORK_MAP[dep];
    if (name) {
      const cleanVersion = version.replace(/^[\^~>=<]+/, "").split(".").slice(0, 2).join(".");
      frameworks.push(`${name}@${cleanVersion}`);
    }
  }

  return frameworks;
}

function detectPackageManager(ctx: ScanContext, deps: Record<string, string>): string | null {
  if (ctx.fileExists("pnpm-lock.yaml")) return "pnpm";
  if (ctx.fileExists("yarn.lock")) return "yarn";
  if (ctx.fileExists("bun.lockb") || ctx.fileExists("bun.lock")) return "bun";
  if (ctx.fileExists("package-lock.json")) return "npm";
  if (ctx.fileExists("Cargo.lock")) return "cargo";
  if (ctx.fileExists("poetry.lock")) return "poetry";
  if (ctx.fileExists("Pipfile.lock")) return "pipenv";
  if (ctx.fileExists("go.sum")) return "go modules";
  if (ctx.fileExists("Gemfile.lock")) return "bundler";
  if (ctx.fileExists("composer.lock")) return "composer";
  // Fallback: if package.json has deps, npm is the default
  if (Object.keys(deps).length > 0) return "npm";
  return null;
}

function detectFirstFromMap(deps: Record<string, string>, markers: Record<string, string>): string | null {
  for (const dep of Object.keys(deps)) {
    if (markers[dep]) return markers[dep];
  }
  return null;
}

function detectAllFromMap(deps: Record<string, string>, markers: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const dep of Object.keys(deps)) {
    if (markers[dep]) found.add(markers[dep]);
  }
  return [...found];
}

async function detectPrismaProvider(ctx: ScanContext): Promise<string | null> {
  const schema = await ctx.readFile("prisma/schema.prisma");
  if (!schema) return null;

  // Extract the datasource block specifically (not generator)
  const datasourceBlock = schema.match(/datasource\s+\w+\s*\{([^}]+)\}/);
  if (!datasourceBlock) return null;

  const match = datasourceBlock[1].match(/provider\s*=\s*"(.*?)"/);
  if (!match) return null;

  const provider = match[1].toLowerCase();
  if (provider === "postgresql" || provider === "postgres") return "postgresql";
  if (provider === "mysql") return "mysql";
  if (provider === "sqlite") return "sqlite";
  if (provider === "sqlserver") return "sqlserver";
  if (provider === "mongodb") return "mongodb";
  if (provider === "cockroachdb") return "cockroachdb";
  return provider;
}

async function detectPythonFramework(ctx: ScanContext): Promise<string | null> {
  const pyproject = await ctx.readFile("pyproject.toml");
  const requirements = await ctx.readFile("requirements.txt");
  const combined = pyproject + "\n" + requirements;

  if (combined.includes("fastapi")) return "fastapi";
  if (combined.includes("django")) return "django";
  if (combined.includes("flask")) return "flask";
  if (combined.includes("starlette")) return "starlette";
  return null;
}

async function detectGoFramework(ctx: ScanContext): Promise<string | null> {
  const gomod = await ctx.readFile("go.mod");
  if (!gomod) return null;

  if (gomod.includes("github.com/gin-gonic/gin")) return "gin";
  if (gomod.includes("github.com/gofiber/fiber")) return "fiber";
  if (gomod.includes("github.com/labstack/echo")) return "echo";
  if (gomod.includes("github.com/gorilla/mux")) return "gorilla";
  return null;
}

async function detectRustFramework(ctx: ScanContext): Promise<string | null> {
  const cargo = await ctx.readFile("Cargo.toml");
  if (!cargo) return null;

  if (cargo.includes("actix-web")) return "actix-web";
  if (cargo.includes("axum")) return "axum";
  if (cargo.includes("rocket")) return "rocket";
  if (cargo.includes("warp")) return "warp";
  return null;
}

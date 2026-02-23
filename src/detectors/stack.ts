import type { Detector, ScanContext } from "../types.js";

const LANG_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript-react",
  ".js": "javascript",
  ".jsx": "javascript-react",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".dart": "dart",
  ".ex": "elixir",
  ".exs": "elixir",
  ".zig": "zig",
  ".scala": "scala",
  ".sc": "scala",
  ".cpp": "c++",
  ".cc": "c++",
  ".cxx": "c++",
  ".hpp": "c++",
  ".h": "c++",
  ".c": "c",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".ps1": "powershell",
  ".lua": "lua",
  ".r": "r",
  ".R": "r",
  ".m": "matlab",
  ".mlx": "matlab",
  ".jl": "julia",
  ".nim": "nim",
  ".cr": "crystal",
  ".v": "v",
  ".wasm": "webassembly",
  ".wat": "webassembly",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".sol": "solidity",
  ".move": "move",
  ".mo": "motoko",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".xml": "xml",
  ".md": "markdown",
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
  "pg": "postgresql", "postgres": "postgresql", "pg-promise": "postgresql",
  "mysql2": "mysql", "mysql": "mysql", "@mysql/xdevapi": "mysql",
  "better-sqlite3": "sqlite", "sqlite3": "sqlite", "sql.js": "sqlite",
  "mongodb": "mongodb", "mongoose": "mongodb", "mongoodb": "mongodb",
  "redis": "redis", "ioredis": "redis", "@redis/client": "redis", "redis-mock": "redis",
  "cassandra-driver": "cassandra", "express-cassandra": "cassandra",
  "elasticsearch": "elasticsearch", "@elastic/elasticsearch": "elasticsearch",
  "@elastic/elasticsearch-ng": "elasticsearch",
  "neo4j-driver": "neo4j", "neo4j": "neo4j",
  "couchbase": "couchbase", "ottoman": "couchbase",
  "rethinkdb": "rethinkdb", "rethinkdbdash": "rethinkdb",
  "level": "leveldb", "levelup": "leveldb",
  "aws-sdk": "dynamodb", "@aws-sdk/client-dynamodb": "dynamodb",
  "mssql": "mssql", "tedious": "mssql", "msnodesqlv8": "mssql",
  "oracledb": "oracle", "node-oracledb": "oracle",
  "pg-copy-streams": "postgresql",
  "pg-pool": "postgresql", "pg-native": "postgresql",
  " knex": "knex",
  "minio": "minio",
  "firebird": "firebird", "node-firebird": "firebird",
  "hdb-pool": "sap-hana",
  "snowflake-sdk": "snowflake",
  "cassandra-client": "scylladb",
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

    // Multi-language framework detection
    const [pyFramework, goFramework, rustFramework, javaFramework, rubyFramework, phpFramework, csharpFramework] = await Promise.all([
      detectPythonFramework(ctx),
      detectGoFramework(ctx),
      detectRustFramework(ctx),
      detectJavaFramework(ctx),
      detectRubyFramework(ctx),
      detectPhpFramework(ctx),
      detectCSharpFramework(ctx),
    ]);

    if (pyFramework) frameworks.push(pyFramework);
    if (goFramework) frameworks.push(goFramework);
    if (rustFramework) frameworks.push(rustFramework);
    if (javaFramework) frameworks.push(javaFramework);
    if (rubyFramework) frameworks.push(rubyFramework);
    if (phpFramework) frameworks.push(phpFramework);
    if (csharpFramework) frameworks.push(csharpFramework);

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
  const setup = await ctx.readFile("setup.py");
  const combined = pyproject + "\n" + requirements + "\n" + setup;

  if (combined.includes("fastapi")) return "fastapi";
  if (combined.includes("django")) return "django";
  if (combined.includes("flask")) return "flask";
  if (combined.includes("starlette")) return "starlette";
  if (combined.includes("tornado")) return "tornado";
  if (combined.includes("aiohttp")) return "aiohttp";
  if (combined.includes("sanic")) return "sanic";
  if (combined.includes("pyramid")) return "pyramid";
  if (combined.includes("bottle")) return "bottle";
  if (combined.includes("cherrypy")) return "cherrypy";
  if (combined.includes("falcon")) return "falcon";
  if (combined.includes("masonite")) return "masonite";
  // ML frameworks
  if (combined.includes("torch") || combined.includes("pytorch")) return "pytorch";
  if (combined.includes("tensorflow")) return "tensorflow";
  if (combined.includes("keras")) return "keras";
  if (combined.includes("scikit-learn")) return "scikit-learn";
  if (combined.includes("pandas")) return "pandas";
  if (combined.includes("numpy")) return "numpy";
  // Task queues
  if (combined.includes("celery")) return "celery";
  if (combined.includes("rq")) return "rq";
  return null;
}

async function detectGoFramework(ctx: ScanContext): Promise<string | null> {
  const gomod = await ctx.readFile("go.mod");
  if (!gomod) return null;

  if (gomod.includes("github.com/gin-gonic/gin")) return "gin";
  if (gomod.includes("github.com/gofiber/fiber")) return "fiber";
  if (gomod.includes("github.com/labstack/echo")) return "echo";
  if (gomod.includes("github.com/gorilla/mux")) return "gorilla";
  if (gomod.includes("github.com/gorilla/schema")) return "gorilla";
  if (gomod.includes("net/http")) return "net/http (std)";
  if (gomod.includes("go-chi/chi")) return "chi";
  if (gomod.includes("go-chi/chi/v5")) return "chi";
  if (gomod.includes("github.com/go-chi/chi")) return "chi";
  if (gomod.includes("github.com/bxcodec/faker")) return "faker";
  if (gomod.includes("github.com/stretchr/testify")) return "testify";
  if (gomod.includes("grpc")) return "grpc";
  return null;
}

async function detectRustFramework(ctx: ScanContext): Promise<string | null> {
  const cargo = await ctx.readFile("Cargo.toml");
  if (!cargo) return null;

  if (cargo.includes("actix-web")) return "actix-web";
  if (cargo.includes("axum")) return "axum";
  if (cargo.includes("rocket")) return "rocket";
  if (cargo.includes("warp")) return "warp";
  if (cargo.includes("tokio")) return "tokio";
  if (cargo.includes("serde")) return "serde";
  if (cargo.includes("hyper")) return "hyper";
  if (cargo.includes("tonic")) return "tonic (grpc)";
  if (cargo.includes("clap")) return "clap";
  if (cargo.includes("anyhow")) return "anyhow";
  if (cargo.includes("thiserror")) return "thiserror";
  return null;
}

async function detectJavaFramework(ctx: ScanContext): Promise<string | null> {
  const pom = await ctx.readFile("pom.xml");
  const buildGradle = await ctx.readFile("build.gradle");
  const buildGradleKts = await ctx.readFile("build.gradle.kts");
  const combined = pom + "\n" + buildGradle + "\n" + buildGradleKts;

  if (combined.includes("spring-boot")) return "spring boot";
  if (combined.includes("spring-framework")) return "spring";
  if (combined.includes("spring")) return "spring";
  if (combined.includes("micronaut")) return "micronaut";
  if (combined.includes("quarkus")) return "quarkus";
  if (combined.includes("jakarta")) return "jakarta ee";
  if (combined.includes("javax")) return "java ee";
  if (combined.includes("vertx")) return "vert.x";
  if (combined.includes("kafka")) return "kafka";
  return null;
}

async function detectRubyFramework(ctx: ScanContext): Promise<string | null> {
  const gemfile = await ctx.readFile("Gemfile");
  const gemspec = await ctx.readFile(".gemspec");
  const combined = gemfile + "\n" + gemspec;

  if (combined.includes("rails")) return "rails";
  if (combined.includes("sinatra")) return "sinatra";
  if (combined.includes("grape")) return "grape";
  if (combined.includes("hanami")) return "hanami";
  if (combined.includes("roda")) return "roda";
  if (combined.includes("padrino")) return "padrino";
  if (combined.includes("sidekiq")) return "sidekiq";
  if (combined.includes("resque")) return "resque";
  if (combined.includes("puma")) return "puma";
  if (combined.includes("unicorn")) return "unicorn";
  return null;
}

async function detectPhpFramework(ctx: ScanContext): Promise<string | null> {
  const composer = await ctx.readFile("composer.json");
  if (!composer) return null;

  if (composer.includes("laravel")) return "laravel";
  if (composer.includes("symfony")) return "symfony";
  if (composer.includes("slim")) return "slim";
  if (composer.includes("codeigniter")) return "codeigniter";
  if (composer.includes("cakephp")) return "cakephp";
  if (composer.includes("yii")) return "yii";
  if (composer.includes("lumen")) return "lumen";
  if (composer.includes("phpunit")) return "phpunit";
  return null;
}

async function detectCSharpFramework(ctx: ScanContext): Promise<string | null> {
  const csproj = await ctx.readFile(".csproj");
  const sln = await ctx.readFile(".sln");
  const combined = csproj + "\n" + sln;

  if (combined.includes("Microsoft.AspNetCore")) return "asp.net core";
  if (combined.includes("Microsoft.NET.Sdk.Web")) return "asp.net core";
  if (combined.includes("EntityFramework")) return "entity framework";
  if (combined.includes("NUnit")) return "nunit";
  if (combined.includes("xUnit")) return "xunit";
  if (combined.includes("Moq")) return "moq";
  return null;
}

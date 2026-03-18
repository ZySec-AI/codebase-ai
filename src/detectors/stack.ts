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
  next: "next.js",
  react: "react",
  "react-dom": "react",
  vue: "vue",
  nuxt: "nuxt",
  "@angular/core": "angular",
  svelte: "svelte",
  "@sveltejs/kit": "sveltekit",
  express: "express",
  fastify: "fastify",
  hono: "hono",
  koa: "koa",
  nestjs: "nestjs",
  "@nestjs/core": "nestjs",
  remix: "remix",
  "@remix-run/react": "remix",
  astro: "astro",
  gatsby: "gatsby",
  electron: "electron",
  tauri: "tauri",
  "react-native": "react-native",
  expo: "expo",
  "@trpc/server": "trpc",
  "@trpc/client": "trpc",
};

const DB_MARKERS: Record<string, string> = {
  pg: "postgresql",
  postgres: "postgresql",
  "pg-promise": "postgresql",
  mysql2: "mysql",
  mysql: "mysql",
  "@mysql/xdevapi": "mysql",
  "better-sqlite3": "sqlite",
  sqlite3: "sqlite",
  "sql.js": "sqlite",
  mongodb: "mongodb",
  mongoose: "mongodb",
  mongoodb: "mongodb",
  redis: "redis",
  ioredis: "redis",
  "@redis/client": "redis",
  "redis-mock": "redis",
  "cassandra-driver": "cassandra",
  "express-cassandra": "cassandra",
  elasticsearch: "elasticsearch",
  "@elastic/elasticsearch": "elasticsearch",
  "@elastic/elasticsearch-ng": "elasticsearch",
  "neo4j-driver": "neo4j",
  neo4j: "neo4j",
  couchbase: "couchbase",
  ottoman: "couchbase",
  rethinkdb: "rethinkdb",
  rethinkdbdash: "rethinkdb",
  level: "leveldb",
  levelup: "leveldb",
  "aws-sdk": "dynamodb",
  "@aws-sdk/client-dynamodb": "dynamodb",
  mssql: "mssql",
  tedious: "mssql",
  msnodesqlv8: "mssql",
  oracledb: "oracle",
  "node-oracledb": "oracle",
  "pg-copy-streams": "postgresql",
  "pg-pool": "postgresql",
  "pg-native": "postgresql",
  " knex": "knex",
  minio: "minio",
  firebird: "firebird",
  "node-firebird": "firebird",
  "hdb-pool": "sap-hana",
  "snowflake-sdk": "snowflake",
  "cassandra-client": "scylladb",
};

const ORM_MARKERS: Record<string, string> = {
  prisma: "prisma",
  "@prisma/client": "prisma",
  "drizzle-orm": "drizzle",
  typeorm: "typeorm",
  sequelize: "sequelize",
  "@mikro-orm/core": "mikro-orm",
  knex: "knex",
  mongoose: "mongoose",
};

const STYLING_MARKERS: Record<string, string> = {
  tailwindcss: "tailwindcss",
  "styled-components": "styled-components",
  "@emotion/react": "emotion",
  sass: "sass",
  "@chakra-ui/react": "chakra-ui",
  "@mui/material": "material-ui",
  "@mantine/core": "mantine",
};

const BUILD_TOOL_MARKERS: Record<string, string> = {
  vite: "vite",
  webpack: "webpack",
  esbuild: "esbuild",
  tsup: "tsup",
  rollup: "rollup",
  parcel: "parcel",
  turbopack: "turbopack",
  unbuild: "unbuild",
  pkgroll: "pkgroll",
  "@swc/core": "swc",
  snowpack: "snowpack",
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

    // Enhanced database detection from files
    const fileBasedDatabases = await detectDatabasesFromFiles(ctx);
    for (const db of fileBasedDatabases) {
      if (!databases.includes(db)) {
        databases.push(db);
      }
    }

    // Multi-language framework detection
    const [
      pyFramework,
      goFramework,
      rustFramework,
      javaFramework,
      rubyFramework,
      phpFramework,
      csharpFramework,
    ] = await Promise.all([
      detectPythonFramework(ctx),
      detectGoFramework(ctx),
      detectRustFramework(ctx),
      detectJavaFramework(ctx),
      detectRubyFramework(ctx),
      detectPhpFramework(ctx),
      detectCSharpFramework(ctx),
    ]);

    if (pyFramework) {
      frameworks.push(pyFramework);
    }
    if (goFramework) {
      frameworks.push(goFramework);
    }
    if (rustFramework) {
      frameworks.push(rustFramework);
    }
    if (javaFramework) {
      frameworks.push(javaFramework);
    }
    if (rubyFramework) {
      frameworks.push(rubyFramework);
    }
    if (phpFramework) {
      frameworks.push(phpFramework);
    }
    if (csharpFramework) {
      frameworks.push(csharpFramework);
    }

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
    if (file.endsWith("/")) {
      continue;
    }
    const ext = "." + file.split(".").pop();
    const lang = LANG_EXTENSIONS[ext];
    if (lang) {
      counts[lang] = (counts[lang] || 0) + 1;
    }
  }

  // Sort by frequency, return names
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

async function parsePkgJson(ctx: ScanContext): Promise<Record<string, string>> {
  const content = await ctx.readFile("package.json");
  if (!content) {
    return {};
  }

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
      const cleanVersion = version
        .replace(/^[\^~>=<]+/, "")
        .split(".")
        .slice(0, 2)
        .join(".");
      frameworks.push(`${name}@${cleanVersion}`);
    }
  }

  // Enhanced framework detection from files
  const enhancedFrameworks = detectEnhancedFrameworks(deps);
  frameworks.push(...enhancedFrameworks);

  return [...new Set(frameworks)];
}

/**
 * Enhanced framework detection with detailed information
 */
function detectEnhancedFrameworks(deps: Record<string, string>): string[] {
  const frameworks: string[] = [];
  const allDeps = Object.keys(deps).join(" ");

  // Next.js detection (app router vs pages router)
  if (allDeps.includes("next")) {
    const version = deps["next"]
      ?.replace(/^[\^~>=<]+/, "")
      .split(".")
      .slice(0, 2)
      .join(".");
    const details = [];

    if (version) {
      // Next.js 13+ has app router
      if (parseFloat(version) >= 13) {
        details.push("app-router available");
      }
      details.push(version);
    }

    frameworks.push(details.length > 0 ? `next.js@${details.join(" ")}` : "next.js");
  }

  // Vue detection (Vue 2 vs Vue 3)
  if (allDeps.includes("vue")) {
    const version = deps["vue"]?.replace(/^[\^~>=<]+/, "");
    if (version) {
      const majorVersion = parseInt(version.split(".")[0], 10);
      frameworks.push(majorVersion >= 3 ? `vue@${version}` : `vue@${version}`);
    } else {
      frameworks.push("vue");
    }

    // Nuxt detection
    if (allDeps.includes("nuxt")) {
      const nuxtVersion = deps["nuxt"]?.replace(/^[\^~>=<]+/, "");
      if (nuxtVersion) {
        const majorVersion = parseInt(nuxtVersion.split(".")[0], 10);
        frameworks.push(
          majorVersion >= 3 ? `nuxt@${nuxtVersion} (Nuxt 3)` : `nuxt@${nuxtVersion} (Nuxt 2)`
        );
      } else {
        frameworks.push("nuxt");
      }
    }
  }

  // SvelteKit detection
  if (allDeps.includes("@sveltejs/kit")) {
    const version = deps["@sveltejs/kit"]?.replace(/^[\^~>=<]+/, "");
    frameworks.push(version ? `sveltekit@${version}` : "sveltekit");
  }

  // Astro detection
  if (allDeps.includes("astro")) {
    const version = deps["astro"]?.replace(/^[\^~>=<]+/, "");
    const integrations: string[] = [];

    // Detect Astro integrations
    if (deps["@astrojs/react"]) {
      integrations.push("react");
    }
    if (deps["@astrojs/vue"]) {
      integrations.push("vue");
    }
    if (deps["@astrojs/svelte"]) {
      integrations.push("svelte");
    }
    if (deps["@astrojs/preact"]) {
      integrations.push("preact");
    }
    if (deps["@astrojs/solid-js"]) {
      integrations.push("solid");
    }

    if (integrations.length > 0) {
      frameworks.push(
        version
          ? `astro@${version} (${integrations.join(", ")})`
          : `astro (${integrations.join(", ")})`
      );
    } else {
      frameworks.push(version ? `astro@${version}` : "astro");
    }
  }

  // Remix detection
  if (allDeps.includes("@remix-run/react") || allDeps.includes("@remix-run/node")) {
    const version =
      deps["@remix-run/react"]?.replace(/^[\^~>=<]+/, "") ||
      deps["@remix-run/node"]?.replace(/^[\^~>=<]+/, "");
    frameworks.push(version ? `remix@${version}` : "remix");
  }

  // Angular detection
  if (allDeps.includes("@angular/core")) {
    const version = deps["@angular/core"]
      ?.replace(/^[\^~>=<]+/, "")
      .split(".")
      .slice(0, 2)
      .join(".");
    frameworks.push(version ? `angular@${version}` : "angular");
  }

  // Gatsby detection
  if (allDeps.includes("gatsby")) {
    const version = deps["gatsby"]?.replace(/^[\^~>=<]+/, "");
    frameworks.push(version ? `gatsby@${version}` : "gatsby");
  }

  return frameworks;
}

function detectPackageManager(ctx: ScanContext, deps: Record<string, string>): string | null {
  if (ctx.fileExists("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (ctx.fileExists("yarn.lock")) {
    return "yarn";
  }
  if (ctx.fileExists("bun.lockb") || ctx.fileExists("bun.lock")) {
    return "bun";
  }
  if (ctx.fileExists("package-lock.json")) {
    return "npm";
  }
  if (ctx.fileExists("Cargo.lock")) {
    return "cargo";
  }
  if (ctx.fileExists("poetry.lock")) {
    return "poetry";
  }
  if (ctx.fileExists("Pipfile.lock")) {
    return "pipenv";
  }
  if (ctx.fileExists("go.sum")) {
    return "go modules";
  }
  if (ctx.fileExists("Gemfile.lock")) {
    return "bundler";
  }
  if (ctx.fileExists("composer.lock")) {
    return "composer";
  }
  // Fallback: if package.json has deps, npm is the default
  if (Object.keys(deps).length > 0) {
    return "npm";
  }
  return null;
}

function detectFirstFromMap(
  deps: Record<string, string>,
  markers: Record<string, string>
): string | null {
  for (const dep of Object.keys(deps)) {
    if (markers[dep]) {
      return markers[dep];
    }
  }
  return null;
}

function detectAllFromMap(deps: Record<string, string>, markers: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const dep of Object.keys(deps)) {
    if (markers[dep]) {
      found.add(markers[dep]);
    }
  }
  return [...found];
}

async function detectPrismaProvider(ctx: ScanContext): Promise<string | null> {
  const schema = await ctx.readFile("prisma/schema.prisma");
  if (!schema) {
    return null;
  }

  // Extract the datasource block specifically (not generator)
  const datasourceBlock = schema.match(/datasource\s+\w+\s*\{([^}]+)\}/);
  if (!datasourceBlock) {
    return null;
  }

  const match = datasourceBlock[1].match(/provider\s*=\s*"(.*?)"/);
  if (!match) {
    return null;
  }

  const provider = match[1].toLowerCase();
  if (provider === "postgresql" || provider === "postgres") {
    return "postgresql";
  }
  if (provider === "mysql") {
    return "mysql";
  }
  if (provider === "sqlite") {
    return "sqlite";
  }
  if (provider === "sqlserver") {
    return "sqlserver";
  }
  if (provider === "mongodb") {
    return "mongodb";
  }
  if (provider === "cockroachdb") {
    return "cockroachdb";
  }
  return provider;
}

async function detectDatabasesFromFiles(ctx: ScanContext): Promise<string[]> {
  const databases: string[] = [];

  // Detect from migration files
  const migrationDirs = [
    "migrations/",
    "prisma/migrations/",
    "db/migrate/",
    "database/migrations/",
    "src/migrations/",
    "server/migrations/",
    "api/migrations/",
    "migrate/",
    "sql/",
    "db/sql/",
  ];

  for (const dir of migrationDirs) {
    if (ctx.files.some((f) => f.startsWith(dir))) {
      // Try to detect DB type from migration files
      const dbType = await detectDBFromMigrations(ctx, dir);
      if (dbType && !databases.includes(dbType)) {
        databases.push(dbType);
      }
    }
  }

  // Detect from Docker Compose
  const dockerDatabases = await detectDBFromDockerCompose(ctx);
  for (const db of dockerDatabases) {
    if (!databases.includes(db)) {
      databases.push(db);
    }
  }

  // Detect from ORM configs
  const ormDatabases = await detectDBFromORMConfigs(ctx);
  for (const db of ormDatabases) {
    if (!databases.includes(db)) {
      databases.push(db);
    }
  }

  // Detect from SQL schema files
  const schemaDatabases = await detectDBFromSchemas(ctx);
  for (const db of schemaDatabases) {
    if (!databases.includes(db)) {
      databases.push(db);
    }
  }

  return databases;
}

async function detectDBFromMigrations(ctx: ScanContext, dir: string): Promise<string | null> {
  const files = ctx.files.filter((f) => f.startsWith(dir));

  for (const file of files) {
    const content = await ctx.readFile(file);
    if (!content) {
      continue;
    }

    const lower = content.toLowerCase();
    if (lower.includes("create table") || lower.includes("alter table")) {
      if (lower.includes("postgresql") || lower.includes("serial") || lower.includes("bigserial")) {
        return "postgresql";
      }
      if (lower.includes("mysql") || lower.includes("engine=innodb")) {
        return "mysql";
      }
      if (lower.includes("sqlite")) {
        return "sqlite";
      }
      if (lower.includes("mongodb") || lower.includes("mongoose")) {
        return "mongodb";
      }
      if (lower.includes("redis")) {
        return "redis";
      }
      if (lower.includes("elasticsearch")) {
        return "elasticsearch";
      }
    }
  }

  return null;
}

async function detectDBFromDockerCompose(ctx: ScanContext): Promise<string[]> {
  const found: string[] = [];
  const composeFiles = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "docker-compose.dev.yml",
    "docker-compose.prod.yml",
    "compose.yml",
    "compose.yaml",
  ];

  for (const file of composeFiles) {
    if (!ctx.fileExists(file)) {
      continue;
    }

    const content = await ctx.readFile(file);
    if (!content) {
      continue;
    }

    const lower = content.toLowerCase();

    // Detect database services
    if (lower.includes("postgres") || lower.includes("postgresql")) {
      found.push("postgresql");
    }
    if (lower.includes("mysql")) {
      found.push("mysql");
    }
    if (lower.includes("mariadb")) {
      found.push("mariadb");
    }
    if (lower.includes("mongodb") || lower.includes("mongo")) {
      found.push("mongodb");
    }
    if (lower.includes("redis")) {
      found.push("redis");
    }
    if (lower.includes("elasticsearch")) {
      found.push("elasticsearch");
    }
    if (lower.includes("cassandra")) {
      found.push("cassandra");
    }
    if (lower.includes("couchdb")) {
      found.push("couchdb");
    }
    if (lower.includes("neo4j")) {
      found.push("neo4j");
    }
    if (lower.includes("rabbitmq")) {
      found.push("rabbitmq");
    }
    if (lower.includes("dynamodb")) {
      found.push("dynamodb");
    }
  }

  return found;
}

async function detectDBFromORMConfigs(ctx: ScanContext): Promise<string[]> {
  const found: string[] = [];

  // TypeORM
  const typeormConfig =
    (await ctx.readFile("ormconfig.json")) ||
    (await ctx.readFile("ormconfig.js")) ||
    (await ctx.readFile("src/data-source.ts"));
  if (typeormConfig) {
    const lower = typeormConfig.toLowerCase();
    if (lower.includes("postgres") || lower.includes("pg")) {
      found.push("postgresql");
    }
    if (lower.includes("mysql")) {
      found.push("mysql");
    }
    if (lower.includes("sqlite")) {
      found.push("sqlite");
    }
    if (lower.includes("mongodb")) {
      found.push("mongodb");
    }
  }

  // Sequelize config
  const sequelizeFiles = [".sequelizerc", "config/database.js", "config/config.js"];
  for (const file of sequelizeFiles) {
    const content = await ctx.readFile(file);
    if (content) {
      const lower = content.toLowerCase();
      if (lower.includes("postgres")) {
        found.push("postgresql");
      }
      if (lower.includes("mysql")) {
        found.push("mysql");
      }
      if (lower.includes("sqlite")) {
        found.push("sqlite");
      }
      if (lower.includes("mariadb")) {
        found.push("mariadb");
      }
    }
  }

  // MikroORM
  const mikroOrmConfig =
    (await ctx.readFile("mikro-orm.config.ts")) || (await ctx.readFile("mikro-orm.config.js"));
  if (mikroOrmConfig) {
    const lower = mikroOrmConfig.toLowerCase();
    if (lower.includes("postgres")) {
      found.push("postgresql");
    }
    if (lower.includes("mysql")) {
      found.push("mysql");
    }
    if (lower.includes("sqlite")) {
      found.push("sqlite");
    }
    if (lower.includes("mongodb")) {
      found.push("mongodb");
    }
  }

  // Drizzle config
  const drizzleFiles = ["drizzle.config.ts", "drizzle.config.js", "drizzle.config.json"];
  for (const file of drizzleFiles) {
    const content = await ctx.readFile(file);
    if (content) {
      const lower = content.toLowerCase();
      if (lower.includes("postgres") || lower.includes("pg")) {
        found.push("postgresql");
      }
      if (lower.includes("mysql")) {
        found.push("mysql");
      }
      if (lower.includes("sqlite")) {
        found.push("sqlite");
      }
    }
  }

  return found;
}

async function detectDBFromSchemas(ctx: ScanContext): Promise<string[]> {
  const found: string[] = [];

  // Look for SQL schema files
  const schemaFiles = ctx.files.filter(
    (f) =>
      f.endsWith(".sql") || f.includes("schema") || f.includes("migrate") || f.includes("migration")
  );

  for (const file of schemaFiles) {
    const content = await ctx.readFile(file);
    if (!content) {
      continue;
    }

    const lower = content.toLowerCase();

    // PostgreSQL-specific patterns
    if (
      lower.includes("serial") ||
      lower.includes("bigserial") ||
      lower.includes("text[]") ||
      lower.includes("jsonb") ||
      lower.includes("create extension") ||
      lower.includes("pg_")
    ) {
      if (!found.includes("postgresql")) {
        found.push("postgresql");
      }
    }

    // MySQL-specific patterns
    if (
      lower.includes("engine=innodb") ||
      lower.includes("auto_increment") ||
      lower.includes("tinyint") ||
      lower.includes("mediumint") ||
      lower.includes("enum(")
    ) {
      if (!found.includes("mysql")) {
        found.push("mysql");
      }
    }

    // SQLite-specific patterns
    if (lower.includes("autoincrement") || lower.includes("integer primary key")) {
      if (!found.includes("sqlite")) {
        found.push("sqlite");
      }
    }
  }

  return found;
}

async function detectPythonFramework(ctx: ScanContext): Promise<string | null> {
  const pyproject = await ctx.readFile("pyproject.toml");
  const requirements = await ctx.readFile("requirements.txt");
  const setup = await ctx.readFile("setup.py");
  const combined = pyproject + "\n" + requirements + "\n" + setup;

  // Web frameworks
  if (combined.includes("fastapi")) {
    const version = extractVersion(requirements, "fastapi") || extractVersion(pyproject, "fastapi");
    return version ? `fastapi@${version}` : "fastapi";
  }
  if (combined.includes("django")) {
    const version = extractVersion(requirements, "django") || extractVersion(pyproject, "django");
    const djangoDetails: string[] = [];
    if (version) {
      djangoDetails.push(version);
    }

    // Detect Django apps
    const djangoApps = await detectDjangoApps(ctx);
    if (djangoApps.length > 0) {
      djangoDetails.push(`apps: ${djangoApps.join(", ")}`);
    }

    // Detect Django settings
    const settingsModule = await detectDjangoSettings(ctx);
    if (settingsModule) {
      djangoDetails.push(settingsModule);
    }

    return djangoDetails.length > 0
      ? `django@${djangoDetails.join(" ")}`
      : version
        ? `django@${version}`
        : "django";
  }
  if (combined.includes("flask")) {
    const version = extractVersion(requirements, "flask") || extractVersion(pyproject, "flask");
    return version ? `flask@${version}` : "flask";
  }
  if (combined.includes("starlette")) {
    return "starlette";
  }
  if (combined.includes("tornado")) {
    return "tornado";
  }
  if (combined.includes("aiohttp")) {
    return "aiohttp";
  }
  if (combined.includes("sanic")) {
    return "sanic";
  }
  if (combined.includes("pyramid")) {
    return "pyramid";
  }
  if (combined.includes("bottle")) {
    return "bottle";
  }
  if (combined.includes("cherrypy")) {
    return "cherrypy";
  }
  if (combined.includes("falcon")) {
    return "falcon";
  }
  if (combined.includes("masonite")) {
    return "masonite";
  }

  // ML frameworks
  if (combined.includes("torch") || combined.includes("pytorch")) {
    return "pytorch";
  }
  if (combined.includes("tensorflow")) {
    return "tensorflow";
  }
  if (combined.includes("keras")) {
    return "keras";
  }
  if (combined.includes("scikit-learn")) {
    return "scikit-learn";
  }
  if (combined.includes("pandas")) {
    return "pandas";
  }
  if (combined.includes("numpy")) {
    return "numpy";
  }

  // Task queues
  if (combined.includes("celery")) {
    return "celery";
  }
  if (combined.includes("rq")) {
    return "rq";
  }

  return null;
}

/**
 * Detect Django apps from settings.py or settings/
 */
async function detectDjangoApps(ctx: ScanContext): Promise<string[]> {
  const apps: string[] = [];

  // Try to find settings file
  const settingsFiles = ctx.files.filter(
    (f) => f.includes("settings.py") || f.includes("settings/") || f.match(/settings.*\.py$/)
  );

  for (const file of settingsFiles.slice(0, 3)) {
    // Check at most 3 files
    try {
      const content = await ctx.readFile(file);
      if (!content) {
        continue;
      }

      // Find INSTALLED_APPS
      const installedAppsMatch = content.match(/INSTALLED_APPS\s*=\s*\[([\s\S]*?)\]/);
      if (installedAppsMatch) {
        const appsContent = installedAppsMatch[1];
        // Extract app names (simple extraction)
        const appMatches = appsContent.match(/'([^']+)'/g) || appsContent.match(/"([^"]+)"/g) || [];
        for (const app of appMatches) {
          const appName = app.replace(/['"]/g, "");
          // Filter out django apps and third-party apps
          if (!appName.startsWith("django.") && appName.includes(".")) {
            apps.push(appName.split(".")[0]);
          }
        }
      }
    } catch {
      // Skip errors reading settings files
    }
  }

  return [...new Set(apps)].slice(0, 5); // Return up to 5 apps
}

/**
 * Detect Django settings module
 */
async function detectDjangoSettings(ctx: ScanContext): Promise<string | null> {
  const hasSettingsPy = ctx.files.some((f) => f.endsWith("settings.py"));
  const hasSettingsDir = ctx.files.some((f) => f.includes("settings/") && f.endsWith(".py"));
  const hasDevSettings = ctx.files.some(
    (f) => f.includes("settings_dev.py") || f.includes("settings.dev")
  );

  if (hasDevSettings) {
    return "settings:dev";
  }
  if (hasSettingsDir) {
    return "settings:dir";
  }
  if (hasSettingsPy) {
    return "settings:py";
  }

  return null;
}

async function detectGoFramework(ctx: ScanContext): Promise<string | null> {
  const gomod = await ctx.readFile("go.mod");
  if (!gomod) {
    return null;
  }

  const versions: string[] = [];

  if (gomod.includes("github.com/gin-gonic/gin")) {
    const version = extractGoVersion(gomod, "github.com/gin-gonic/gin");
    versions.push(version ? `gin@${version}` : "gin");
  }
  if (gomod.includes("github.com/gofiber/fiber")) {
    const version = extractGoVersion(gomod, "github.com/gofiber/fiber");
    versions.push(version ? `fiber@${version}` : "fiber");
  }
  if (gomod.includes("github.com/labstack/echo")) {
    const version = extractGoVersion(gomod, "github.com/labstack/echo");
    versions.push(version ? `echo@${version}` : "echo");
  }
  if (gomod.includes("github.com/gorilla/mux")) {
    const version = extractGoVersion(gomod, "github.com/gorilla/mux");
    versions.push(version ? `gorilla/mux@${version}` : "gorilla/mux");
  }
  if (gomod.includes("go-chi/chi")) {
    const version = extractGoVersion(gomod, "go-chi/chi");
    versions.push(version ? `chi@${version}` : "chi");
  }
  if (gomod.includes("grpc")) {
    versions.push("grpc");
  }
  if (gomod.includes("net/http")) {
    versions.push("net/http (std)");
  }

  return versions.length > 0 ? versions.join(", ") : null;
}

async function detectRustFramework(ctx: ScanContext): Promise<string | null> {
  const cargo = await ctx.readFile("Cargo.toml");
  if (!cargo) {
    return null;
  }

  const versions: string[] = [];

  if (cargo.includes("actix-web")) {
    const version = extractCargoVersion(cargo, "actix-web");
    versions.push(version ? `actix-web@${version}` : "actix-web");
  }
  if (cargo.includes("axum")) {
    const version = extractCargoVersion(cargo, "axum");
    versions.push(version ? `axum@${version}` : "axum");
  }
  if (cargo.includes("rocket")) {
    const version = extractCargoVersion(cargo, "rocket");
    versions.push(version ? `rocket@${version}` : "rocket");
  }
  if (cargo.includes("warp")) {
    versions.push("warp");
  }
  if (cargo.includes("tokio")) {
    const version = extractCargoVersion(cargo, "tokio");
    versions.push(version ? `tokio@${version}` : "tokio");
  }
  if (cargo.includes("hyper")) {
    versions.push("hyper");
  }
  if (cargo.includes("tonic")) {
    versions.push("tonic (grpc)");
  }

  return versions.length > 0 ? versions.join(", ") : null;
}

async function detectJavaFramework(ctx: ScanContext): Promise<string | null> {
  const pom = await ctx.readFile("pom.xml");
  const buildGradle = await ctx.readFile("build.gradle");
  const buildGradleKts = await ctx.readFile("build.gradle.kts");
  const combined = pom + "\n" + buildGradle + "\n" + buildGradleKts;

  if (combined.includes("spring-boot")) {
    const version =
      extractFromXml(pom, "spring-boot-starter-parent") ||
      extractFromGradle(buildGradle, "org.springframework.boot");
    return version ? `spring boot@${version}` : "spring boot";
  }
  if (combined.includes("spring-framework") || combined.includes("spring-core")) {
    const version =
      extractFromXml(pom, "spring-framework") ||
      extractFromGradle(buildGradle, "org.springframework");
    return version ? `spring@${version}` : "spring";
  }
  if (combined.includes("micronaut")) {
    const version =
      extractFromXml(pom, "micronaut") || extractFromGradle(buildGradle, "io.micronaut");
    return version ? `micronaut@${version}` : "micronaut";
  }
  if (combined.includes("quarkus")) {
    const version = extractFromXml(pom, "quarkus") || extractFromGradle(buildGradle, "io.quarkus");
    return version ? `quarkus@${version}` : "quarkus";
  }
  if (combined.includes("jakarta")) {
    return "jakarta ee";
  }
  if (combined.includes("javax")) {
    return "java ee";
  }
  if (combined.includes("vertx")) {
    return "vert.x";
  }
  if (combined.includes("kafka")) {
    return "kafka";
  }

  return null;
}

async function detectRubyFramework(ctx: ScanContext): Promise<string | null> {
  const gemfile = await ctx.readFile("Gemfile");
  const gemspec = await ctx.readFile(".gemspec");
  const combined = gemfile + "\n" + gemspec;

  if (combined.includes("rails")) {
    const version = extractGemVersion(combined, "rails");
    const details: string[] = [];
    if (version) {
      details.push(version);
    }

    // Detect Rails middleware stack
    const middlewareStack = await detectRailsMiddleware(ctx);
    if (middlewareStack.length > 0) {
      details.push(middlewareStack.join(", "));
    }

    return details.length > 0 ? `rails@${details.join(" ")}` : `rails@${version || "unknown"}`;
  }
  if (combined.includes("sinatra")) {
    const version = extractGemVersion(combined, "sinatra");
    return version ? `sinatra@${version}` : "sinatra";
  }
  if (combined.includes("grape")) {
    return "grape";
  }
  if (combined.includes("hanami")) {
    return "hanami";
  }
  if (combined.includes("roda")) {
    return "roda";
  }
  if (combined.includes("padrino")) {
    return "padrino";
  }
  if (combined.includes("sidekiq")) {
    return "sidekiq";
  }
  if (combined.includes("resque")) {
    return "resque";
  }
  if (combined.includes("puma")) {
    return "puma";
  }
  if (combined.includes("unicorn")) {
    return "unicorn";
  }

  return null;
}

/**
 * Detect Rails middleware stack from config/application.rb or config/environment files
 */
async function detectRailsMiddleware(ctx: ScanContext): Promise<string[]> {
  const middleware: string[] = [];

  // Check for common Rails gems
  const gemfile = await ctx.readFile("Gemfile");
  if (gemfile) {
    if (gemfile.includes("devise")) {
      middleware.push("devise");
    }
    if (gemfile.includes("pundit")) {
      middleware.push("pundit");
    }
    if (gemfile.includes("cancancan")) {
      middleware.push("cancancan");
    }
    if (gemfile.includes("rspec-rails")) {
      middleware.push("rspec");
    }
    if (gemfile.includes("minitest")) {
      middleware.push("minitest");
    }
    if (gemfile.includes("factory_bot_rails")) {
      middleware.push("factory_bot");
    }
    if (gemfile.includes("faker")) {
      middleware.push("faker");
    }
    if (gemfile.includes("sidekiq")) {
      middleware.push("sidekiq");
    }
    if (gemfile.includes("redis") || gemfile.includes("redis-rails")) {
      middleware.push("redis");
    }
    if (gemfile.includes("pg")) {
      middleware.push("postgresql");
    }
    if (gemfile.includes("mysql2")) {
      middleware.push("mysql");
    }
    if (gemfile.includes("sqlite3")) {
      middleware.push("sqlite");
    }
    if (gemfile.includes("aws-sdk")) {
      middleware.push("aws");
    }
    if (gemfile.includes("bootstrap")) {
      middleware.push("bootstrap");
    }
    if (gemfile.includes("tailwindcss-rails")) {
      middleware.push("tailwind");
    }
  }

  return middleware.slice(0, 5); // Return up to 5 middleware components
}

async function detectPhpFramework(ctx: ScanContext): Promise<string | null> {
  const composer = await ctx.readFile("composer.json");
  if (!composer) {
    return null;
  }

  try {
    const pkg = JSON.parse(composer);
    const deps = { ...(pkg.require || {}), ...(pkg["require-dev"] || {}) };
    const combined = Object.keys(deps).join(" ");

    if (combined.includes("laravel")) {
      const version = deps["laravel/framework"] || deps["laravel/lumen"];
      return version ? `laravel@${version.replace(/^[\^~>=<]+/, "")}` : "laravel";
    }
    if (combined.includes("symfony")) {
      const version = deps["symfony/framework-bundle"];
      return version ? `symfony@${version.replace(/^[\^~>=<]+/, "")}` : "symfony";
    }
    if (combined.includes("slim")) {
      const version = deps["slim/slim"];
      return version ? `slim@${version.replace(/^[\^~>=<]+/, "")}` : "slim";
    }
    if (combined.includes("codeigniter")) {
      return "codeigniter";
    }
    if (combined.includes("cakephp")) {
      return "cakephp";
    }
    if (combined.includes("yii")) {
      const version = deps["yiisoft/yii2"];
      return version ? `yii@${version.replace(/^[\^~>=<]+/, "")}` : "yii";
    }
    if (combined.includes("lumen")) {
      return "lumen";
    }
  } catch {}

  return null;
}

async function detectCSharpFramework(ctx: ScanContext): Promise<string | null> {
  const csprojFiles = ctx.files.filter((f) => f.endsWith(".csproj"));
  if (csprojFiles.length === 0) {
    return null;
  }

  const frameworks: string[] = [];

  for (const file of csprojFiles) {
    const content = await ctx.readFile(file);

    if (content.includes("Microsoft.AspNetCore")) {
      const version = extractCsprojVersion(content, "Microsoft.AspNetCore.App");
      frameworks.push(version ? `asp.net core@${version}` : "asp.net core");
    }
    if (content.includes("EntityFramework")) {
      frameworks.push("entity framework");
    }
    if (content.includes("NUnit")) {
      frameworks.push("nunit");
    }
    if (content.includes("xUnit")) {
      frameworks.push("xunit");
    }
    if (content.includes("Moq")) {
      frameworks.push("moq");
    }
  }

  return frameworks.length > 0 ? frameworks.join(", ") : null;
}

// Helper functions for version extraction

function extractVersion(content: string, packageName: string): string | null {
  if (!content) {
    return null;
  }

  // Match patterns like "package==1.2.3", "package>=1.2.3", "package@1.2.3"
  const patterns = [
    new RegExp(`${packageName}===?\\s*([\\d.]+)`), // === or ==
    new RegExp(`${packageName}>=?\\s*([\\d.]+)`), // >= or >
    new RegExp(`${packageName}~=?\\s*([\\d.]+)`), // ~= or ~
    new RegExp(`${packageName}@([\\d.]+)`), // @
    new RegExp(`"${packageName}":\\s*"([\\d.]+)"`), // JSON format
    new RegExp(`'${packageName}':\\s*'([\\d.]+)'`), // JSON single quotes
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractGoVersion(content: string, packageName: string): string | null {
  // Go modules format: package version v1.2.3
  const pattern = new RegExp(`${packageName}\\s+v([\\d.]+)`);
  const match = content.match(pattern);
  return match ? match[1] : null;
}

function extractCargoVersion(content: string, packageName: string): string | null {
  // Cargo.toml format: package = "1.2.3"
  const pattern = new RegExp(`${packageName}\\s*=\\s*"([\\d.]+)"`);
  const match = content.match(pattern);
  return match ? match[1] : null;
}

function extractFromXml(content: string, artifactId: string): string | null {
  if (!content) {
    return null;
  }

  // Match <version>1.2.3</version> within a dependency with matching artifactId
  const pattern = new RegExp(
    `<artifactId>${artifactId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</artifactId>[\\s\\S]*?<version>([\\d.]+)</version>`
  );
  const match = content.match(pattern);
  return match ? match[1] : null;
}

function extractFromGradle(content: string, group: string): string | null {
  if (!content) {
    return null;
  }

  // Match version: "group:version:1.2.3" or group/version patterns
  const patterns = [
    new RegExp(`${group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:[^:]*:([\\d.]+)`),
    new RegExp(`${group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:([\\d.]+)`),
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractGemVersion(content: string, gemName: string): string | null {
  // Rubygems format: gem "package", "1.2.3" or gem "package", "~> 1.2.3"
  const pattern = new RegExp(`gem\\s+['"]${gemName}['"][^,]*,\\s*['"]~?>?\\s*([\\d.]+)['"]`);
  const match = content.match(pattern);
  return match ? match[1] : null;
}

function extractCsprojVersion(content: string, packageRef: string): string | null {
  // .csproj format: <PackageReference Include="..." Version="1.2.3" />
  const pattern = new RegExp(
    `<PackageReference\\s+Include="${packageRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*Version="([\\d.]+)"`
  );
  const match = content.match(pattern);
  return match ? match[1] : null;
}

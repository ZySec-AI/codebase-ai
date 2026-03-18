import type { Detector, ScanContext } from "../types.js";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  app: "routes and pages",
  api: "API routes",
  pages: "page components",
  components: "reusable UI components",
  lib: "shared utilities",
  utils: "utility functions",
  helpers: "helper functions",
  hooks: "React hooks",
  services: "business logic / services",
  models: "data models",
  controllers: "request handlers",
  middleware: "middleware",
  routes: "routing",
  store: "state management",
  stores: "state stores",
  types: "type definitions",
  interfaces: "interface definitions",
  schemas: "validation schemas",
  config: "configuration",
  constants: "constants",
  assets: "static assets",
  styles: "stylesheets",
  tests: "test files",
  __tests__: "test files",
  test: "test files",
  spec: "test specifications",
  features: "feature modules",
  modules: "application modules",
  plugins: "plugin system",
  providers: "context providers",
  contexts: "React contexts",
  // CLI / tool patterns
  commands: "CLI commands",
  cmd: "CLI commands",
  cli: "CLI interface",
  detectors: "detection / analysis modules",
  scanners: "scanning modules",
  scanner: "scanning engine",
  integrations: "third-party integrations",
  adapters: "adapters / connectors",
  handlers: "event / request handlers",
  resolvers: "GraphQL resolvers",
  guards: "auth / route guards",
  pipes: "data transform pipes",
  decorators: "decorators",
  validators: "validation logic",
  migrations: "database migrations",
  seeds: "database seed data",
  fixtures: "test fixtures",
  mocks: "test mocks",
  stubs: "test stubs",
  github: "GitHub integration",
  git: "git integration",
  mcp: "MCP server / protocol",
  server: "HTTP / API server",
  client: "client-side code",
  core: "core business logic",
  domain: "domain logic",
  infra: "infrastructure",
  db: "database layer",
  database: "database layer",
  auth: "authentication / authorization",
  email: "email handling",
  notifications: "notification system",
  jobs: "background jobs / workers",
  workers: "background workers",
  queues: "job / message queues",
  events: "event system",
  shared: "shared / cross-cutting code",
  common: "common utilities",
  internal: "internal modules",
  pkg: "packages / library code",
  proto: "protobuf definitions",
  generated: "auto-generated code",
  scripts: "build / utility scripts",
  tools: "development tools",
  docs: "documentation",
};

export const patternsDetector: Detector = {
  name: "patterns",
  category: "patterns",

  async detect(ctx: ScanContext) {
    return {
      architecture: detectArchitecture(ctx),
      state_management: await detectStateManagement(ctx),
      api_style: await detectApiStyle(ctx),
      key_modules: detectKeyModules(ctx),
    };
  },
};

function detectArchitecture(ctx: ScanContext): string | null {
  // Next.js App Router
  if (ctx.files.some((f) => f.match(/^(src\/)?app\/layout\.(tsx?|jsx?)$/))) {
    return "app-router";
  }

  // Next.js Pages Router
  if (ctx.files.some((f) => f.match(/^(src\/)?pages\/_app\./))) {
    return "pages-router";
  }

  // MVC
  if (
    ctx.files.some((f) => f.includes("/controllers/")) &&
    ctx.files.some((f) => f.includes("/models/"))
  ) {
    return "mvc";
  }

  // Feature-sliced
  if (ctx.files.some((f) => f.startsWith("src/features/"))) {
    return "feature-sliced";
  }

  // Modular (src/modules/)
  if (ctx.files.some((f) => f.startsWith("src/modules/"))) {
    return "modular";
  }

  // Layered (services + repositories)
  if (
    ctx.files.some((f) => f.includes("/services/")) &&
    ctx.files.some((f) => f.includes("/repositories/"))
  ) {
    return "layered";
  }

  // File-based routing (SvelteKit, Remix)
  if (ctx.files.some((f) => f.startsWith("src/routes/"))) {
    return "file-based-routing";
  }

  // CLI / command-based (src/commands/ or cmd/)
  if (ctx.files.some((f) => f.startsWith("src/commands/") || f.startsWith("cmd/"))) {
    return "command-based";
  }

  // Plugin / detector architecture
  if (ctx.files.some((f) => f.startsWith("src/detectors/") || f.startsWith("src/plugins/"))) {
    return "plugin-based";
  }

  // Hexagonal / clean architecture
  if (
    ctx.files.some((f) => f.includes("/domain/")) &&
    ctx.files.some((f) => f.includes("/infra/") || f.includes("/infrastructure/"))
  ) {
    return "hexagonal";
  }

  // Monolith with clear layers
  if (
    ctx.files.some((f) => f.includes("/services/")) &&
    ctx.files.some((f) => f.includes("/handlers/") || f.includes("/controllers/"))
  ) {
    return "layered";
  }

  // Package-per-feature (Go-style)
  if (ctx.files.some((f) => f.match(/^internal\/.+\/.+/))) {
    return "package-per-feature";
  }

  return null;
}

async function detectStateManagement(ctx: ScanContext): Promise<string | null> {
  const content = await ctx.readFile("package.json");
  if (!content) {
    return null;
  }

  try {
    const pkg = JSON.parse(content);
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    const stateLibs: string[] = [];
    if (allDeps["zustand"]) {
      stateLibs.push("zustand");
    }
    if (allDeps["@reduxjs/toolkit"] || allDeps["redux"]) {
      stateLibs.push("redux");
    }
    if (allDeps["mobx"]) {
      stateLibs.push("mobx");
    }
    if (allDeps["jotai"]) {
      stateLibs.push("jotai");
    }
    if (allDeps["recoil"]) {
      stateLibs.push("recoil");
    }
    if (allDeps["pinia"]) {
      stateLibs.push("pinia");
    }
    if (allDeps["vuex"]) {
      stateLibs.push("vuex");
    }
    if (allDeps["@tanstack/react-query"]) {
      stateLibs.push("react-query");
    }
    if (allDeps["@tanstack/vue-query"]) {
      stateLibs.push("vue-query");
    }
    if (allDeps["swr"]) {
      stateLibs.push("swr");
    }

    return stateLibs.length > 0 ? stateLibs.join(" + ") : null;
  } catch {
    return null;
  }
}

async function detectApiStyle(ctx: ScanContext): Promise<string | null> {
  const content = await ctx.readFile("package.json");
  const styles: string[] = [];

  if (content) {
    try {
      const pkg = JSON.parse(content);
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (allDeps["@trpc/server"] || allDeps["@trpc/client"]) {
        styles.push("trpc");
      }
      if (allDeps["graphql"] || allDeps["@apollo/server"]) {
        styles.push("graphql");
      }
    } catch {}
  }

  // Check for protobuf files (gRPC)
  if (ctx.glob("**/*.proto").length > 0) {
    styles.push("grpc");
  }

  // Check for REST patterns
  if (ctx.files.some((f) => f.match(/\/api\/.*route\.(ts|js)$/))) {
    styles.push("route-handlers");
  }
  if (ctx.files.some((f) => f.includes("/routes/") || f.includes("/controllers/"))) {
    styles.push("rest");
  }

  // Check for server actions (Next.js)
  if (ctx.files.some((f) => f.match(/\/actions?\.(ts|js)$/))) {
    styles.push("server-actions");
  }

  return styles.length > 0 ? styles.join(" + ") : null;
}

function detectKeyModules(ctx: ScanContext): Record<string, string> {
  const modules: Record<string, string> = {};

  // Find src/ subdirectories
  const srcDirs = new Set<string>();
  for (const file of ctx.files) {
    const match = file.match(/^src\/([^/]+)\//);
    if (match) {
      srcDirs.add(match[1]);
    }
  }

  for (const dir of srcDirs) {
    const description = MODULE_DESCRIPTIONS[dir];
    if (description) {
      modules[`src/${dir}/`] = description;
    }
  }

  // Also check top-level dirs
  const topDirs = new Set<string>();
  for (const file of ctx.files) {
    const match = file.match(/^([^/]+)\//);
    if (match && !match[1].startsWith(".") && match[1] !== "src" && match[1] !== "node_modules") {
      topDirs.add(match[1]);
    }
  }

  for (const dir of topDirs) {
    const description = MODULE_DESCRIPTIONS[dir];
    if (description && !modules[`src/${dir}/`]) {
      modules[`${dir}/`] = description;
    }
  }

  return modules;
}

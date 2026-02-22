import type { Detector, ScanContext } from "../types.js";

export const commandsDetector: Detector = {
  name: "commands",
  category: "commands",

  async detect(ctx: ScanContext) {
    // Try package.json scripts first (most common)
    const pkgCommands = await detectFromPackageJson(ctx);
    if (Object.values(pkgCommands).some(Boolean)) return pkgCommands;

    // Try Makefile
    const makeCommands = await detectFromMakefile(ctx);
    if (Object.values(makeCommands).some(Boolean)) return makeCommands;

    // Try Cargo/Go/Python defaults
    const langCommands = await detectLanguageDefaults(ctx);
    return langCommands;
  },
};

async function detectFromPackageJson(ctx: ScanContext): Promise<Record<string, string | null>> {
  const content = await ctx.readFile("package.json");
  if (!content) return emptyCommands();

  try {
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};

    // Detect package manager for prefix
    let pm = "npm run";
    if (ctx.fileExists("pnpm-lock.yaml")) pm = "pnpm";
    else if (ctx.fileExists("yarn.lock")) pm = "yarn";
    else if (ctx.fileExists("bun.lockb") || ctx.fileExists("bun.lock")) pm = "bun run";

    const result: Record<string, string | null> = {
      dev: findScript(scripts, ["dev", "start", "serve"], pm),
      build: findScript(scripts, ["build", "compile"], pm),
      test: findScript(scripts, ["test", "test:unit", "test:run"], pm),
      lint: findScript(scripts, ["lint", "lint:check"], pm),
      format: findScript(scripts, ["format", "fmt", "prettier"], pm),
    };

    // Detect extra useful scripts
    const extras = ["typecheck", "check", "deploy", "preview", "clean", "db:migrate", "db:seed", "generate", "codegen", "storybook"];
    for (const name of extras) {
      if (scripts[name]) result[name] = `${pm} ${name}`;
    }

    return result;
  } catch {
    return emptyCommands();
  }
}

function findScript(
  scripts: Record<string, string>,
  names: string[],
  pm: string
): string | null {
  for (const name of names) {
    if (scripts[name]) return `${pm} ${name}`;
  }
  return null;
}

async function detectFromMakefile(ctx: ScanContext): Promise<Record<string, string | null>> {
  const content = await ctx.readFile("Makefile");
  if (!content) return emptyCommands();

  const targets = new Set<string>();
  for (const line of content.split("\n")) {
    const match = line.match(/^([a-zA-Z_-]+)\s*:/);
    if (match) targets.add(match[1]);
  }

  return {
    dev: targets.has("dev") ? "make dev" : targets.has("run") ? "make run" : null,
    build: targets.has("build") ? "make build" : null,
    test: targets.has("test") ? "make test" : null,
    lint: targets.has("lint") ? "make lint" : null,
    format: targets.has("format") ? "make format" : targets.has("fmt") ? "make fmt" : null,
  };
}

async function detectLanguageDefaults(ctx: ScanContext): Promise<Record<string, string | null>> {
  // Cargo (Rust)
  if (ctx.fileExists("Cargo.toml")) {
    return {
      dev: "cargo run",
      build: "cargo build",
      test: "cargo test",
      lint: "cargo clippy",
      format: "cargo fmt",
    };
  }

  // Go
  if (ctx.fileExists("go.mod")) {
    return {
      dev: "go run .",
      build: "go build .",
      test: "go test ./...",
      lint: ctx.fileExists(".golangci.yml") ? "golangci-lint run" : null,
      format: "go fmt ./...",
    };
  }

  // Python
  if (ctx.fileExists("pyproject.toml") || ctx.fileExists("requirements.txt")) {
    const hasPytest = ctx.files.some(f => f.includes("pytest") || f.includes("test_"));
    const hasRuff = ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml");
    const pm = ctx.fileExists("poetry.lock") ? "poetry run" : "python -m";

    return {
      dev: ctx.fileExists("manage.py") ? `${pm} python manage.py runserver` : null,
      build: null,
      test: hasPytest ? `${pm} pytest` : null,
      lint: hasRuff ? `${pm} ruff check .` : null,
      format: hasRuff ? `${pm} ruff format .` : null,
    };
  }

  return emptyCommands();
}

function emptyCommands(): Record<string, string | null> {
  return { dev: null, build: null, test: null, lint: null, format: null };
}

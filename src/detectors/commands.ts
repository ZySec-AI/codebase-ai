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
  // === Rust (Cargo) ===
  if (ctx.fileExists("Cargo.toml")) {
    return {
      dev: "cargo run",
      build: "cargo build",
      test: "cargo test",
      lint: "cargo clippy",
      format: "cargo fmt",
    };
  }

  // === Go ===
  if (ctx.fileExists("go.mod")) {
    return {
      dev: "go run .",
      build: "go build .",
      test: "go test ./...",
      lint: ctx.fileExists(".golangci.yml") || ctx.fileExists(".golangci.yaml") ? "golangci-lint run" : null,
      format: "go fmt ./...",
    };
  }

  // === Python ===
  if (ctx.fileExists("pyproject.toml") || ctx.fileExists("requirements.txt") || ctx.fileExists("setup.py")) {
    const pm = ctx.fileExists("poetry.lock") ? "poetry run" :
               ctx.fileExists("Pipfile.lock") ? "pipenv run" :
               ctx.fileExists("uv.lock") ? "uv run" : "python -m";

    const hasPytest = ctx.files.some(f => f.includes("pytest") || f.includes("test_")) || ctx.fileExists("pytest.ini");
    const hasRuff = ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml") || ctx.fileExists("pyproject.toml");
    const hasBlack = ctx.fileExists("pyproject.toml") || ctx.fileExists(".black");
    const hasMypy = ctx.fileExists("mypy.ini") || ctx.fileExists(".mypy.ini");
    const hasDjango = ctx.fileExists("manage.py");
    const hasFastapi = ctx.files.some(f => f.includes("main.py") || f.includes("app.py"));

    let devCmd: string | null = null;
    if (hasDjango) devCmd = `${pm} python manage.py runserver`;
    else if (hasFastapi) devCmd = `${pm} uvicorn main:app --reload`;
    else if (ctx.fileExists("vite.config.ts")) devCmd = `${pm} vite`;

    let buildCmd: string | null = null;
    if (ctx.fileExists("pyproject.toml")) buildCmd = `${pm} build`;

    return {
      dev: devCmd,
      build: buildCmd,
      test: hasPytest ? `${pm} pytest` : `${pm} unittest`,
      lint: hasRuff ? `${pm} ruff check .` : hasMypy ? `${pm} mypy .` : null,
      format: hasRuff ? `${pm} ruff format .` : hasBlack ? `${pm} black .` : null,
    };
  }

  // === Java (Maven/Gradle) ===
  if (ctx.fileExists("pom.xml")) {
    return {
      dev: "mvn spring-boot:run",
      build: "mvn compile",
      test: "mvn test",
      lint: "mvn checkstyle:check",
      format: null,
    };
  }

  if (ctx.fileExists("build.gradle") || ctx.fileExists("build.gradle.kts")) {
    return {
      dev: "./gradlew bootRun",
      build: "./gradlew build",
      test: "./gradlew test",
      lint: "./gradlew checkstyleMain",
      format: null,
    };
  }

  // === Kotlin (Gradle) ===
  if (ctx.fileExists("build.gradle.kts")) {
    return {
      dev: "./gradlew run",
      build: "./gradlew build",
      test: "./gradlew test",
      lint: "./gradlew ktlintCheck",
      format: "./gradlew ktlintFormat",
    };
  }

  // === C# (.NET) ===
  if (ctx.files.some(f => f.endsWith(".csproj") || f.endsWith(".sln"))) {
    return {
      dev: "dotnet run",
      build: "dotnet build",
      test: "dotnet test",
      lint: null,
      format: "dotnet format",
    };
  }

  // === Ruby ===
  if (ctx.fileExists("Gemfile")) {
    const pm = "bundle exec";
    const hasRails = ctx.fileExists("bin/rails") || ctx.files.some(f => f.includes("config/application.rb"));
    const hasRake = ctx.fileExists("Rakefile");

    return {
      dev: hasRails ? `${pm} rails server` : null,
      build: null,
      test: hasRails ? `${pm} rails test` : hasRake ? `${pm} rake test` : `${pm} rspec`,
      lint: ctx.fileExists(".rubocop.yml") ? `${pm} rubocop` : null,
      format: ctx.fileExists(".rubocop.yml") ? `${pm} rubocop -a` : null,
    };
  }

  // === PHP ===
  if (ctx.fileExists("composer.json")) {
    const pm = "composer";
    const hasLaravel = ctx.fileExists("artisan") || ctx.files.some(f => f.includes("config/app.php"));
    const hasSymfony = ctx.files.some(f => f.includes("symfony"));

    return {
      dev: hasLaravel ? "php artisan serve" : hasSymfony ? "symfony server:start" : "php -S localhost:8000",
      build: `${pm} install`,
      test: hasLaravel ? "php artisan test" : `${pm} test`,
      lint: ctx.fileExists("phpunit.xml") || ctx.fileExists("phpunit.xml.dist") ? `${pm} phpunit` : null,
      format: ctx.fileExists(".php-cs-fixer.php") ? "vendor/bin/php-cs-fixer fix" : null,
    };
  }

  // === Swift ===
  if (ctx.fileExists("Package.swift") || ctx.files.some(f => f.endsWith(".xcodeproj"))) {
    return {
      dev: "swift run",
      build: "swift build",
      test: "swift test",
      lint: null,
      format: "swift format .",
    };
  }

  // === Dart/Flutter ===
  if (ctx.fileExists("pubspec.yaml")) {
    return {
      dev: ctx.fileExists("lib/main.dart") ? "flutter run" : "dart run",
      build: ctx.fileExists("lib/main.dart") ? "flutter build" : "dart compile exe",
      test: "flutter test",
      lint: "flutter analyze",
      format: "dart format .",
    };
  }

  // === Elixir ===
  if (ctx.fileExists("mix.exs")) {
    return {
      dev: "mix phx.server",
      build: "mix compile",
      test: "mix test",
      lint: "mix format --check-formatted",
      format: "mix format",
    };
  }

  // === Scala (sbt) ===
  if (ctx.fileExists("build.sbt")) {
    return {
      dev: "sbt run",
      build: "sbt compile",
      test: "sbt test",
      lint: "sbt scalafmtCheck",
      format: "sbt scalafmt",
    };
  }

  // === C/C++ (CMake/Make) ===
  if (ctx.fileExists("CMakeLists.txt")) {
    return {
      dev: null,
      build: "cmake --build build",
      test: "ctest --test-dir build",
      lint: null,
      format: null,
    };
  }

  // Makefile should be checked last, as it's a generic build tool
  // Only use it if no language-specific files were found
  const hasLanguageFiles = ctx.fileExists("Cargo.toml") ||
                           ctx.fileExists("go.mod") ||
                           ctx.fileExists("pyproject.toml") ||
                           ctx.fileExists("requirements.txt") ||
                           ctx.fileExists("setup.py") ||
                           ctx.fileExists("pom.xml") ||
                           ctx.fileExists("build.gradle") ||
                           ctx.fileExists("build.gradle.kts") ||
                           ctx.fileExists("Gemfile") ||
                           ctx.fileExists("composer.json") ||
                           ctx.fileExists("Package.swift") ||
                           ctx.fileExists("pubspec.yaml") ||
                           ctx.fileExists("mix.exs") ||
                           ctx.fileExists("build.sbt") ||
                           ctx.fileExists("CMakeLists.txt");

  if (ctx.fileExists("Makefile") && !hasLanguageFiles) {
    // Return empty commands - let the Makefile-specific detection handle it
    return emptyCommands();
  }

  // === Shell ===
  if (ctx.files.some(f => f.endsWith(".sh"))) {
    return {
      dev: null,
      build: null,
      test: null,
      lint: "shellcheck *.sh",
      format: "shfmt -w *.sh",
    };
  }

  return emptyCommands();
}

function emptyCommands(): Record<string, string | null> {
  return { dev: null, build: null, test: null, lint: null, format: null };
}

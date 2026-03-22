import type { Detector, ScanContext } from "../types.js";

/**
 * Detects project identity — what IS this project?
 * Reads README, package.json description, repo name to build a summary.
 * This is the first thing an AI needs to understand context.
 */
export const projectDetector: Detector = {
  name: "project",
  category: "project",

  async detect(ctx: ScanContext) {
    const [name, description, readme] = await Promise.all([
      detectProjectName(ctx),
      detectDescription(ctx),
      extractReadmeSummary(ctx),
    ]);

    return {
      name,
      description: description || readme || null,
    };
  },
};

async function detectProjectName(ctx: ScanContext): Promise<string> {
  // Try package.json name
  const pkgContent = await ctx.readFile("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      if (pkg.name) {
        return pkg.name;
      }
    } catch {}
  }

  // Try Cargo.toml
  const cargoContent = await ctx.readFile("Cargo.toml");
  if (cargoContent) {
    const match = cargoContent.match(/^name\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  // Try pyproject.toml
  const pyContent = await ctx.readFile("pyproject.toml");
  if (pyContent) {
    const match = pyContent.match(/^name\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  // Try go.mod
  const goContent = await ctx.readFile("go.mod");
  if (goContent) {
    const match = goContent.match(/^module\s+(\S+)/m);
    if (match) {
      return match[1].split("/").pop() || match[1];
    }
  }

  // Fallback: directory name from git remote
  const remote = await ctx.exec("git", ["remote", "get-url", "origin"]);
  if (remote) {
    const name = remote.replace(/.*[:/]/, "").replace(/\.git$/, "");
    return name;
  }

  // Last resort: directory name
  return ctx.root.split("/").pop() || "unknown";
}

async function detectDescription(ctx: ScanContext): Promise<string | null> {
  // Try package.json description
  const pkgContent = await ctx.readFile("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      if (pkg.description) {
        return pkg.description;
      }
    } catch {}
  }

  // Try Cargo.toml description
  const cargoContent = await ctx.readFile("Cargo.toml");
  if (cargoContent) {
    const match = cargoContent.match(/^description\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  // Try pyproject.toml description
  const pyContent = await ctx.readFile("pyproject.toml");
  if (pyContent) {
    const match = pyContent.match(/^description\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  return null;
}

async function extractReadmeSummary(ctx: ScanContext): Promise<string | null> {
  // Find README file
  const readmeNames = ["README.md", "readme.md", "README", "README.txt", "README.rst"];
  let readmeContent = "";

  for (const name of readmeNames) {
    readmeContent = await ctx.readFile(name);
    if (readmeContent) {
      break;
    }
  }

  if (!readmeContent) {
    return null;
  }

  // Extract the first meaningful paragraph (skip title, badges, blank lines)
  const lines = readmeContent.split("\n");
  let foundContent = false;
  const paragraphLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip markdown headers
    if (trimmed.startsWith("#")) {
      if (foundContent) {
        break;
      } // Stop at next header after content
      continue;
    }

    // Skip badges, images, blank lines before content
    if (
      !trimmed ||
      trimmed.startsWith("![") ||
      trimmed.startsWith("[![") ||
      trimmed.startsWith("<")
    ) {
      if (foundContent) {
        break;
      } // Blank line after content = end of paragraph
      continue;
    }

    foundContent = true;
    paragraphLines.push(trimmed);
  }

  const summary = paragraphLines.join(" ").slice(0, 300);
  return summary || null;
}

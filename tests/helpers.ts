import type { ScanContext } from "../src/types.js";

interface MockContextOptions {
  files?: string[];
  fileContents?: Record<string, string>;
  execResults?: Record<string, string>;
}

export function createMockContext(options: MockContextOptions = {}): ScanContext {
  const files = options.files || [];
  const fileContents = options.fileContents || {};
  const execResults = options.execResults || {};

  return {
    root: "/mock/project",
    files,
    async readFile(path: string): Promise<string> {
      return fileContents[path] || "";
    },
    fileExists(path: string): boolean {
      return files.includes(path) || path in fileContents;
    },
    glob(pattern: string): string[] {
      // Simple glob matching for tests
      const regex = new RegExp("^" + pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
      return files.filter((f) => regex.test(f));
    },
    async exec(cmd: string): Promise<string> {
      for (const [key, value] of Object.entries(execResults)) {
        if (cmd.includes(key)) {
          return value;
        }
      }
      return "";
    },
  };
}

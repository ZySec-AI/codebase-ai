const NO_COLOR = !!process.env.NO_COLOR;

const colors = {
  reset: NO_COLOR ? "" : "\x1b[0m",
  green: NO_COLOR ? "" : "\x1b[32m",
  red: NO_COLOR ? "" : "\x1b[31m",
  yellow: NO_COLOR ? "" : "\x1b[33m",
  cyan: NO_COLOR ? "" : "\x1b[36m",
  blue: NO_COLOR ? "" : "\x1b[34m",
  magenta: NO_COLOR ? "" : "\x1b[35m",
  dim: NO_COLOR ? "" : "\x1b[2m",
  bold: NO_COLOR ? "" : "\x1b[1m",
};

let isQuiet = false;
let isVerbose = false;

export function setQuiet(quiet: boolean): void {
  isQuiet = quiet;
}

export function setVerbose(verbose: boolean): void {
  isVerbose = verbose;
}

export function log(msg: string): void {
  if (!isQuiet) {
    console.log(msg);
  }
}

export function success(msg: string): void {
  if (!isQuiet) {
    console.log(`  ${colors.green}[✓]${colors.reset} ${msg}`);
  }
}

export function error(msg: string): void {
  console.error(`  ${colors.red}[✗]${colors.reset} ${msg}`);
}

export function errorWithSuggestion(msg: string, suggestion: string): void {
  console.error(`\n  ${colors.red}[✗]${colors.reset} ${msg}`);
  console.error(`  ${colors.cyan}→${colors.reset} ${suggestion}\n`);
}

export function warn(msg: string): void {
  if (!isQuiet) {
    console.log(`  ${colors.yellow}[!]${colors.reset} ${msg}`);
  }
}

export function info(msg: string): void {
  if (!isQuiet) {
    console.log(`  ${colors.cyan}[i]${colors.reset} ${msg}`);
  }
}

export function verbose(msg: string): void {
  if (isVerbose && !isQuiet) {
    console.log(`  ${colors.dim}[verbose]${colors.reset} ${msg}`);
  }
}

export function dim(msg: string): void {
  if (!isQuiet) {
    console.log(`${colors.dim}${msg}${colors.reset}`);
  }
}

export function bold(msg: string): string {
  return `${colors.bold}${msg}${colors.reset}`;
}

export function heading(msg: string): void {
  if (!isQuiet) {
    console.log(`\n${colors.bold}${msg}${colors.reset}`);
  }
}

export function link(text: string, url: string): string {
  if (process.stdout.isTTY && !NO_COLOR) {
    // ANSI hyperlinks
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
  }
  return `${text} (${url})`;
}

export function code(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

export function command(cmd: string): string {
  return `${colors.cyan}${cmd}${colors.reset}`;
}

export function printFriendlyError(what: string, cause: string, next: string): void {
  console.error(`  ${colors.red}✗${colors.reset}  ${what}`);
  console.error(`     Cause: ${cause}`);
  console.error(`     Fix:   ${next}`);
}

// Progress indicator for long operations
export class Progress {
  private current = 0;
  private total: number;
  private label: string;
  private interval?: ReturnType<typeof setInterval>;

  constructor(label: string, total: number) {
    this.label = label;
    this.total = total;
  }

  start(): void {
    if (isQuiet) {
      return;
    }
    this.render();
    this.interval = setInterval(() => this.tick(), 100);
  }

  tick(): void {
    if (isQuiet) {
      return;
    }
    this.current = Math.min(this.current + 1, this.total);
    this.render();
  }

  increment(amount: number): void {
    if (isQuiet) {
      return;
    }
    this.current = Math.min(this.current + amount, this.total);
    this.render();
  }

  complete(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
    if (!isQuiet) {
      this.current = this.total;
      this.render();
      console.log();
    }
  }

  private render(): void {
    const percent = Math.round((this.current / this.total) * 100);
    const filled = Math.round(20 * (this.current / this.total));
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    process.stdout.write(`\r  ${colors.cyan}[${bar}]${colors.reset} ${percent}% ${this.label}`);
  }
}

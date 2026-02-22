const NO_COLOR = !!process.env.NO_COLOR;

const colors = {
  reset: NO_COLOR ? "" : "\x1b[0m",
  green: NO_COLOR ? "" : "\x1b[32m",
  red: NO_COLOR ? "" : "\x1b[31m",
  yellow: NO_COLOR ? "" : "\x1b[33m",
  cyan: NO_COLOR ? "" : "\x1b[36m",
  dim: NO_COLOR ? "" : "\x1b[2m",
  bold: NO_COLOR ? "" : "\x1b[1m",
};

let isQuiet = false;

export function setQuiet(quiet: boolean): void {
  isQuiet = quiet;
}

export function log(msg: string): void {
  if (!isQuiet) console.log(msg);
}

export function success(msg: string): void {
  if (!isQuiet) console.log(`  ${colors.green}[x]${colors.reset} ${msg}`);
}

export function error(msg: string): void {
  console.error(`  ${colors.red}[!]${colors.reset} ${msg}`);
}

export function warn(msg: string): void {
  if (!isQuiet) console.log(`  ${colors.yellow}[~]${colors.reset} ${msg}`);
}

export function info(msg: string): void {
  if (!isQuiet) console.log(`  ${colors.cyan}[i]${colors.reset} ${msg}`);
}

export function dim(msg: string): void {
  if (!isQuiet) console.log(`${colors.dim}${msg}${colors.reset}`);
}

export function bold(msg: string): string {
  return `${colors.bold}${msg}${colors.reset}`;
}

export function heading(msg: string): void {
  if (!isQuiet) console.log(`\n${colors.bold}${msg}${colors.reset}`);
}

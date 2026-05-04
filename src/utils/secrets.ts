/**
 * Secret detection — scans file contents for leaked credentials.
 *
 * Uses regex patterns for common secret formats. Never includes the actual
 * secret value in output — only reports the type and location.
 *
 * Zero dependencies.
 */

export interface SecretFinding {
  /** Type of secret detected */
  type: string;
  /** File where it was found */
  file: string;
  /** Line number (1-based) */
  line: number;
}

/**
 * Patterns for common leaked secrets.
 * Each pattern captures the secret but we only report the type + location.
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  // AWS
  { pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/, type: "aws-access-key-id" },
  {
    pattern: /(?:aws_secret_access_key\s*[=:]\s*|aws_secret\s*[=:]\s*)['"][A-Za-z0-9/+=]{40}['"]/,
    type: "aws-secret-access-key",
  },
  // GitHub
  { pattern: /ghp_[A-Za-z0-9_]{36,}/, type: "github-pat" },
  { pattern: /gho_[A-Za-z0-9_]{36,}/, type: "github-oauth" },
  { pattern: /ghu_[A-Za-z0-9_]{36,}/, type: "github-user-token" },
  { pattern: /ghs_[A-Za-z0-9_]{36,}/, type: "github-app-token" },
  { pattern: /github_token\s*[=:]\s*['"][A-Za-z0-9_]{20,}['"]/, type: "github-token" },
  // Generic tokens
  { pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][A-Za-z0-9_\-]{20,}['"]/, type: "api-key" },
  {
    pattern: /(?:secret[_-]?key|secretkey)\s*[=:]\s*['"][A-Za-z0-9_\-]{20,}['"]/,
    type: "secret-key",
  },
  {
    pattern: /(?:access[_-]?token|accesstoken)\s*[=:]\s*['"][A-Za-z0-9_\-]{20,}['"]/,
    type: "access-token",
  },
  {
    pattern: /(?:private[_-]?key|privatekey)\s*[=:]\s*['"][A-Za-z0-9_\-]{20,}['"]/,
    type: "private-key",
  },
  // Private key blocks
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, type: "private-key-block" },
  // Slack
  { pattern: /xox[baprs]-[0-9a-zA-Z\-]{10,}/, type: "slack-token" },
  // Stripe
  { pattern: /(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,}/, type: "stripe-key" },
  // Heroku
  {
    pattern:
      /(?:heroku_api_key|HEROKU_API_KEY)\s*[=:]\s*['"][0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}['"]/,
    type: "heroku-api-key",
  },
  // Database URLs with credentials. Bounded segments + colon excluded from
  // the username class to prevent catastrophic backtracking on colon-rich
  // attacker pastes (the previous `[^\s'"]+:[^\s'"]+@` form had `a+b+@` shape).
  {
    pattern:
      /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s'":@]{1,128}:[^\s'"@]{1,256}@[^\s'"]{1,256}/,
    type: "database-url-with-credentials",
  },
  // Google
  { pattern: /AIza[0-9A-Za-z_\-]{35}/, type: "google-api-key" },
  // SendGrid
  { pattern: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/, type: "sendgrid-api-key" },
  // Twilio
  { pattern: /SK[0-9a-fA-F]{32}/, type: "twilio-api-key" },
  // Anthropic
  { pattern: /sk-ant-[a-zA-Z0-9_\-]{20,}/, type: "anthropic-api-key" },
  // OpenAI
  { pattern: /sk-[a-zA-Z0-9]{20,}T3BlbkFJ[a-zA-Z0-9]{20,}/, type: "openai-api-key" },
];

/** Files that commonly contain secrets */
const SCANNABLE_EXTENSIONS = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.staging",
  ".env.development",
  ".env.test",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
  ".config",
  ".rc",
]);

/** Files and patterns to NEVER scan (binary, large, or security-sensitive) */
const SKIP_FILES = new Set([".gitignore", ".npmrc", ".pypirc", ".netrc", ".ssh/config"]);

/**
 * Check if a file should be scanned for secrets.
 */
export function isScannableFile(filePath: string): boolean {
  if (SKIP_FILES.has(filePath)) {
    return false;
  }

  const lower = filePath.toLowerCase();

  // .env files are always scannable
  if (lower.startsWith(".env")) {
    return true;
  }

  // Check extension
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx >= 0) {
    return SCANNABLE_EXTENSIONS.has(lower.slice(dotIdx));
  }

  return false;
}

/** Hard cap on input size to bound regex work on attacker pastes. */
const MAX_SCAN_BYTES = 256 * 1024;

/**
 * Scan a file's content for leaked secrets.
 * Returns findings without secret values.
 */
export function scanForSecrets(content: string, filePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  // Truncate ahead of the line split so we never run patterns over more than
  // the cap. `.env` files this big are pathological anyway.
  const safe = content.length > MAX_SCAN_BYTES ? content.slice(0, MAX_SCAN_BYTES) : content;
  const lines = safe.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { pattern, type } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          type,
          file: filePath,
          line: i + 1,
        });
        // One finding per line max to avoid noise
        break;
      }
    }
  }

  return findings;
}

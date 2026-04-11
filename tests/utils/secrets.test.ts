import { describe, it, expect } from "vitest";
import { scanForSecrets, isScannableFile } from "../../src/utils/secrets.js";

// Concatenated constants to avoid triggering GitHub push-protection scanners.
// At runtime these produce the same strings our regexes must match.
const FAKE = {
  AWS_KEY: "AKIA" + "IOSFODNN7EXAMPLE",
  AWS_SECRET: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  GHP: "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno",
  SLACK: "xoxb-" + "1234567890-1234567890123-abcdefghijklmnopqrstuvwx",
  STRIPE: "sk_test_" + "1234567890abcdefghijklmnopqrstuv",
  GOOGLE: "AIza" + "SyDaGmWKa4VuXglh-fHxDkVZ9p8j34Z5678",
  ANTHROPIC: "sk-ant-" + "api03-abcdefghijklmnopqrstuvwxyz1234567890",
};

describe("secret detection", () => {
  describe("isScannableFile", () => {
    it("should scan .env files", () => {
      expect(isScannableFile(".env")).toBe(true);
      expect(isScannableFile(".env.local")).toBe(true);
      expect(isScannableFile(".env.production")).toBe(true);
    });

    it("should scan config files", () => {
      expect(isScannableFile("config.json")).toBe(true);
      expect(isScannableFile("settings.yaml")).toBe(true);
      expect(isScannableFile("app.toml")).toBe(true);
    });

    it("should skip non-config files", () => {
      expect(isScannableFile("index.ts")).toBe(false);
      expect(isScannableFile("README.md")).toBe(false);
      expect(isScannableFile("image.png")).toBe(false);
    });

    it("should skip sensitive dotfiles", () => {
      expect(isScannableFile(".gitignore")).toBe(false);
      expect(isScannableFile(".npmrc")).toBe(false);
    });
  });

  describe("scanForSecrets", () => {
    it("should detect AWS access keys", () => {
      const content = `AWS_KEY=${FAKE.AWS_KEY}\nAWS_SECRET=${FAKE.AWS_SECRET}`;
      const findings = scanForSecrets(content, ".env");
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some((f) => f.type === "aws-access-key-id")).toBe(true);
    });

    it("should detect GitHub PATs", () => {
      const content = `GITHUB_TOKEN=${FAKE.GHP}`;
      const findings = scanForSecrets(content, ".env");
      expect(findings.some((f) => f.type === "github-pat")).toBe(true);
    });

    it("should detect private key blocks", () => {
      const content =
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
      const findings = scanForSecrets(content, "config.pem");
      expect(findings.some((f) => f.type === "private-key-block")).toBe(true);
    });

    it("should detect database URLs with credentials", () => {
      const content = "DATABASE_URL=postgres://admin:secretpassword@db.example.com:5432/mydb";
      const findings = scanForSecrets(content, ".env");
      expect(findings.some((f) => f.type === "database-url-with-credentials")).toBe(true);
    });

    it("should detect Slack tokens", () => {
      const content = `SLACK_TOKEN=${FAKE.SLACK}`;
      const findings = scanForSecrets(content, ".env");
      expect(findings.some((f) => f.type === "slack-token")).toBe(true);
    });

    it("should detect Stripe keys", () => {
      const content = `STRIPE_KEY=${FAKE.STRIPE}`;
      const findings = scanForSecrets(content, ".env");
      expect(findings.some((f) => f.type === "stripe-key")).toBe(true);
    });

    it("should detect Google API keys", () => {
      const content = `GOOGLE_API_KEY=${FAKE.GOOGLE}`;
      const findings = scanForSecrets(content, ".env");
      expect(findings.some((f) => f.type === "google-api-key")).toBe(true);
    });

    it("should detect generic api_key assignments", () => {
      const content = 'api_key = "abcdefghijklmnopqrstuvwxyz1234567890"';
      const findings = scanForSecrets(content, "config.json");
      expect(findings.some((f) => f.type === "api-key")).toBe(true);
    });

    it("should detect Anthropic API keys", () => {
      const content = `ANTHROPIC_KEY=${FAKE.ANTHROPIC}`;
      const findings = scanForSecrets(content, ".env");
      expect(findings.some((f) => f.type === "anthropic-api-key")).toBe(true);
    });

    it("should report correct file and line numbers", () => {
      const content = `SOME_VAR=hello\nAWS_KEY=${FAKE.AWS_KEY}\nOTHER_VAR=world`;
      const findings = scanForSecrets(content, ".env.production");
      const awsFinding = findings.find((f) => f.type === "aws-access-key-id");
      expect(awsFinding).toBeDefined();
      expect(awsFinding!.file).toBe(".env.production");
      expect(awsFinding!.line).toBe(2);
    });

    it("should not report secret values in findings", () => {
      const content = `GITHUB_TOKEN=${FAKE.GHP}`;
      const findings = scanForSecrets(content, ".env");
      for (const f of findings) {
        // Findings should only have type, file, line — no value
        expect(Object.keys(f).sort()).toEqual(["file", "line", "type"].sort());
      }
    });

    it("should return empty array for clean files", () => {
      const content = "NODE_ENV=production\nPORT=3000\nDEBUG=false";
      const findings = scanForSecrets(content, ".env");
      expect(findings).toEqual([]);
    });

    it("should limit to one finding per line to avoid noise", () => {
      const content = `KEY=${FAKE.GHP}`;
      const findings = scanForSecrets(content, ".env");
      // Even though multiple patterns might match, we only report one per line
      const line1Findings = findings.filter((f) => f.line === 1);
      expect(line1Findings.length).toBeLessThanOrEqual(1);
    });
  });
});

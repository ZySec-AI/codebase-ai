#!/usr/bin/env node
const { readFileSync, writeFileSync, readdirSync } = require("fs");
const { join, basename } = require("path");
const { createHash } = require("crypto");

const skillsDir = join(__dirname, "..", "skills");
const files = readdirSync(skillsDir).filter(f => f.endsWith(".skill"));

const DEPS = {
  "simulate": ["agent-browser"],
  "cx-review": ["agent-browser"],
  "dogfood": ["agent-browser"],
  "py-declutter": ["python3"],
};

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const version = pkg.version;

const skills = files.map(file => {
  const buf = readFileSync(join(skillsDir, file));
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const name = basename(file, ".skill");
  return { name, version, sha256, depends_on: DEPS[name] ?? [], required_scripts: [] };
});

const manifest = { generated_at: new Date().toISOString(), version, skills };
writeFileSync(join(skillsDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Generated skills/manifest.json with " + skills.length + " skills");

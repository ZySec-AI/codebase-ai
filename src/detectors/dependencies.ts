import type { Detector, ScanContext } from "../types.js";

const NOTABLE_PACKAGES = new Set([
  // Frameworks
  "next", "react", "vue", "angular", "svelte", "nuxt", "remix", "astro", "gatsby",
  "express", "fastify", "hono", "nestjs", "koa",
  // ORM / DB
  "prisma", "@prisma/client", "drizzle-orm", "typeorm", "sequelize", "mongoose", "knex",
  // State
  "zustand", "redux", "@reduxjs/toolkit", "mobx", "jotai", "recoil", "pinia", "vuex",
  "@tanstack/react-query",
  // Validation
  "zod", "joi", "yup", "ajv",
  // API
  "@trpc/server", "graphql", "apollo-server", "@apollo/client",
  // Testing
  "jest", "vitest", "mocha", "playwright", "@playwright/test", "cypress",
  // Build
  "webpack", "vite", "esbuild", "rollup", "turbo", "nx", "tsup", "unbuild", "pkgroll",
  // Styling
  "tailwindcss", "styled-components", "@emotion/react", "@chakra-ui/react",
  "@mui/material", "@mantine/core",
  // Auth
  "next-auth", "@auth/core", "passport", "jsonwebtoken",
  // Deployment
  "@vercel/node", "@netlify/functions", "serverless",
  // Misc
  "docker", "typescript",
]);

export const dependenciesDetector: Detector = {
  name: "dependencies",
  category: "dependencies",

  async detect(ctx: ScanContext) {
    const content = await ctx.readFile("package.json");
    if (!content) {
      return {
        direct_count: 0,
        dev_count: 0,
        lock_file: detectLockFile(ctx),
        notable: [],
      };
    }

    try {
      const pkg = JSON.parse(content);
      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};
      const allDeps = { ...deps, ...devDeps };

      const notable = Object.keys(allDeps)
        .filter(d => NOTABLE_PACKAGES.has(d))
        .sort();

      return {
        direct_count: Object.keys(deps).length,
        dev_count: Object.keys(devDeps).length,
        lock_file: detectLockFile(ctx),
        notable,
      };
    } catch {
      return { direct_count: 0, dev_count: 0, lock_file: detectLockFile(ctx), notable: [] };
    }
  },
};

function detectLockFile(ctx: ScanContext): string | null {
  if (ctx.fileExists("pnpm-lock.yaml")) return "pnpm-lock.yaml";
  if (ctx.fileExists("yarn.lock")) return "yarn.lock";
  if (ctx.fileExists("package-lock.json")) return "package-lock.json";
  if (ctx.fileExists("bun.lockb") || ctx.fileExists("bun.lock")) return "bun.lockb";
  if (ctx.fileExists("Cargo.lock")) return "Cargo.lock";
  if (ctx.fileExists("poetry.lock")) return "poetry.lock";
  if (ctx.fileExists("Pipfile.lock")) return "Pipfile.lock";
  if (ctx.fileExists("go.sum")) return "go.sum";
  if (ctx.fileExists("Gemfile.lock")) return "Gemfile.lock";
  if (ctx.fileExists("composer.lock")) return "composer.lock";
  return null;
}

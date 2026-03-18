# codebase

<p align="center">
  <img src="https://img.shields.io/npm/v/codebase" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/codebase" alt="npm downloads" />
  <img src="https://img.shields.io/github/license/your-repo/codebase" alt="license" />
  <a href="https://github.com/your-repo/codebase/stargazers"><img src="https://img.shields.io/github/stars/your-repo/codebase?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <b>One command. Every AI tool understands your project instantly.</b>
</p>

---

## 🚀 Quick Start (30 seconds)

```bash
npx codebase
```

That's it. Your project is now AI-ready.

**What happens:**
1. Scans your project (stack, commands, structure, patterns)
2. Syncs GitHub data (issues, PRs, milestones) if `gh` CLI is available
3. Writes `.codebase.json` (~4KB, ~500 tokens)
4. Injects smart instructions into all detected AI tools
5. Installs auto-update git hooks
6. Configures MCP server for native AI tool access

**After this, you never run it again.** The manifest auto-updates on every commit.

---

## 💡 Why codebase?

Every AI coding session wastes **5,000-15,000 tokens** re-discovering your project.

### Without codebase:
```
Session start → AI explores files → 30 seconds + ~10K tokens
```

### With codebase:
```
Session start → AI reads .codebase.json → ~1 second + ~500 tokens
```

**Result:** ~95% fewer discovery tokens, instant project context.

---

## 🎯 Key Features

### Zero Configuration

No setup file needed. Works on any project:
- JavaScript/TypeScript
- Python
- Go
- Rust
- Java
- C#
- Ruby
- PHP
- Swift
- And 20+ more

### Universal AI Tool Support

Auto-wires into **7 AI tools**:
- Claude Code
- Cursor
- Windsurf
- GitHub Copilot
- Aider
- Cline
- Continue

### Native MCP Server

```bash
codebase mcp  # Start MCP server
```

Add to your AI tool's MCP config:
```json
{
  "mcpServers": {
    "codebase": {
      "command": "npx",
      "args": ["codebase", "mcp"]
    }
  }
}
```

Now your AI tools have `project_brief`, `query_codebase`, `create_issue` as native tools.

### Self-Updating

```bash
codebase hook install  # Auto-updates on every commit
codebase watch          # Auto-updates on file changes
```

### Pipe-Friendly CLI

```bash
# Query and execute
codebase query commands.test --raw | sh

# Filter with jq
codebase --json | jq '.stack.frameworks'

# Check stack
codebase query stack.languages  # ["typescript"]
```

### HTTP API

```bash
codebase serve  # localhost:7432

curl localhost:7432/codebase              # Full manifest
curl localhost:7432/codebase/stack        # Just stack
curl localhost:7432/codebase/commands     # Just commands
```

---

## 📊 What It Captures

| Category | Data |
|----------|------|
| **Repo** | URL, default branch, monorepo detection, active branches |
| **Structure** | Directory tree, entry points, build output paths |
| **Stack** | 30+ languages, 100+ frameworks, package manager, database, ORM |
| **Commands** | Dev, build, test, lint, format (15+ languages) |
| **Dependencies** | Direct deps, lock files, notable packages |
| **Config** | Environment files, feature flags, config locations |
| **Git** | Recent commits, active branches, last committers |
| **Quality** | Test framework, coverage, CI pipeline, hooks |
| **Patterns** | Architecture style, state management, modules |
| **GitHub** (optional) | Issues, PRs, milestones, releases, project boards |

---

## 🛠️ Installation

```bash
# Global (recommended)
npm install -g codebase

# Or run without installing
npx codebase

# With pnpm
pnpm add -g codebase

# With yarn
yarn global add codebase
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [USAGE.md](docs/USAGE.md) | Complete CLI reference with all commands |
| [examples.md](docs/examples.md) | Real output examples for 10+ project types |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and extension points |
| [WHY.md](docs/WHY.md) | The problem quantified |
| [COMPARISON.md](docs/COMPARISON.md) | vs other approaches |
| [INTEGRATIONS.md](docs/INTEGRATIONS.md) | How each AI tool connects |

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT © [Your Name]

---

<p align="center">
  <sub>Built with ❤️ for the AI-assisted development community</sub>
</p>

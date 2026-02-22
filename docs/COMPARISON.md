# Comparison

## codebase vs Everything Else

| Feature | codebase | CLAUDE.md | .cursorrules | .aider.conf | repo-map (aider) |
|---------|----------|-----------|-------------|-------------|-----------------|
| Auto-generated | Yes | No | No | No | Yes |
| Machine-readable | JSON | Prose | Prose | YAML (partial) | Custom |
| Tool-agnostic | Yes | Claude only | Cursor only | Aider only | Aider only |
| Auto-wires into tools | `codebase setup` | Manual | Manual | Manual | Built-in |
| Stays current | Hooks + CI | Manual | Manual | Manual | Per-session |
| MCP server | Yes | No | No | No | No |
| HTTP API | Yes | No | No | No | No |
| Pipe-friendly CLI | Yes | No | No | No | No |
| Custom detectors | Plugin SDK | N/A | N/A | N/A | N/A |
| Token cost | ~500 | Varies | Varies | Varies | ~2,000+ |
| Zero dependencies | Yes | N/A | N/A | N/A | No |

## Key Differentiator

`codebase` is the only tool that:
1. **Generates** structured facts automatically (not hand-written)
2. **Auto-wires** into every AI tool with one command
3. Works as a **native MCP tool** (AI calls it directly)
4. Works with **any** AI coding tool (not vendor-locked)
5. **Self-updates** through git hooks and CI
6. Has **zero** runtime dependencies

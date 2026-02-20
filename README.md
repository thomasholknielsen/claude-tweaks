# claude-tweaks

A Claude Code plugin with useful skills and tweaks.

## Installation

### Via marketplace

```bash
# Add the marketplace
/plugin marketplace add thomasholknielsen/claude-tweaks-marketplace

# Install the plugin
claude plugin install claude-tweaks
```

### Via direct install

```bash
claude plugin install thomasholknielsen/claude-tweaks
```

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| hello | `/claude-tweaks:hello [name]` | Greet the user and list available skills |

## Local development

```bash
claude --plugin-dir ./
```

Then invoke with `/claude-tweaks:hello Thomas`.

## License

MIT

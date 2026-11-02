# WebLoad CLI Tools Guide

WebLoad provides three primary command-line interface (CLI) binaries for running applications and managing cached modules:

1. [`wicnode`](docs/wicnode.md) — Node.js runtime runner for URL module loading and Import Maps.
2. [`wicbun`](docs/wicbun.md) — Bun runtime runner for URL module loading and Import Maps.
3. [`wicutil`](docs/wicutil.md) — Cache inspection and management utility.

---

## Tool Overview

| Binary | Target Runtime | Primary Purpose |
|---|---|---|
| [`wicnode`](docs/wicnode.md) | **Node.js** (>= 18.0.0) | Runs local files, remote URLs, or import map specifiers with WebLoad module loader hooks. |
| [`wicbun`](docs/wicbun.md) | **Bun** (>= 1.4.4-canary.1) | Runs local files, remote URLs, or import map specifiers with WebLoad Bun plugin. |
| [`wicutil`](docs/wicutil.md) | Node.js / Bun | Lists, clears, and selectively evicts cached remote modules from the local filesystem. |

---

## Common Workflow

### 1. Configure Origins and Import Maps (`webload.json`)

Create a `webload.json` configuration file in your project root or user home directory:

```json
{
  "imports": {
    "@app": "https://example.com/scripts/app.js",
    "lodash-es": "https://esm.sh/lodash-es@4.17.21",
    "ms": "https://esm.sh/ms@2.1.3"
  },
  "scopes": {},
  "script-src": [
    "https://example.com",
    "https://esm.sh"
  ],
  "cacheDir": "~/.cache/webload"
}
```

### 2. Execute Code

Run scripts seamlessly across runtimes:

```bash
# Run in Node.js
wicnode ./index.js
wicnode @app

# Run in Bun
wicbun ./index.ts
wicbun @app
```

### 3. Inspect and Manage Cache

Check cached assets and manage disk usage:

```bash
# List all cached modules
wicutil --list

# Evict a specific module when updating
wicutil --remove https://esm.sh/lodash-es@4.17.21

# Purge cache completely
wicutil --clear
```

---

## Detailed Tool Documentation

- [Node.js Runner (`wicnode`)](docs/wicnode.md)
- [Bun Runner (`wicbun`)](docs/wicbun.md)
- [Cache Utility (`wicutil`)](docs/wicutil.md)

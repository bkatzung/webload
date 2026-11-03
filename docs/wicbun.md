# `wicbun` CLI

`wicbun` is the WebLoad runtime runner for **Bun**. It enables native-like execution of local scripts or remote URL modules in Bun with automatic HTTP/HTTPS module loading, WICG Import Map resolution, atomic disk caching, and CSP-style security verification.

---

## Requirements

- **Bun**: v1.4.4-canary.1 (this appears to be a *post-release* canary) or later (with support for custom URL scheme / HTTP `onResolve` plugins).

---

## Installation & Setup

When WebLoad is installed globally or as a project dependency:

```bash
# Global execution
bun install -g webload
wicbun ./app.js

# Or directly with bunx
bunx wicbun ./app.js
```

---

## Synopsis

```bash
wicbun [options] <file-or-url> [script-args...]
wicbun [options] -e, --eval <code> [script-args...]
wicbun [options] --test [test-files...]
```

---

## Execution Modes & Arguments

| Mode / Argument | Description |
|---|---|
| `<file-or-url>` | Entry-point: a path to a local JavaScript/TypeScript/ES module file, a remote HTTP/HTTPS URL, or an import map bare specifier alias (e.g. `@app`). Required when not running in `-e`/`--eval` or `--test` mode. |
| `-e, --eval <code>` | Evaluate the provided string as JavaScript (with ES module import capabilities). |
| `--test [test-files...]` | Execute test files using Bun's built-in test runner with WebLoad loader plugin active for all imported remote modules. |
| `[script-args...]` | Additional arguments passed through to the executed script (available via `process.argv`). |

---

## Options

| Flag | Description |
|---|---|
| `-e, --eval <code>` | Evaluate inline string as JavaScript with ES module support. |
| `--test` | Run Bun built-in test runner. |
| `--config <path>` | Specify a custom path to a `webload.json` configuration file. |
| `-h`, `--help` | Display the CLI help message and exit. |
| `-v`, `--version` | Display the current WebLoad version and exit. |

Any Bun runtime flags specified before the `<file-or-url>` entrypoint are forwarded directly to the underlying `bun` executable.

---

## Examples

### 1. Execute a Local Script with URL Imports

```bash
wicbun ./index.ts
```

Inside `./index.ts`:
```typescript
import { chunk } from 'https://esm.sh/lodash-es@4.17.21';

console.log(chunk(['a', 'b', 'c', 'd'], 2));
```

### 2. Execute a Remote Entrypoint URL Directly

```bash
wicbun https://example.com/scripts/hello-server.js
```

### 3. Execute via Import Map Specifier

Given a `webload.json`:
```json
{
  "imports": {
    "@app": "https://example.com/scripts/app.js",
    "lodash-es": "https://esm.sh/lodash-es@4.17.21"
  },
  "script-src": [
    "https://example.com",
    "https://esm.sh"
  ]
}
```

Run directly:
```bash
wicbun @app
```

### 4. Evaluate Inline Code with URL Imports (`-e` / `--eval`)

```bash
wicbun -e "import { chunk } from 'https://esm.sh/lodash-es@4.17.21'; console.log(chunk([1, 2, 3, 4], 2));"
```

### 5. Run Tests with Built-in Test Runner (`--test`)

```bash
# Run all test files matching standard patterns
wicbun --test

# Run specific test file
wicbun --test test/my-service.test.js
```

### 6. Provide Custom Configuration and Script Arguments

```bash
wicbun --config ./configs/custom-webload.json ./server.js --port 3000
```

---

## Configuration Discovery

When `--config` is not explicitly passed, `wicbun` searches for configuration in the following order:
1. `./webload.json` (Current working directory)
2. `~/webload.json` (User home directory)

If no configuration file is present, a default-deny security policy is applied (`script-src: []`), requiring explicit origin authorization before remote URLs can be fetched.

---

## Environment Variables

| Variable | Description |
|---|---|
| `WEBLOAD_CONFIG` | Absolute path to the active `webload.json` configuration file. |
| `WEBLOAD_CACHE_DIR` | Custom directory path for cached remote modules. Overrides default `~/.cache/webload`. |
| `XDG_CACHE_HOME` | If set and `WEBLOAD_CACHE_DIR` is unset, cache defaults to `$XDG_CACHE_HOME/webload`. |

---

## How It Works

1. `wicbun` preloads the WebLoad Bun plugin (`src/bun/plugin.js`) via Bun's `-r` (preload) flag.
2. The Bun plugin hooks into Bun's module resolution pipeline (`plugin({ setup(build) { ... } })`):
   - Resolves bare specifiers according to WICG Import Map rules and scopes.
   - Intercepts `http:`, `https:`, and custom module namespaces.
   - Enforces CSP `script-src` origin security allowlists.
   - Downloads remote modules atomically and serves them from disk cache (`~/.cache/webload`).
3. On POSIX systems, `wicbun` invokes `process.execve` to execute Bun directly without parent process wrapper overhead.

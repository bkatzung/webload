# `wicnode` CLI

`wicnode` is the WebLoad runtime runner for **Node.js**. It enables seamless execution of local scripts or remote URL modules with automatic HTTP/HTTPS module loading, WICG Import Map resolution, atomic disk caching, and CSP-style security verification.

---

## Installation & Setup

When WebLoad is installed globally or as a project dependency:

```bash
# Global execution
npm install -g @bkatzung/webload
wicnode ./app.js

# Or via npx / local bin
npx wicnode ./app.js
```

---

## Synopsis

```bash
wicnode [options] <file-or-url> [script-args...]
wicnode [options] -e, --eval <code> [script-args...]
wicnode [options] --test [test-files...]
```

---

## Execution Modes & Arguments

| Mode / Argument | Description |
|---|---|
| `<file-or-url>` | Entry-point: a path to a local JavaScript/ES module file, a remote HTTP/HTTPS URL, or an import map bare specifier alias (e.g. `@app`). Local entry-point script paths must begin with `/`, `./`, or `../` (e.g. `./src/foo.js` instead of `src/foo.js`) to be properly classified as local files rather than package specifiers. Required when not running in `-e`/`--eval` or `--test` mode. |
| `-e, --eval <code>` | Evaluate the provided string as JavaScript (with ES module import capabilities). |
| `--test [test-files...]` | Execute test files using Node.js's built-in test runner with WebLoad loader hooks active for all imported remote modules. |
| `[script-args...]` | Additional arguments passed through to the executed script (available via `process.argv`). |

---

## Options

| Flag | Description |
|---|---|
| `-e, --eval <code>` | Evaluate inline string as JavaScript with ES module support. |
| `--test` | Run Node.js built-in test runner. |
| `--config <path>` | Specify a custom path to a `webload.json` configuration file. |
| `-h`, `--help` | Display the CLI help message and exit. |
| `-v`, `--version` | Display the current WebLoad version and exit. |

Any Node.js runtime flags (such as `--inspect`, `--trace-warnings`) specified before the `<file-or-url>` entrypoint are forwarded directly to the underlying Node.js process.

---

## Examples

### 1. Execute a Local Script with URL Imports

```bash
wicnode ./index.js
```

Inside `./index.js`:
```javascript
import { chunk } from 'https://esm.sh/lodash-es@4.17.21';

console.log(chunk(['a', 'b', 'c', 'd'], 2));
```

### 2. Execute a Remote Entrypoint URL Directly

```bash
wicnode https://example.com/scripts/hello-server.js
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
wicnode @app
```

### 4. Evaluate Inline Code with URL Imports (`-e` / `--eval`)

```bash
wicnode -e "import { chunk } from 'https://esm.sh/lodash-es@4.17.21'; console.log(chunk([1, 2, 3, 4], 2));"
```

### 5. Run Tests with Built-in Test Runner (`--test`)

```bash
# Run all test files matching standard patterns
wicnode --test

# Run specific test file
wicnode --test test/my-service.test.js
```

### 6. Provide Custom Configuration and Script Arguments

```bash
wicnode --config ./configs/custom-webload.json ./server.js --port 8080 --verbose
```

---

## Configuration Discovery

When `--config` is not explicitly passed, `wicnode` searches for configuration in the following order:
1. `./webload.json` (Current working directory)
2. `~/webload.json` (User home directory)

If no configuration file is present, a default-deny security policy is applied (`script-src: []`), which requires explicit origin authorization before remote URLs can be fetched.

---

## Environment Variables

| Variable | Description |
|---|---|
| `WEBLOAD_CONFIG` | Absolute path to the active `webload.json` configuration file. |
| `WEBLOAD_CACHE_DIR` | Custom directory path for cached remote modules. Overrides default `~/.cache/webload`. |
| `XDG_CACHE_HOME` | If set and `WEBLOAD_CACHE_DIR` is unset, cache defaults to `$XDG_CACHE_HOME/webload`. |

---

## How It Works

1. `wicnode` prepares the runtime environment and registers the WebLoad ESM module loader hook (`src/node/hook.js`) via Node.js `--import`.
2. When importing HTTP/HTTPS URLs or bare specifiers defined in import maps:
   - Validates the target URL against the configured `script-src` CSP allowlist.
   - Checks the local disk cache (`~/.cache/webload`). If cached and valid, serves directly from disk.
   - If not cached, fetches the remote module over HTTP/HTTPS, writes it atomically to the disk cache, and returns the module source to Node.js.
   - Preserves relative sub-module imports (e.g. `./utils.js`) resolving against the parent URL.
3. On POSIX operating systems, `wicnode` performs process replacement (`process.execve`) to avoid unnecessary process overhead. On Windows, it spawns and manages the child process.

# Product Context: WebLoad (Web-Import-with-Cache / WIC)

## Problem Statement

Modern JavaScript execution environments have diverged regarding URL-based ES module loading:
- **Browsers** and **Deno** provide built-in, native support for direct URL imports (e.g. `import "https://..."`) and transparent caching.
- **Node.js** and **Bun** do not natively support direct URL imports out of the box without manual pre-bundling or configuration.

This gap creates friction for developers who want to write clean, portable, and dependency-free scripts that import directly from CDNs (e.g. `esm.sh`, `unpkg.com`) or remote endpoints in Node.js and Bun without full package manager install steps or build pipelines.

---

## Target User Experience

### 1. Seamless URL Module Imports
Developers can use standard static and dynamic import statements targeting HTTP/HTTPS URLs directly in their scripts:
```javascript
import { chunk } from "https://esm.sh/lodash-es";
const { default: ms } = await import("https://esm.sh/ms");
```

### 2. Zero-Configuration Runtime CLIs
WebLoad provides dedicated runtime CLI wrappers that preload the required hooks and execute local files or remote URL entrypoints directly:

```bash
# Execute local files or remote URLs with WebLoad in Bun
wicbun ./app.js
wicbun https://example.com/entry.js

# Execute local files or remote URLs with WebLoad in Node.js
wicnode ./app.js
wicnode https://example.com/entry.js
```

### 3. Cache Management Utility (`wicutil`)
A simple management CLI allows inspecting and maintaining the local filesystem cache (`~/.cache/webload/`):

```bash
# Purge the entire local module cache
wicutil --clear

# Enumerate all currently cached modules (original URL and local cache path)
wicutil --list

# Evict specific modules from the cache by URL
wicutil --remove https://esm.sh/lodash-es https://esm.sh/ms
```

### 4. Standard WICG Import Maps
Support standard Import Maps for bare specifier remapping and prefix aliasing (e.g. mapping `"lodash"` to `"https://esm.sh/lodash-es"`), discovered automatically or via CLI argument:
1. `--import-map <path>` (CLI argument override)
2. `./webload.json` (Local directory configuration)
3. `~/webload.json` (User home configuration)

### 5. Robust & Atomic Local Filesystem Caching
- **Fast Startup & Offline Execution**: Once downloaded, cached modules are served directly from disk.
- **Lock-Free Concurrency**: Atomic file operations (`temp -> rename`) and isolated per-module directory metadata eliminate race conditions and avoid global lock contention across concurrent processes.
- **Relative Path Integrity**: Sub-resource imports within remote modules (e.g. `./utils.js`) resolve and cache naturally by preserving directory hierarchies.

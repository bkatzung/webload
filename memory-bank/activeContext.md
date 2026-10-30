# Active Context: WebLoad (WIC)

## Current Focus
- Updated Memory Bank to reflect the revised, simplified, and focused architecture specified in [`architecture/requirements.md`](architecture/requirements.md).
- Transitioning codebase planning to focus on Node.js synchronous import hooks, Bun plugin integration, atomic filesystem caching, and the `wic*` CLI suite.

---

## Settled Decisions & Architectural Commitments

1. **Target Runtime Focus**:
   - Focus specifically on **Node.js** and **Bun** (where native URL imports are absent). Browsers and Deno natively support URL module imports with caching.

2. **Core Operation Model**:
   - 3-step pipeline: Cache lookup in `~/.cache/webload/` -> On miss: Fetch to temporary file, generate per-module [`package.json`](package.json) with `{"type": "module"}`, and atomic rename (`temp -> rename`) -> Load and execute verified cached file.

3. **Node.js Synchronous Fetching**:
   - Implements synchronous fetching referencing the `unjs/env-runner` pattern (e.g. [`worker_threads`](memory-bank/techContext.md) with [`Atomics.wait()`](memory-bank/techContext.md) / [`SharedArrayBuffer`](memory-bank/techContext.md)).
   - Strictly avoids deprecated loader APIs ([`module.register()`](memory-bank/techContext.md)).

4. **Bun Plugin**:
   - Leverages [`Bun.plugin({ setup(build) { ... } })`](memory-bank/techContext.md) with `filter: /^https?:\/\//` to intercept static and dynamic imports.
   - Preloaded via Bun's `-r` / `--preload` flag.

5. **Filesystem Cache & Concurrency Safety**:
   - Default cache root: `~/.cache/webload/`.
   - Per-module / per-directory [`package.json`](package.json) creation without modifying a shared root [`package.json`](package.json), eliminating concurrency locks.
   - URL path escaping preserving nested directory structures for relative imports (`./util.js`).

6. **Security & `script-src` Allowlist**:
   - `webload.json` supports a CSP-like `"script-src"` array.
   - Missing or empty `"script-src"` acts as an empty allowlist (default deny for all remote URL imports).
   - Enforced at **import time** (before cache lookup or loading), ensuring that modules cached under a different configuration cannot be imported if disallowed by the active configuration.

7. **WICG Import Maps & Config Discovery**:
   - Full support for `"imports"` and `"scopes"` with 3-tier config discovery (`--config <path>`, `./webload.json`, `~/webload.json`).

8. **CLI Tools Suite**:
   - [`wicbun`](bin/wicbun.js): Bun runner with preloaded plugin (executes local files or remote URL entrypoints).
   - [`wicnode`](bin/wicnode.js): Node runner with synchronous import hooks (executes local files or remote URL entrypoints).
   - [`wicutil`](bin/wicutil.js): Cache utility with `--clear`, `--list`, and `--remove <URL...>`.

---

## Next Steps

1. Create project structure, package manifest ([`package.json`](package.json)), and configuration files.
2. Implement security validator (`src/security.js`) supporting CSP-like `"script-src"` rules, scheme/host/wildcard subdomains, and import-time policy checks.
3. Implement configuration loader (`src/config.js`) & WICG Import Map resolver (`src/import-map.js`) with 3-tier discovery.
4. Implement filesystem cache manager (`src/cache.js`) with path sanitization, atomic renaming, and per-module `package.json` generation.
5. Implement Node.js synchronous import hook system (`src/node/hook.js` & worker).
6. Implement Bun plugin (`src/bun/plugin.js`).
7. Implement CLI scripts: [`bin/wicnode.js`](bin/wicnode.js), [`bin/wicbun.js`](bin/wicbun.js), and [`bin/wicutil.js`](bin/wicutil.js).
8. Create automated test suites verifying security allowlist enforcement (`script-src`), cache atomicity, Node.js and Bun URL imports, and import maps.
9. Author comprehensive user and technical documentation for CLI commands (`wicnode`, `wicbun`, `wicutil`), configuration, and security controls.

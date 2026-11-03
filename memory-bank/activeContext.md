# Active Context: WebLoad (WIC)

## Current Status & Progress Summary
- Core architecture, security subsystem, import maps, cache manager, Node.js synchronous hooks, Bun plugin, and CLI binaries have been implemented.
- Coding standards applied across all codebase files: tab-based indentation and space between function name/constructor and opening parenthesis at definition.
- Bin scripts created without `.js` extensions ([`bin/wicnode`](bin/wicnode), [`bin/wicbun`](bin/wicbun), [`bin/wicutil`](bin/wicutil)).
- Executable process replacement uses [`process.execve`](bin/wicnode:124) guarded by [`process.platform !== 'win32'`](bin/wicnode:124), falling back to [`spawn()`](bin/wicnode:131).
- Full suite of automated test files created under [`test/`](test).

---

## Architectural Commitments & Module Locations

1. **Security Subsystem** ([`src/security.js`](src/security.js)):
   - CSP-like `"script-src"` matching (schemes, hosts, ports, wildcard subdomains, path prefixes).
   - Default deny when `"script-src"` is missing/empty.
   - Cache-agnostic import-time enforcement throwing [`WebloadSecurityError`](src/security.js:5).

2. **Import Maps & Discovery** ([`src/import-map.js`](src/import-map.js), [`src/config.js`](src/config.js)):
   - Full WICG standard resolution (`imports` and `scopes`).
   - 3-tier discovery hierarchy (`--config`, `./webload.json`, `~/webload.json`).

3. **Atomic Filesystem Cache** ([`src/cache.js`](src/cache.js)):
   - Atomic temporary-to-final rename operations (`temp -> rename`).
   - Per-module isolated [`package.json`](package.json) with `{"type": "module"}` without modifying root cache directory.

4. **Node.js & Bun Loaders** ([`src/node/hook.js`](src/node/hook.js), [`src/node/sync-fetch.js`](src/node/sync-fetch.js), [`src/bun/plugin.js`](src/bun/plugin.js)):
   - Node: synchronous fetching via [`worker_threads`](src/node/sync-fetch.js:7) + [`Atomics.wait()`](src/node/sync-fetch.js:51) / [`SharedArrayBuffer`](src/node/sync-fetch.js:41) with ESM resolve hooks.
   - Bun: Native `Bun.plugin()` interceptors.

5. **CLI Suite** ([`bin/wicnode`](bin/wicnode), [`bin/wicbun`](bin/wicbun), [`bin/wicutil`](bin/wicutil)):
   - Zero-configuration runners and cache inspection / eviction tools.

---

## Next Steps to Resume
1. Run full automated test suite (`npm test`).
2. Complete user and technical documentation (`README.md`, configuration and CLI reference).

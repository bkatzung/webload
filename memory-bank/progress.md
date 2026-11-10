# Progress Tracking: WebLoad (WIC)

## Completed
- [x] Defined core architecture and runtime requirements in [`architecture/requirements.md`](architecture/requirements.md).
- [x] Defined CSP-like `"script-src"` security allowlist requirements and import-time enforcement model in [`architecture/requirements.md`](architecture/requirements.md).
- [x] Initialized [`package.json`](package.json) with ES module configuration, package exports, and executable CLI binaries.
- [x] Implemented security validator ([`src/security.js`](src/security.js)) supporting CSP-like `"script-src"` directives, schemes, host/port rules, wildcard subdomains (`*.esm.sh`), path prefixes, default deny enforcement, and [`WebloadSecurityError`](src/security.js:5).
- [x] Implemented WICG Import Maps resolver ([`src/import-map.js`](src/import-map.js)) supporting top-level `"imports"`, contextual `"scopes"`, and longest-prefix matching.
- [x] Implemented configuration discovery and loader ([`src/config.js`](src/config.js)) with 3-tier discovery hierarchy (`--config`, `./webload.json`, `~/webload.json`).
- [x] Implemented filesystem cache manager ([`src/cache.js`](src/cache.js)) with metadata-first inspection (`.meta.json`), deterministic URL path sanitization, atomic writes (`temp -> rename`), isolated per-module [`package.json`](package.json) generation, redirect-only entries, and `Cache-Control` / `expiresAt` expiration handling.
- [x] Implemented Node.js synchronous fetch worker and client ([`src/node/sync-fetch-worker.js`](src/node/sync-fetch-worker.js), [`src/node/sync-fetch.js`](src/node/sync-fetch.js)) using [`worker_threads`](src/node/sync-fetch.js:6) with manual redirect loop (`redirect: 'manual'`), per-hop CSP validation, `Cache-Control` directive parsing, [`AbortSignal.timeout()`](src/node/sync-fetch-worker.js), $+500\text{ms}$ IPC grace period, and deadlocked worker termination recycling.
- [x] Implemented Node.js module resolution hooks ([`src/node/hook.js`](src/node/hook.js)) and Bun plugin ([`src/bun/plugin.js`](src/bun/plugin.js)) with `canonicalUrlMap` tracking for relative import resolution against final redirected response URLs.
- [x] Implemented CLI tool binaries without file extensions: [`bin/wicnode`](bin/wicnode), [`bin/wicbun`](bin/wicbun), and [`bin/wicutil`](bin/wicutil).
- [x] Authored full test suite across 11 test modules:
  - [`test/security.test.js`](test/security.test.js)
  - [`test/import-map.test.js`](test/import-map.test.js)
  - [`test/cache.test.js`](test/cache.test.js)
  - [`test/cli-wicnode.test.js`](test/cli-wicnode.test.js)
  - [`test/cli-wicbun.test.js`](test/cli-wicbun.test.js)
  - [`test/cli-wicutil.test.js`](test/cli-wicutil.test.js)
  - [`test/security-redirect.test.js`](test/security-redirect.test.js)
  - [`test/cache-redirect.test.js`](test/cache-redirect.test.js)
  - [`test/cache-control.test.js`](test/cache-control.test.js)
  - [`test/relative-redirect.test.js`](test/relative-redirect.test.js)
  - [`test/sync-fetch-timeout.test.js`](test/sync-fetch-timeout.test.js)

## Next Steps to Resume in Next Session
- [ ] Run full automated test suite (`npm test`).
- [ ] Complete documentation updates in [`docs/wicnode.md`](docs/wicnode.md), [`docs/wicbun.md`](docs/wicbun.md), [`architecture/security-script-src-design.md`](architecture/security-script-src-design.md), and [`README.md`](README.md).

# Active Context: WebLoad (WIC)

## Current Status & Remediation Implementation Progress
- Architecture remediation strategy ([`architecture/remediation.md`](architecture/remediation.md)) implemented across security, caching, Node.js hooks, Bun plugin, and worker fetch subsystems:
  1. **Redirection Security**: Manual redirect loop (`redirect: 'manual'`) in [`src/node/sync-fetch-worker.js`](src/node/sync-fetch-worker.js) with per-hop CSP allowlist validation ([`isAllowedScriptSrc`](src/security.js:203)) and 20-hop limit against circular redirects.
  2. **Relative Resolution**: `canonicalUrlMap` tracking in [`src/node/hook.js`](src/node/hook.js) and [`src/bun/plugin.js`](src/bun/plugin.js) ensuring sub-module relative imports resolve against canonical response URLs after redirects.
  3. **Metadata-First Cache**: [`src/cache.js`](src/cache.js) inspects `.meta.json` before checking content files, supporting redirect-only cached entries and offline multi-hop resolution with zero network access while enforcing per-configuration CSP rules.
  4. **Cache-Control & Expiration**: Evaluates `Cache-Control` headers, bypassing disk writes for uncacheable directives (`no-store`, `no-cache`, `private`, `must-revalidate`) and tracking expiration via `expiresAt` derived from `max-age`.
  5. **Worker Timeout & Abort (Approaches 1 + 4)**: Socket-level cancellation with [`AbortSignal.timeout()`](src/node/sync-fetch-worker.js), $+500\text{ms}$ IPC grace period for main thread [`Atomics.wait()`](src/node/sync-fetch.js), and resilient worker termination fallback on deadlocks.

---

## ⚠️ PROMINENT RECURRING ARCHITECTURAL & TEST ISSUE
### Node.js Synchronous Fetch Blocking vs In-Process HTTP Test Servers
- **Root Cause**: Node.js static ESM imports and [`fetchSync()`](src/node/sync-fetch.js) block the calling main thread synchronously using [`Atomics.wait()`](src/node/sync-fetch.js).
- **The Failure Mode**: If an automated test creates a mock HTTP server on the main thread via `http.createServer()`, the main thread's event loop is completely suspended during `Atomics.wait()`. Consequently, incoming HTTP requests dispatched by the worker thread cannot be processed by the server, causing the test to stall until timeout.
- **Mandatory Solution Pattern**: All mock HTTP test servers used in automated tests **MUST** be executed inside an isolated `Worker` thread (e.g. `new Worker(workerCode, { eval: true })`), keeping the server's event loop alive on a separate thread independent of the test runner's main thread.

---

## Remediation Test Suites Implemented
- [`test/security-redirect.test.js`](test/security-redirect.test.js): Direct allowed redirects, disallowed target blocking ([`WebloadSecurityError`](src/security.js:5)), intermediate hop blocking, and circular redirect loop detection.
- [`test/cache-redirect.test.js`](test/cache-redirect.test.js): Cached redirect-only metadata descriptors without content files, zero-network offline resolution, and stepwise per-configuration CSP evaluation.
- [`test/cache-control.test.js`](test/cache-control.test.js): Uncacheable directive handling (`no-store`, `no-cache`, `private`, `must-revalidate`) and `max-age` cache expiration.
- [`test/relative-redirect.test.js`](test/relative-redirect.test.js): Relative path shifting and resolution against canonical redirected URLs.
- [`test/sync-fetch-timeout.test.js`](test/sync-fetch-timeout.test.js): Worker timeout abort handling and clean worker recovery on subsequent requests.

---

## Next Steps to Resume in Next Session
1. Run full test suite (`npm test`) across all 11 test suites and verify all tests pass cleanly.
2. Complete documentation updates in [`docs/wicnode.md`](docs/wicnode.md), [`docs/wicbun.md`](docs/wicbun.md), [`architecture/security-script-src-design.md`](architecture/security-script-src-design.md), and [`README.md`](README.md).

# Active Context: WebLoad

## Current Focus
- Aligning system architecture and implementation plans with the finalized WebLoad requirements.
- Preparing core module loader implementation ([`src/index.js`](src/index.js:1)) and unified CLI executable.

## Settled Decisions & Architectural Commitments
- **Direct API Surface**: Standalone [`webLoad(url, options)`](src/index.js:1) API without AST parsing or code pre-transformation of caller modules.
- **Server Loading Strategy**: Server runtimes (Node, Deno, Bun) write fetched modules to persistent file cache and load via `file://` dynamic [`import()`](src/index.js:1), eliminating `data:` URL length limitations.
- **Browser & In-Memory Fallback**: Browsers use `blob:` URLs via [`URL.createObjectURL()`](src/adapters/browser.js:1). Node.js uncached fallback uses base64-encoded `data:` URLs.
- **Strict Deprecation & Security Compliance**: Avoid deprecated [`module.register()`](src/adapters/node.js:1); no [`eval()`](src/index.js:1); no [`btoa()`](src/utils/encoding.js:1) (use [`Uint8Array.prototype.toBase64()`](src/utils/encoding.js:1) with UTF-8 safe fallback).
- **Concurrency & Identity**: In-flight request deduplication and per-thread URL caching guaranteeing identical module namespace references.
- **Unified CLI Architecture**: Single-file dispatcher powering `webload`, `bwebload`, `dwebload`, and `nwebload` with runtime overrides and `--clear` flag.

## Active Next Steps
1. Create project manifest [`package.json`](package.json) configured for multi-runtime ESM.
2. Implement UTF-8 safe binary/base64 encoding utility ([`src/utils/encoding.js`](src/utils/encoding.js:1)).
3. Implement URL canonicalizer and import map resolver ([`src/resolver.js`](src/resolver.js:1)).
4. Implement concurrency & cache manager with in-flight deduplication and thread caching ([`src/cache.js`](src/cache.js:1)).
5. Implement runtime loaders / adapters ([`src/adapters/`](src/adapters/)).
6. Implement unified CLI script ([`bin/webload.js`](bin/webload.js:1)) with runtime aliases and `--clear` support.
7. Build test suites across Node.js, Deno, Bun, and browser environments.

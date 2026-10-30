# Progress Tracking: WebLoad (WIC)

## Completed
- [x] Defined core architecture and runtime requirements in [`architecture/requirements.md`](architecture/requirements.md).
- [x] Defined CSP-like `"script-src"` security allowlist requirements and import-time enforcement model in [`architecture/requirements.md`](architecture/requirements.md).
- [x] Updated Memory Bank files ([`memory-bank/systemPatterns.md`](memory-bank/systemPatterns.md), [`memory-bank/productContext.md`](memory-bank/productContext.md), [`memory-bank/activeContext.md`](memory-bank/activeContext.md)).

## In Progress / Planned
- [ ] Create project structure and package manifest ([`package.json`](package.json)).
- [ ] Implement security policy validator (`src/security.js`) for `"script-src"` origin / wildcard / scheme matching.
- [ ] Implement configuration loader (`src/config.js`) and WICG Import Map resolver (`src/import-map.js`).
- [ ] Implement filesystem cache manager (`src/cache.js`) with atomic operations.
- [ ] Implement Node.js synchronous import hooks (`src/node/hook.js` & worker).
- [ ] Implement Bun plugin integration (`src/bun/plugin.js`).
- [ ] Implement CLI runners and management utilities ([`bin/wicnode.js`](bin/wicnode.js), [`bin/wicbun.js`](bin/wicbun.js), [`bin/wicutil.js`](bin/wicutil.js)).
- [ ] Implement test suites for security policy enforcement, cache atomicity, Node/Bun URL imports, and import maps.
- [ ] Complete documentation for security controls, CLI commands, and configuration options.

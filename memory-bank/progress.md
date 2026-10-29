# Progress: WebLoad (WIC)

## Work Completed
- [x] Reviewed and analyzed the revised and focused project architecture and requirements in [`architecture/requirements.md`](architecture/requirements.md).
- [x] Synchronized and updated the Memory Bank documentation across all core files:
  - [`memory-bank/projectbrief.md`](memory-bank/projectbrief.md): Refocused on Node.js and Bun URL module loading, atomic cache, and CLI suite (`wicbun`, `wicnode`, `wicutil`), test coverage, and documentation.
  - [`memory-bank/productContext.md`](memory-bank/productContext.md): Updated user experience, target runtimes, and problem statement.
  - [`memory-bank/systemPatterns.md`](memory-bank/systemPatterns.md): Updated architecture diagram, unified loading lifecycle, synchronous Node hooks pattern, Bun plugin, per-module `package.json`, and import map discovery.
  - [`memory-bank/techContext.md`](memory-bank/techContext.md): Updated technical constraints, runtime matrix, cache schema, and references.
  - [`memory-bank/activeContext.md`](memory-bank/activeContext.md): Established current focus, settled architectural decisions, and next steps.
  - [`memory-bank/progress.md`](memory-bank/progress.md): Updated status and work breakdown.

---

## Remaining Work

### 1. Core Cache & Import Map Subsystems
- [ ] Define project [`package.json`](package.json) with executable bin entries and export mappings.
- [ ] Implement filesystem cache manager (`src/cache.js`) supporting atomic `temp -> rename`, per-module [`package.json`](package.json) with `{"type": "module"}`, and path escaping preserving directory hierarchy.
- [ ] Implement WICG-compliant Import Map resolver (`src/import-map.js`) with 3-tier precedence (`--import-map`, `./webload.json`, `~/webload.json`).

### 2. Runtime Loaders & Plugins
- [ ] Implement Node.js synchronous import hook system (`src/node/`) using worker thread / atomics sync communication (avoiding deprecated APIs).
- [ ] Implement Bun plugin (`src/bun/plugin.js`) with URL filtering and `onResolve` / `onLoad` handling.

### 3. CLI Suite
- [ ] Implement [`wicnode`](bin/wicnode.js) executable wrapper.
- [ ] Implement [`wicbun`](bin/wicbun.js) executable wrapper.
- [ ] Implement [`wicutil`](bin/wicutil.js) CLI for `--clear`, `--list`, and `--remove <URL...>`.

### 4. Testing & Verification (Test Coverage Requirements)
- [ ] Create automated tests for atomic cache writes, concurrency isolation, and cache eviction (`wicutil`).
- [ ] Create tests for Node.js URL imports and nested relative imports (`./sub.js`).
- [ ] Create tests for Bun URL imports and dynamic `import()` calls.
- [ ] Create tests for WICG import maps (top-level `imports` and scoped mappings).

### 5. Documentation Requirements
- [ ] Create project README / documentation with usage examples for [`wicnode`](bin/wicnode.js), [`wicbun`](bin/wicbun.js), [`wicutil`](bin/wicutil.js), and import map configuration.
- [ ] Document cache schema, safety invariants, and runtime integration details.

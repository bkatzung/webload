# Project Brief: WebLoad (Web-Import-with-Cache / WIC)

## Core Purpose
Modern web browsers and Deno natively support URL-based JavaScript module imports (`import "https://..."`) with transparent caching. Node.js and Bun do not natively support direct URL imports out of the box.

The goal of **WebLoad** (Web-Import-with-Cache / WIC) is to bring seamless URL module loading and caching to **Node.js** (via synchronous import hooks) and **Bun** (via a Bun plugin), backed by a shared, robust local filesystem cache (`~/.cache/webload/`).

---

## Primary Objectives

1. **Unified Module Loading & Filesystem Cache**:
   - Check local module cache (`~/.cache/webload/`).
   - On cache miss: synchronously or asynchronously fetch module content, write to an isolated temporary file, and atomically rename to its final destination upon completion.
   - Load and execute the module directly from the verified file in the local cache.

2. **Node.js Synchronous Import Hooks**:
   - Implement synchronous module import resolution and fetching referencing the `unjs/env-runner` pattern (e.g. using [`worker_threads`](memory-bank/techContext.md) with [`Atomics`](memory-bank/techContext.md) / [`SharedArrayBuffer`](memory-bank/techContext.md), synchronous subprocess fetching, or synchronous HTTP primitives).
   - Guarantee synchronous imports resolve reliably without blocking the main event loop or timing out.
   - Explicitly avoid deprecated loader APIs (strictly avoid [`module.register()`](memory-bank/techContext.md)).

3. **Bun Plugin Integration**:
   - Implement a Bun plugin using [`Bun.plugin({ setup(build) { ... } })`](memory-bank/techContext.md) with URL pattern matchers (`filter: /^https?:\/\//`).
   - Intercept both static [`import`](memory-bank/techContext.md) and dynamic [`import()`](memory-bank/techContext.md) specifiers.
   - Preloaded via Bun's `-r` / `--preload` flag for zero-configuration execution.

4. **WICG Import Maps & Specifier Resolution**:
   - Full compliance with the WICG Import Maps specification, supporting both top-level `"imports"` and contextual `"scopes"`.
   - Resolve bare specifiers and prefix remappings before hitting network or cache.
   - Configuration discovery & precedence:
     1. Explicit CLI argument override (`--import-map <path>`)
     2. Local directory configuration (`./webload.json`)
     3. User home configuration (`~/webload.json`)

5. **CLI Suite**:
   - [`wicbun`](bin/wicbun.js): Automatically preloads the Bun plugin; executes local scripts or remote URL entrypoints (e.g. `wicbun https://example.com/mod.js`).
   - [`wicnode`](bin/wicnode.js): Automatically preloads the synchronous Node hooks; executes local scripts or remote URL entrypoints (e.g. `wicnode https://example.com/mod.js`).
   - [`wicutil`](bin/wicutil.js): Cache management CLI supporting `--clear`, `--list`, and `--remove <URL...>`.

6. **Filesystem Cache Safety & Relative Module Resolution**:
   - Default cache root: `~/.cache/webload/`.
   - Atomic writes (`temp -> rename`) preventing race conditions or reading partially written files.
   - Per-module / per-module-directory isolated [`package.json`](package.json) with `{"type": "module"}` for Node.js ESM parsing. Modification of a shared root [`package.json`](package.json) is strictly prohibited to eliminate lock contention.
   - Deterministic URL path sanitization and escaping while preserving relative directory hierarchies for nested relative imports (`./util.js`).

---

## Scope & Non-Goals

- **In Scope**:
  - Node.js synchronous import hooks (`unjs/env-runner` style).
  - Bun plugin for HTTP/HTTPS specifiers.
  - Shared atomic filesystem cache (`~/.cache/webload/`) with per-module [`package.json`](package.json).
  - WICG Import Maps resolver with 3-tier config precedence (`--import-map`, `./webload.json`, `~/webload.json`).
  - CLI binaries: [`wicnode`](bin/wicnode.js), [`wicbun`](bin/wicbun.js), and [`wicutil`](bin/wicutil.js).
  - Comprehensive test coverage for caching atomicity, Node.js and Bun loading, and Import Maps.
  - Clear user and technical documentation for CLI usage and configuration.
- **Out of Scope (Non-Goals)**:
  - Browser and Deno runtimes (native URL imports and caching already built-in).
  - In-memory `data:` or `blob:` fallback hacks.
  - Modifying or locking a shared global root `package.json`.
  - Deprecated Node loader APIs ([`module.register()`](memory-bank/techContext.md)).

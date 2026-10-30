# WebLoad Project Requirements

## 1. Background & Motivation

Modern web browsers and Deno natively support URL-based JavaScript module imports (`import "https://..."`) with transparent caching. Node.js and Bun do not natively support direct URL imports out of the box.

The goal of **WebLoad** (Web-Import-with-Cache / WIC) is to bring seamless URL module loading and caching to **Node.js** (via synchronous import hooks) and **Bun** (via a Bun plugin), backed by a shared, robust local filesystem cache.

---

## 2. Core Architecture & Operation Model

Both Node.js and Bun loaders adhere to a unified module loading model:

1. **Specifier Resolution**: Resolve bare specifiers and path remappings via WICG Import Maps (`imports` and `scopes`).
2. **Security & Policy Check (Import-Time Enforcement)**:
   - Validate the target URL against the active `webload.json` `"script-src"` allowlist policy.
   - If the URL is not permitted (or if `"script-src"` is missing/empty), log a security warning/error to `console.error` with violation details and throw a standard `TypeError`. This check occurs at import time prior to cache lookup or disk execution, ensuring a module cached under a different configuration cannot bypass local security rules.
3. **Check Local Cache**: Look up the validated URL module in the filesystem-based module cache (`~/.cache/webload/`).
4. **On Cache Miss (Fetch & Atomic Write)**:
   - Synchronously or asynchronously fetch the module from its source URL.
   - Download the content to an isolated temporary file.
   - Atomically rename the temporary file to its final destination upon complete, verified download.
5. **Load Module**: Load and execute the module directly from the verified file in the local cache.

---

## 3. Runtime Integration Specifications

### 3.1 Node.js Synchronous Import Hooks
- **Synchronous Fetching Model**:
  - Implement synchronous module import resolution and fetching referencing the `unjs/env-runner` pattern (e.g. using `node:worker_threads` with `Atomics` / `SharedArrayBuffer`, synchronous subprocess fetching, or synchronous HTTP primitives).
  - Guarantees synchronous imports in Node resolve reliably without blocking the main event loop or timing out.
- **Deprecation Policy**:
  - Explicitly avoid deprecated loader APIs (strictly avoid `module.register()`).

### 3.2 Bun Plugin Integration
- **Plugin Hooking**:
  - Implement a Bun plugin using `Bun.plugin({ setup(build) { ... } })` with URL pattern matchers (`filter: /^https?:\/\//`).
  - Intercepts both static `import` and dynamic `import()` specifiers.
  - Preloaded via Bun's `-r` / `--preload` flag to ensure zero configuration overhead for user scripts.

---

## 4. Command-Line Tools & Utilities

- **`wicbun`** (Web-Import-with-Cache for Bun):
  - Automatically preloads the WebLoad Bun plugin.
  - Supports executing local file paths or remote URL main entrypoints (e.g., `wicbun https://example.com/mod.js`).
- **`wicnode`** (Web-Import-with-Cache for Node.js):
  - Automatically preloads the WebLoad synchronous Node hooks.
  - Supports executing local file paths or remote URL main entrypoints (e.g., `wicnode https://example.com/mod.js`).
- **`wicutil`** (Cache Management CLI):
  - `wicutil --clear`: Purges the entire local module cache.
  - `wicutil --list`: Enumerates all currently cached modules by original URL and cached path.
  - `wicutil --remove <URL...>`: Selectively evicts one or more modules from the cache by URL.

---

## 5. Configuration & Import Maps

- **Configuration Discovery & Precedence**:
  1. Explicit CLI argument override (e.g., `--config <path>`)
  2. Local directory configuration: `./webload.json`
  3. User home configuration: `~/webload.json`
- **Import Maps Standard Conformance**:
  - Full compliance with the WICG Import Maps specification, supporting both top-level `"imports"` and contextual `"scopes"`.
  - Resolves bare specifiers and prefix remappings before security validation, cache lookup, or network access.

---

## 6. Security & CSP-like Script Source Allowlist (`script-src`)

- **Configuration Key**:
  - `webload.json` accepts a top-level `"script-src"` key containing an array of allowed source expressions (e.g., `["https:", "esm.sh", "*.esm.sh", "https://*.unpkg.com"]`).
- **Default Deny Policy**:
  - If `"script-src"` is missing, empty (`[]`), or `null`, the allowlist is empty by default.
  - An empty allowlist denies all external URL imports; any attempt to import a remote URL module MUST log violation details to `console.error` and throw a `TypeError`.
- **Import-Time Enforcement (Cache-Agnostic)**:
  - Security validation is strictly enforced at **import resolution time**, prior to checking local cache or loading cached files.
  - If a module was previously downloaded/cached under a more permissive configuration, importing it in a context with a restrictive `webload.json` that disallows its origin MUST fail and throw a `TypeError`.
- **Source Expression Matching Rules**:
  - **Schemes**: Scheme-only expressions (e.g., `"https:"`, `"http:"`) allow any resource matching that scheme.
  - **Host / Origin Expressions**: Host definitions (e.g., `"esm.sh"`, `"https://esm.sh"`, `"http://localhost:3000"`) restrict allowed imports to matching origins/hosts (including port when specified).
  - **Wildcard Subdomains**: Supports `*` wildcard subdomain expressions (e.g., `"*.esm.sh"`, `"https://*.unpkg.com"`), matching any subdomain (e.g., `cdn.esm.sh`, `sub.pkg.unpkg.com`).
  - **Path / Prefix Matching**: Optional path prefix constraints if specified in the rule (e.g., `"https://esm.sh/v135/"`).

---

## 7. Filesystem Cache Structure & Concurrency

- **Default Cache Root**: `~/.cache/webload/`
- **Atomic Operations & Concurrency**:
  - All writes must use temporary files renamed atomically upon completion (`temp -> rename`).
  - Concurrent requests for the same URL must avoid colliding or reading partially written files.
- **Per-Module Auxiliary Files**:
  - Node.js requires an enclosing `package.json` with `{"type": "module"}` to parse `.js` files as ES Modules.
  - Auxiliary `package.json` files must be generated on a **per-module or per-module-directory basis** inside the module's isolated cached directory alongside the downloaded file.
  - **Shared root `package.json` modification is prohibited** to eliminate cross-process concurrency issues and avoid requiring network-filesystem locking protocols.
- **URL Path Sanitization & Escaping**:
  - Deterministically escape filesystem-reserved characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`), query strings, and port numbers.
  - Preserve relative directory hierarchies so that relative imports (e.g. `./util.js`) within remote modules resolve naturally on disk.

---

## 8. See Also & References

- [@node-loader/http](https://github.com/node-loader/node-loader-http)
- [@node-loader/import-maps](https://github.com/node-loader/import-maps)
- [RangerMauve webrun](https://github.com/RangerMauve/webrun)
- [unjs/env-runner](https://github.com/unjs/env-runner)
- [WICG Import Maps Specification](https://wicg.github.io/import-maps/)

FEEDBACK:
- Need to add requirements for test coverage
- Need to add requirements for documentation

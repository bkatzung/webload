# Project Brief: WebLoad

## Core Purpose
WebLoad is a JavaScript library and utility providing a standardized HTTP(S)-based ES Module (ESM) import API and CLI wrappers across modern execution environments:
- Modern Web Browsers
- Node.js
- Deno
- Bun (highly desirable)

## Primary Objectives
1. **Universal Module Loading API**: Provide a standardized [`webLoad(url, options)`](src/index.js:1) API for loading remote ES modules directly without requiring source pre-transformation or AST rewriting of standard [`import`](src/index.js:1) statements.
2. **Server-Side CLI Tools**: Provide `webrun`-style CLI wrappers to pre-load modules and execute scripts or remote URLs:
   - `webload [-b|-d|-n] <file|URL>`
   - `bwebload <file|URL>` (Bun)
   - `dwebload <file|URL>` (Deno)
   - `nwebload <file|URL>` (Node.js)
   - `webload --clear` (clear module cache)
3. **URL Canonicalization & Import Maps**:
   - Canonicalize relative URLs to absolute URLs using caller context (`import.meta`).
   - Support standard import maps (`<script type="importmap">` for browsers, `.json` files for server runtimes).
4. **Caching & Concurrency**:
   - URL-based caching: Guarantee all imports of the same final URL within a thread return the identical module namespace object.
   - Deduplicate concurrent in-flight requests for the same URL.
   - Provide optional persistent file-based caching where appropriate.
5. **Baseline Platform Capabilities & Safety**:
   - Prefer baseline platform capabilities where possible.
   - Strictly avoid [`eval()`](src/index.js:1), using `blob:` or `data:` URL dynamic [`import()`](src/index.js:1).
   - Avoid deprecated features (such as Node.js [`module.register()`](src/index.js:1)).
   - Avoid [`btoa()`](src/index.js:1) due to UTF-16 / Unicode issues; use [`Uint8Array.prototype.toBase64()`](src/index.js:1) or UTF-8 safe fallbacks.
   - Clearly document platform-specific limitations (e.g. Node.js lack of `blob:` URL ESM support, `data:` URL length limitations).

## Scope & Non-Goals
- **In Scope**:
  - Runtime detection and adapter strategy pattern.
  - HTTP / HTTPS fetching, URL canonicalization, and `blob:` / `data:` ESM dynamic loading.
  - In-flight request deduplication and multi-tier caching (in-memory thread cache and persistent file cache).
  - Standard import map resolution.
  - CLI runner wrappers for Node, Deno, and Bun.
- **Nice to Have**:
  - Integrity validation via import map extension or [`webLoad()`](src/index.js:1) options.
- **Out of Scope (Non-Goals)**:
  - Extensive legacy platform support.
  - Full package manager replacement.
  - Arbitrary CommonJS bundling or conversion without ESM interfaces.

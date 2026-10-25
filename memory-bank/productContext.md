# Product Context: WebLoad

## Problem Statement
While the ECMAScript standard defines module syntax ([`import`](src/index.js:1) / [`export`](src/index.js:1)), host JavaScript environments implement network module loading with significant fragmentation:
- **Browsers** support dynamic [`import()`](src/index.js:1) with HTTPS URLs and `blob:` / `data:` URLs natively, subject to CORS policies and MIME type validation (`text/javascript`).
- **Deno** natively supports direct URL imports and `blob:` / `data:` dynamic [`import()`](src/index.js:1).
- **Bun** natively supports URL imports, `data:` URLs, and `blob:` URLs via an internal blob registry.
- **Node.js** historically lacks out-of-the-box HTTP(S) dynamic imports, explicitly rejects `blob:` URLs in dynamic [`import()`](src/index.js:1) (`ERR_UNSUPPORTED_ESM_URL_SCHEME`), and deprecated experimental customization hooks such as [`module.register()`](src/index.js:1). However, Node.js reliably supports `data:` URL dynamic [`import()`](src/index.js:1).

This fragmentation creates hurdles for developers building universal libraries, serverless scripts, CLI utilities, micro-frontends, and dynamic runtime tools that need remote ES modules across environments.

## Target User Experience

### 1. Direct, Zero-Transformation JavaScript API
Modules explicitly invoke [`webLoad`](src/index.js:1) without requiring AST parsing or build-time code pre-transformation:
```javascript
const module = await webLoad(url, { ...options });
const { ...identifiers } = await webLoad(url, { ...options });
```
URL canonicalization is managed transparently (using caller import meta information where relative paths need resolution).

### 2. Unified Server-Side CLI Tools
Developers can execute local scripts or remote URLs across runtimes with pre-configured module loading and caching:
```bash
# Pre-load and execute script or URL using auto-detected or specific runtime
webload [-b|-d|-n] <file|URL>
bwebload <file|URL>  # Bun
dwebload <file|URL>  # Deno
nwebload <file|URL>  # Node.js

# Cache management
webload --clear
```

### 3. Native Import Map Support
- Standard `<script type="importmap">` integration when running in browser environments.
- JSON-based import map files (`.json`) when executing in CLI and server runtimes (e.g. `deno.json` / import map JSON configurations).

### 4. Deterministic Caching & Request Deduplication
- **In-flight Deduplication**: Concurrent calls to the same URL share a single network request.
- **Thread URL Caching**: Multiple imports of the same canonical URL within a thread always return the exact same module namespace instance.
- **Persistent Cache**: Optional file-based caching on server platforms for offline support and faster startup.

### 5. Robust Encoding and Platform Transparency
- Automatic handling of Unicode / UTF-16 code points in dynamically-loaded modules without [`btoa()`](src/index.js:1) failures.
- Clear documentation of platform-specific constraints (e.g. Node.js `data:` URL string limits and lack of `blob:` support).

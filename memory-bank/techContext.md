# Technical Context: WebLoad

## Runtime Compatibility Matrix

| Runtime / Platform | `blob:` URL dynamic [`import()`](src/index.js:1) | `data:` URL dynamic [`import()`](src/index.js:1) | Native [`Uint8Array.prototype.toBase64()`](src/index.js:1) | Limitations & Strategy Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Chrome / Chromium** (Blink/V8) | Supported (v80+) | Supported (v80+) | Supported (v128+) | `blob:` URLs preferred (constant short UUID string). `data:` URLs bound by V8 string limit (~512MB-1GB). |
| **Firefox** (Gecko/SpiderMonkey) | Supported (v67+) | Supported (v67+) | Supported (v133+) | `blob:` URLs preferred (no URL length limit). `data:` URLs bound by string limits and decoding overhead. |
| **Safari** (WebKit/JSC) | Supported (v13.1+) | Supported (v13.1+) | Supported (v18.2+) | `blob:` URLs preferred. `data:` URLs bound by JSC string limits and memory. |
| **Deno** | Supported (v1.0+) | Supported (v1.0+) | Supported (v2.1+) | Native URL dynamic import and `blob:` / `data:` supported (`URL.createObjectURL` backed by memory store). |
| **Bun** | Supported (v1.0+) | Supported (v1.0+) | Supported (v1.1.29+) | Native URL dynamic import, `blob:` URLs (internal blob registry), and `data:` URLs supported. |
| **Node.js** | **Unsupported** (`ERR_UNSUPPORTED_ESM_URL_SCHEME`) | Supported (v12.10+, v14.0+) | Supported (v22.0+, v23.0+) | Default ESM loader only supports `file:`, `data:`, and `node:`. File cache enables `file:` imports; uncached fallback uses base64 `data:` URLs. |

## Key Technical Decisions & Constraints

### 1. Module Loading Pipeline
- **File Cache Loading**: In server environments (Node, Deno, Bun) with persistent file caching enabled, module sources are downloaded, cached locally, and imported directly via `file://` URLs. This eliminates `data:` URL memory overhead and length constraints.
- **In-Memory Browser Loading**: In browsers, module sources are converted to object URLs via [`URL.createObjectURL(new Blob([...]))`](src/adapters/browser.js:1) and dynamically imported.
- **Node.js In-Memory Fallback**: When persistent file caching is disabled in Node.js, modules are loaded as base64-encoded `data:` URLs (`data:text/javascript;base64,...`).

### 2. Deprecation Policy
- Avoid deprecated Node.js customization hooks ([`module.register()`](src/index.js:1)).
- Strictly avoid [`eval()`](src/index.js:1) and non-standard execution tricks.

### 3. Binary & Unicode Encoding
- Modern code (especially agentically-edited or internationalized code) frequently contains Unicode UTF-16 code points.
- [`btoa()`](src/index.js:1) throws on characters outside Latin1 (code points > 255) and is strictly avoided.
- Standard TC39 [`Uint8Array.prototype.toBase64()`](src/utils/encoding.js:1) is used where supported natively, with a UTF-8 [`TextEncoder`](src/utils/encoding.js:1)-safe fallback for older runtimes.

### 4. Import Map Support
- Standard browser `<script type="importmap">` elements are parsed and used to canonicalize bare specifiers.
- JSON-based import maps (`deno.json`, standard import map JSON files) are supported in server and CLI environments.

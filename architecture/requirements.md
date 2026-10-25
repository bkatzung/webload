# WebLoad Requirements

## Primary Requirements

- Provide a standardized http(s)-based import API
- Support for browsers, Deno, and Node JS at a minimum
- Support for Bun is highly desirable
- Standard import maps (`<script type="importmap">` for browsers, `.json` file where applicable)
- URL canonicalization (e.g. relative to absolute)
- URL-based caching
  - All imports of the same final URL within a thread return the same import object
  - Optional file-based caching where available/appropriate
- Prevent duplicate in-flight requests
- `webrun`-style server-side CLI wrapper
- Prefer implementations based on baseline platform capabilities where possible
- No `eval()` (use `blob:` or `data:` import)
- Avoid deprecated features (e.g. Node's `module.register()`)
- As modern code, especially agentically-edited code, is prone to contain unicode UTF-16 code points, `btoa()` must be avoided
- Clearly document any limitations
  - E.g. platform does not support `blob:` URLs and has a maximum URL length limit for `data:` URLs that applies to uncached modules

## Nice To Have

- Integrity
  - Via import map extension (preferred for general usage)
  - Via `webLoad` option (for testing, or if a specific version is a critical requirement)

## Non-Goals

- Extensive legacy support

## Anticipated CLI Usage

```
# pre-load module and execute script file or URL
webload [-b|-d|-n] <file|URL>
bwebload <file|URL>
dwebload <file|URL>
nwebload <file|URL>

# clear module cache
webload --clear
```

## Anticipated JavaScript Usage

```javascript
const module = await webLoad(url, { ...options });
const { ...identifiers } = await webLoad(url, { ... });
```

Modules will explicitly access the `webLoad` API (no `import` pre-transformation or parsing required).

`webLoad` will manage URL canonicalization (likely needing the caller's import meta information as an option in some cases).

## `blob:` And `data:` Import Support Notes

### Compatibility Matrix

| Runtime / Platform | `blob:` URL dynamic [`import()`](architecture/requirements.md:29) | `data:` URL dynamic [`import()`](architecture/requirements.md:29) | Native [`Uint8Array.prototype.toBase64()`](architecture/requirements.md:29) | URL Length Limitations & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Chrome / Chromium** (Blink/V8) | Supported (v80+) | Supported (v80+) | Supported (v128+) | `data:` URLs: Bound by V8 string limit (~512 MB – 1 GB); high memory overhead. `blob:` URLs: Short UUID string (~50 chars), no URL length limit. |
| **Firefox** (Gecko/SpiderMonkey) | Supported (v67+) | Supported (v67+) | Supported (v133+) | `data:` URLs: Bound by SpiderMonkey string length limit; base64 decoding overhead. `blob:` URLs: Short UUID string, no URL length limit. |
| **Safari** (WebKit/JSC) | Supported (v13.1+) | Supported (v13.1+) | Supported (v18.2+) | `data:` URLs: Practical limit bounded by JSC string limits and memory. `blob:` URLs: Short UUID string, no URL length limit. |
| **Deno** | Supported (v1.0+) | Supported (v1.0+) | Supported (v2.1+) | `data:` URLs: Supported up to V8 string memory limit. `blob:` URLs: Supported (`URL.createObjectURL` backed by memory store). |
| **Bun** | Supported (v1.0+) | Supported (v1.0+) | Supported (v1.1.29+) | `data:` URLs: Supported up to JSC string memory limit. `blob:` URLs: Supported via internal blob registry. |
| **Node.js** | **Unsupported** (`ERR_UNSUPPORTED_ESM_URL_SCHEME`) | Supported (v12.10+, v14.0+) | Supported (v22.0+, v23.0+) | `data:` URLs: Supported up to V8 max string length limit (~1 GB on 64-bit), but high memory overhead. `blob:` URLs: Default ESM loader only supports `file:`, `data:`, and `node:`. |

### Key Findings & Implementation Strategy

1. **`blob:` URL Imports**:
   - Universal across all major modern browsers (Chrome, Firefox, Safari), Deno, and Bun.
   - **Node.js ESM loader explicitly forbids `blob:` URLs** (`ERR_UNSUPPORTED_ESM_URL_SCHEME`), requiring `data:` URLs or custom loaders/synthetic module handling for in-memory code loading.
   - Preferred in browser environments due to constant, negligible URL string length (avoids string allocation and URL parsing bottlenecks for large modules).

2. **`data:` URL Imports**:
   - Universally supported across all target platforms (Browsers, Bun, Deno, and Node.js).
   - Module contents must be base64-encoded (`data:text/javascript;base64,...`) or percent-encoded (`data:text/javascript;charset=utf-8,...`).
   - Requires relative specifiers inside the module code to be rewritten to absolute URLs before encoding, as relative imports from `data:` or `blob:` specifiers do not share a host base path.

3. **`Uint8Array.prototype.toBase64()`**:
   - Standardized via TC39 Stage 4 ArrayBuffer base64 proposal.
   - Available in modern runtimes (Chrome 128+, Firefox 133+, Safari 18.2+, Deno 2.1+, Node 22+, Bun 1.1.29+).
   - In older environments (e.g. Node 18/20 LTS, older browsers), a fallback or polyfill (e.g. Node's [`Buffer.from().toString('base64')`](architecture/requirements.md:54) or UTF-8 [`TextEncoder`](architecture/requirements.md:54)-safe base64 table encoder) must be used. Note that [`btoa()`](architecture/requirements.md:13) cannot be used as it throws on non-Latin1/UTF-16 characters.

4. **URL Length & Memory Constraints**:
   - `data:` URLs embed the full module source, increasing string allocation and memory footprint by ~33% (for base64).
   - While modern engines support large strings (~512 MB to 1 GB), large `data:` URLs cause performance penalties during compilation and parsing.
   - `blob:` URLs avoid URL length constraints in browsers by referencing memory buffers via concise UUID strings.

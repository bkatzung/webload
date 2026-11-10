# WebLoad

> Seamless URL module loading and caching for Node.js and Bun with CSP-like security and WICG import maps.

WebLoad brings browser-grade and Deno-like URL imports to **Node.js** and **Bun** without build-step bundling or manual pre-installation.

---

## Features

- **Direct URL Imports**: Import directly from CDNs (e.g. `esm.sh`, `unpkg.com`) or any remote HTTPS endpoint using standard ES module syntax (`import "https://..."` and `await import("https://...")`).
-  **WICG Import Maps**: Remap bare specifiers and configure scoped module aliases with standard `imports` and `scopes`.
-  **CSP-Like `script-src` Security**: Default-deny security model prevents arbitrary remote code execution by enforcing configurable domain and wildcard allowlists.
- **Atomic Local Disk Cache**: Downloaded modules are stored atomically in `~/.cache/webload`, enabling fast startup, offline execution, and race-free concurrent execution.
- **Zero-Config CLI Runners**: Dedicated [`wicnode`](docs/wicnode.md) and [`wicbun`](docs/wicbun.md) binaries run local scripts and remote URL entrypoints directly.
- **Cache Management Utility**: Inspect, evict, and purge cached assets with [`wicutil`](docs/wicutil.md).

---

## Installation

```bash
# Install globally
npm install -g @bkatzung/webload
# or
bun install -g @bkatzung/webload

# Or add as project dependency
npm install @bkatzung/webload
```

---

## Quick Start

### 1. Configure Allowed Origins (`webload.json`)

Create a `webload.json` in your project or home directory:

```json
{
  "imports": {
    "lodash-es": "https://esm.sh/lodash-es@4.17.21"
  },
  "script-src": [
    "https://esm.sh"
  ]
}
```

### 2. Write Your Script

```javascript
// index.js
import { chunk } from 'lodash-es';

console.log(chunk([1, 2, 3, 4, 5], 2));
```

### 3. Run with WebLoad

```bash
# In Node.js
wicnode ./index.js

# In Bun
wicbun ./index.js
```

---

## CLI Tools

| Command | Description | Documentation |
|---|---|---|
| `wicnode` | Node.js runtime runner with WebLoad loader hooks. | [docs/wicnode.md](docs/wicnode.md) |
| `wicbun` | Bun runtime runner with WebLoad plugin. | [docs/wicbun.md](docs/wicbun.md) |
| `wicutil` | Cache inspection and management utility. | [docs/wicutil.md](docs/wicutil.md) |

For full CLI documentation and workflows, see the [CLI Tools Guide](docs/cli.md).

---

## Programmatic Usage

### In Node.js

Register the loader hook programmatically or via Node `--import`:

```bash
node --import @bkatzung/webload/node ./index.js
```

### In Bun

Preload the Bun plugin:

```bash
bun -r @bkatzung/webload/bun ./index.ts
```

---

## License

[MIT](LICENSE)

---

## FAQ

### Why Use It?

- **No-build and web-first projects**: Author standard web-compatible ESM with zero bundling or transpile steps.
- **Zero-`node_modules` automation**: Create portable, self-contained CI/CD tools and single-file scripts without local dependency directories.
- **Write-once/run-anywhere**: Share identical code across browsers, Node.js, Bun, and edge runtimes (e.g. transpiled Mesgjs modules).
- **Secure dynamic plugin architectures**: Load remote plugins and middleware at runtime with deterministic CSP `script-src` allowlists.
- **Live schema & contract distribution**: Import shared data schemas or client models directly from internal HTTP endpoints without publishing npm packages.
- **Engines with late or non-standard Node support**: Uniform module resolution across diverse JavaScript runtimes (e.g. Deno, Ende).

### Are `cache-control`, `expires`, And/Or `pragma` Headers Supported?

- `cache-control`: yes, partially
  - The `max-age` directive is supported
  - Revalidation is not supported
  - `no-cache`, `no-store`, `private`, and `must-revalidate` will prevent content caching
- `expires`: not supported
- `pragma`: not supported

---

## References

WebLoad was primarily inspired by the following modules and specifications:

- [@node-loader/http](https://github.com/node-loader/node-loader-http)
- [@node-loader/import-maps](https://github.com/node-loader/import-maps)
- [RangerMauve webrun](https://github.com/RangerMauve/webrun)
- [unjs/env-runner](https://github.com/unjs/env-runner)
- [WICG Import Maps Specification](https://wicg.github.io/import-maps/)

---

## Credits

- Thanks to reddit user [its_jsec](https://reddit.com/u/its_jsec) for feedback, especially regarding security and timeout-handling.


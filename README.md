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

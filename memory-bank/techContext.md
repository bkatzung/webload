# Technical Context: WebLoad (WIC)

## Runtime Compatibility & Integration Matrix

| Runtime | Hook / Plugin Integration Mechanism | Sync / Async Fetching Strategy | Auxiliary Metadata Requirements | Preload / Invocation Flag |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js** | Synchronous Import Hooks (referencing `unjs/env-runner` pattern) | Synchronous fetch via [`worker_threads`](memory-bank/techContext.md) + [`Atomics.wait()`](memory-bank/techContext.md) / [`SharedArrayBuffer`](memory-bank/techContext.md) or synchronous subprocess primitives | Per-module / per-directory [`package.json`](package.json) with `{"type": "module"}` | Executed via [`wicnode`](bin/wicnode.js) wrapper with preload flags |
| **Bun** | Native Plugin API via [`Bun.plugin({ setup })`](memory-bank/techContext.md) with `filter: /^https?:\/\//` | Asynchronous/Synchronous fetch handled in `onLoad` hook | Directly loads ESM or transpiles via Bun's native loader | Executed via [`wicbun`](bin/wicbun.js) wrapper with `-r` / `--preload` |

---

## Technical Constraints & Design Principles

### 1. Synchronous Import Execution in Node.js
- In Node.js, static ESM import resolution and legacy synchronous hook boundaries require synchronous resolution.
- `unjs/env-runner` demonstrates robust cross-version synchronous communication between a background worker and the main module resolver via [`SharedArrayBuffer`](memory-bank/techContext.md) and [`Atomics`](memory-bank/techContext.md) signaling.
- Deprecated Node.js APIs (such as [`module.register()`](memory-bank/techContext.md)) are strictly avoided.

### 2. Bun Plugin System
- Uses Bun's native build and plugin lifecycle hooks:
  - `build.onResolve({ filter: /^https?:\/\// }, args => { ... })`
  - `build.onLoad({ filter: /^https?:\/\// }, async args => { ... })`
- Intercepts both static imports and dynamic `import()` calls at runtime.

### 3. Local Filesystem Cache Schema
- **Cache Root**: `~/.cache/webload/` (resolved via `XDG_CACHE_HOME` or user home directory).
- **Directory Layout Example**:
  ```text
  ~/.cache/webload/
    esm.sh/
      lodash-es@4.17.21/
        package.json          <-- {"type": "module"}
        lodash.js
        chunk.js
  ```
- **Atomicity Protocol**:
  1. Write incoming stream to `.tmp.<uuid>.<ext>`.
  2. Ensure parent directory has an isolated [`package.json`](package.json) with `{"type": "module"}`.
  3. Perform atomic filesystem rename to target path.
- **Root `package.json` Prohibition**:
  - The root cache directory must never contain or rewrite a shared [`package.json`](package.json), preventing race conditions across concurrent processes.

### 4. Import Map Resolution
- Follows the [WICG Import Maps Specification](https://wicg.github.io/import-maps/).
- Supports top-level `"imports"` mapping and contextual `"scopes"` mapping.
- Configuration resolution hierarchy:
  1. CLI parameter: `--import-map <path>`
  2. Local directory file: `./webload.json`
  3. Home directory file: `~/webload.json`

### 5. Key References
- [`unjs/env-runner`](https://github.com/unjs/env-runner)
- [`@node-loader/http`](https://github.com/node-loader/node-loader-http)
- [`@node-loader/import-maps`](https://github.com/node-loader/import-maps)
- [RangerMauve webrun](https://github.com/RangerMauve/webrun)
- [WICG Import Maps Specification](https://wicg.github.io/import-maps/)

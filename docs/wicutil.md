# `wicutil` CLI

`wicutil` is the WebLoad cache management utility. It allows developers and CI/CD pipelines to inspect cached remote modules, remove specific cached URLs, or purge the entire local cache directory.

---

## Installation & Setup

When WebLoad is installed globally or as a project dependency:

```bash
# Global execution
npm install -g @bkatzung/webload
wicutil --list

# Or via npx
npx wicutil --list
```

---

## Synopsis

```bash
wicutil [options] [command]
```

---

## Commands

| Command | Description |
|---|---|
| `--list` | Enumerate all modules currently stored in the cache. Displays the origin URL, local file path, file size (human-readable), and cached ISO 8601 timestamp. |
| `--clear` | Purge and remove the entire module cache directory. |
| `--remove <URL...>` | Evict one or more specific modules from the cache by providing their source URLs. |

---

## Options

| Flag | Description |
|---|---|
| `--config <path>` | Load a specific `webload.json` configuration file to resolve custom `cacheDir` settings. |
| `--cache-dir <path>` | Explicitly target a custom cache directory instead of the default location. |
| `-h`, `--help` | Display the CLI help message and exit. |
| `-v`, `--version` | Display the current WebLoad version and exit. |

---

## Examples

### 1. List All Cached Modules

```bash
wicutil --list
```

Example output:
```text
[wicutil] Cached modules in /home/user/.cache/webload (2 total):

- URL:  https://esm.sh/lodash-es@4.17.21
  Path: /home/user/.cache/webload/https/esm.sh/lodash-es@4.17.21
  Size: 142.15 KB | Cached: 2026-11-02T10:15:30.124Z

- URL:  https://esm.sh/canvas-confetti@1.9.4
  Path: /home/user/.cache/webload/https/esm.sh/canvas-confetti@1.9.4
  Size: 28.50 KB | Cached: 2026-11-02T10:16:05.000Z
```

### 2. Evict Specific Cached URLs

```bash
wicutil --remove https://esm.sh/lodash-es@4.17.21 https://esm.sh/canvas-confetti@1.9.4
```

Example output:
```text
[wicutil] Removed 2 cached module(s).
```

### 3. Clear the Entire Cache

```bash
wicutil --clear
```

Example output:
```text
[wicutil] Cache cleared successfully: /home/user/.cache/webload
```

### 4. Manage a Custom Cache Directory

```bash
# Using explicit --cache-dir
wicutil --cache-dir ./custom-cache --list

# Using configuration file
wicutil --config ./configs/webload.json --clear
```

---

## Cache Directory Resolution

The cache directory is determined according to the following precedence:
1. `--cache-dir <path>` CLI flag.
2. `cacheDir` property in the resolved `webload.json` configuration.
3. `WEBLOAD_CACHE_DIR` environment variable.
4. `XDG_CACHE_HOME/webload` if `XDG_CACHE_HOME` is defined.
5. Default user cache directory: `~/.cache/webload`.

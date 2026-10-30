/**
 * WebLoad Configuration Discovery and Management Subsystem
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

/**
 * Resolves the cache directory root.
 * Precedence:
 * 1. WEBLOAD_CACHE_DIR env variable
 * 2. XDG_CACHE_HOME/webload
 * 3. ~/.cache/webload
 * @returns {string}
 */
export function getCacheDir () {
	if (process.env.WEBLOAD_CACHE_DIR) {
		return path.resolve(process.env.WEBLOAD_CACHE_DIR);
	}

	if (process.env.XDG_CACHE_HOME) {
		return path.join(process.env.XDG_CACHE_HOME, 'webload');
	}

	return path.join(os.homedir(), '.cache', 'webload');
}

/**
 * Finds the config file path using 3-tier discovery.
 * 1. CLI path override (customPath)
 * 2. ./webload.json (cwd)
 * 3. ~/webload.json (home dir)
 * @param {string | null} [customPath]
 * @param {string} [cwd]
 * @returns {string | null}
 */
export function findConfigFile (customPath = null, cwd = process.cwd()) {
	if (customPath) {
		const resolved = path.resolve(cwd, customPath);
		if (fs.existsSync(resolved)) {
			return resolved;
		}
		throw new Error(`Configuration file not found at specified path: ${customPath}`);
	}

	// 2. ./webload.json
	const localConfig = path.join(cwd, 'webload.json');
	if (fs.existsSync(localConfig)) {
		return localConfig;
	}

	// 3. ~/webload.json
	const homeConfig = path.join(os.homedir(), 'webload.json');
	if (fs.existsSync(homeConfig)) {
		return homeConfig;
	}

	return null;
}

/**
 * Loads and parses a webload.json configuration file.
 * @param {string} filePath
 * @returns {Object}
 */
export function loadConfigFile (filePath) {
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const parsed = JSON.parse(raw);
		return parsed;
	} catch (err) {
		throw new Error(`Failed to read/parse configuration file at ${filePath}: ${err.message}`);
	}
}

/**
 * Resolves the active WebLoad configuration object.
 * @param {string | null} [customConfigPath]
 * @param {Object} [overrides]
 * @returns {{
 *   scriptSrc: string[] | null,
 *   imports: Record<string, string>,
 *   scopes: Record<string, Record<string, string>>,
 *   cacheDir: string,
 *   configPath: string | null,
 *   configBaseUrl: string
 * }}
 */
export function resolveConfig (customConfigPath = null, overrides = {}) {
	const cwd = overrides.cwd || process.cwd();
	const configPath = findConfigFile(customConfigPath, cwd);
	let fileConfig = {};

	if (configPath) {
		fileConfig = loadConfigFile(configPath);
	}

	const scriptSrc = overrides['script-src'] ?? overrides.scriptSrc ?? fileConfig['script-src'] ?? fileConfig.scriptSrc ?? null;
	const imports = Object.assign({}, fileConfig.imports, overrides.imports);
	const scopes = Object.assign({}, fileConfig.scopes, overrides.scopes);
	const cacheDir = overrides.cacheDir || (fileConfig.cacheDir ? path.resolve(fileConfig.cacheDir) : getCacheDir());

	const configBaseUrl = configPath
		? pathToFileURL(configPath).href
		: pathToFileURL(path.join(cwd, 'webload.json')).href;

	return {
		scriptSrc,
		imports,
		scopes,
		cacheDir,
		configPath,
		configBaseUrl
	};
}

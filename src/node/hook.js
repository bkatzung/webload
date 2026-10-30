/**
 * WebLoad Node.js Module Hooks (resolve & load)
 */

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { resolveConfig } from '../config.js';
import { resolveImportMap } from '../import-map.js';
import { validateScriptSrc } from '../security.js';
import { isCached, getCachePath } from '../cache.js';
import { fetchSync } from './sync-fetch.js';

let activeConfig = null;

/**
 * Gets or loads active configuration.
 * @returns {Object}
 */
export function getConfig () {
	if (!activeConfig) {
		const customConfig = process.env.WEBLOAD_CONFIG || null;
		activeConfig = resolveConfig(customConfig);
	}
	return activeConfig;
}

/**
 * Sets active configuration explicitly.
 * @param {Object} cfg
 */
export function setConfig (cfg) {
	activeConfig = cfg;
}

/**
 * Node.js ESM resolve hook.
 * Intercepts HTTP/HTTPS URLs and import-map mapped specifiers.
 * @param {string} specifier
 * @param {Object} context
 * @param {Function} nextResolve
 * @returns {Promise<Object>}
 */
export async function resolve (specifier, context, nextResolve) {
	const config = getConfig();
	const parentURL = context.parentURL || null;

	let target = specifier;

	// 1. Resolve via import map
	const importMap = {
		imports: config.imports || {},
		scopes: config.scopes || {}
	};

	const remapped = resolveImportMap(specifier, parentURL, importMap, config.configBaseUrl);
	if (remapped) {
		target = remapped;
	}

	// 2. Check if target is a remote HTTP/HTTPS URL
	if (/^https?:\/\//i.test(target)) {
		// Import-time security check (cache-agnostic)
		validateScriptSrc(target, config.scriptSrc);

		const cacheDir = config.cacheDir;
		let localPath = getCachePath(target, cacheDir);

		if (!isCached(target, cacheDir)) {
			const fetchResult = fetchSync(target, { cacheDir });
			localPath = fetchResult.filePath;
		}

		return {
			url: pathToFileURL(localPath).href,
			format: 'module',
			shortCircuit: true
		};
	}

	// 3. Handle relative imports from inside a cached remote module
	if (parentURL && parentURL.startsWith('file://')) {
		// Check if parent is inside the cacheDir and corresponds to a remote module
		const parentPath = fileURLToPath(parentURL);
		const cacheDir = config.cacheDir;

		if (parentPath.startsWith(cacheDir) && (target.startsWith('./') || target.startsWith('../'))) {
			// Resolve relative path on disk
			const resolvedPath = path.resolve(path.dirname(parentPath), target);
			if (fs.existsSync(resolvedPath)) {
				return {
					url: pathToFileURL(resolvedPath).href,
					format: 'module',
					shortCircuit: true
				};
			}

			// If file with .js extension exists
			if (fs.existsSync(`${resolvedPath}.js`)) {
				return {
					url: pathToFileURL(`${resolvedPath}.js`).href,
					format: 'module',
					shortCircuit: true
				};
			}

			// If index.js exists
			if (fs.existsSync(path.join(resolvedPath, 'index.js'))) {
				return {
					url: pathToFileURL(path.join(resolvedPath, 'index.js')).href,
					format: 'module',
					shortCircuit: true
				};
			}
		}
	}

	return nextResolve(target, context);
}

/**
 * Node.js ESM load hook.
 * @param {string} url
 * @param {Object} context
 * @param {Function} nextLoad
 * @returns {Promise<Object>}
 */
export async function load (url, context, nextLoad) {
	return nextLoad(url, context);
}

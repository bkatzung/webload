/**
 * WebLoad Bun Plugin Integration
 * Intercepts HTTP/HTTPS URLs and import-map remapped specifiers in Bun runtime.
 * Separates Resolution (onResolve) from Loading (onLoad).
 */

import { plugin } from 'bun';
import { resolveConfig } from '../config.js';
import { resolveImportMap } from '../import-map.js';
import { validateScriptSrc } from '../security.js';
import { isCached, readFromCacheSync } from '../cache.js';
import { fetchSync } from '../node/sync-fetch.js';

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
 * Creates and registers the WebLoad Bun plugin.
 * NOTE: Requires bun 1.4.4-canary.1 or later
 * @param {Object} [customConfig]
 */
export function registerWebloadBunPlugin (customConfig = null) {
	if (customConfig) {
		setConfig(customConfig);
	}

	plugin({
		name: 'webload-bun-plugin',
		setup (build) {
			const config = getConfig();
			const importMap = {
				imports: config.imports || {},
				scopes: config.scopes || {}
			};

			build.onResolve({ filter: /.*/ }, function (args) {
				const specifier = args.path;
				const webMain = specifier === 'WEBLOAD:MAIN';
				const importer = args.importer?.replace(/^_http_:/, '') || null;
				// Resolve the original, unmodified entry point if sentinel detected, or specifier otherwise
				let target = (specifier === 'WEBLOAD:MAIN') ? process.env.WEBLOAD_MAIN : specifier;

				const remapped = resolveImportMap(target, importer, importMap, config.configBaseUrl);

				if (remapped) {
					target = remapped;
				}

				// Check if target is a remote HTTP/HTTPS URL
				if (/^https?:\/\//i.test(target)) {
					return {
						path: target,
						namespace: '_http_'
					};
				}

				const fileTarget = /^\.{0,2}\//.test(target);

				// Resolve relative file paths to absolute URLs when parent URL is http(s)
				if (/^https?:\/\//i.test(importer)) {
					if (fileTarget) {
						const resolvedUrl = new URL(target, importer).href;

						return {
							path: resolvedUrl,
							namespace: '_http_'
						};
					}
				}

				if (fileTarget) {
					return {
						path: target,
						namespace: 'file'
					}
				}
			});

			build.onLoad({ filter: /.*/, namespace: '_http_' }, function (args) {
				const url = args.path;

				// 1. Security validation
				validateScriptSrc(url, config.scriptSrc);

				// 2. Cache lookup and cache-miss fetch
				const cacheDir = config.cacheDir;
				let contents;

				if (isCached(url, cacheDir)) {
					const cached = readFromCacheSync(url, cacheDir);

					contents = cached?.code;
				} else {
					const fetchResult = fetchSync(url, { cacheDir });

					contents = fetchResult.content;
				}

				// 3. Return module source
				return {
					contents,
					loader: 'js'
				};
			});
		}
	});
}

// Auto-register when loaded via bun -r / --preload
registerWebloadBunPlugin();

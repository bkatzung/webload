/**
 * WebLoad Bun Plugin Integration
 * Intercepts HTTP/HTTPS URLs and import-map remapped specifiers in Bun runtime.
 */

import { plugin } from 'bun';
import path from 'node:path';
import fs from 'node:fs';
import { resolveConfig } from '../config.js';
import { resolveImportMap } from '../import-map.js';
import { validateScriptSrc } from '../security.js';
import { isCached, getCachePath, writeToCacheSync } from '../cache.js';

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

			// Intercept HTTP and HTTPS URLs
			build.onResolve({ filter: /^https?:\/\// }, async function (args) {
				const specifier = args.path;
				const importer = args.importer || null;

				// 1. Resolve via import map if applicable
				const remapped = resolveImportMap(specifier, importer, importMap, config.configBaseUrl);
				const targetUrl = remapped || specifier;
				console.log('target', targetURL);

				// 2. Validate against script-src allowlist
				validateScriptSrc(targetUrl, config.scriptSrc);

				const cacheDir = config.cacheDir;
				let localPath = getCachePath(targetUrl, cacheDir);
				console.log('local', localPath);

				// 3. Cache lookup & fetch on miss
				if (!isCached(targetUrl, cacheDir)) {
					const res = await fetch(targetUrl, {
						headers: {
							'User-Agent': 'WebLoad/0.1.0 (Bun)'
						},
						redirect: 'follow'
					});

					if (!res.ok) {
						throw new Error(`Failed to fetch remote module '${targetUrl}': ${res.status} ${res.statusText}`);
					}

					const content = await res.text();
					const contentType = res.headers.get('content-type') || 'application/javascript';
					localPath = writeToCacheSync(
						res.url || targetUrl,
						content,
						{ contentType },
						cacheDir
					);
				}

				return {
					path: localPath
				};
			});

			// Intercept bare specifiers mapped via import map
			if (config.imports && Object.keys(config.imports).length > 0) {
				const keys = Object.keys(config.imports);
				for (const key of keys) {
					const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					const regex = new RegExp(`^${escapedKey}`);

					build.onResolve({ filter: regex }, async function (args) {
						const specifier = args.path;
						const importer = args.importer || null;
						const remapped = resolveImportMap(specifier, importer, importMap, config.configBaseUrl);

						if (remapped && /^https?:\/\//i.test(remapped)) {
							// Validate security
							validateScriptSrc(remapped, config.scriptSrc);

							const cacheDir = config.cacheDir;
							let localPath = getCachePath(remapped, cacheDir);

							if (!isCached(remapped, cacheDir)) {
								const res = await fetch(remapped, {
									headers: {
										'User-Agent': 'WebLoad/0.1.0 (Bun)'
									},
									redirect: 'follow'
								});

								if (!res.ok) {
									throw new Error(`Failed to fetch remote module '${remapped}': ${res.status} ${res.statusText}`);
								}

								const content = await res.text();
								const contentType = res.headers.get('content-type') || 'application/javascript';
								localPath = writeToCacheSync(
									res.url || remapped,
									content,
									{ contentType },
									cacheDir
								);
							}

							return {
								path: localPath
							};
						}

						return undefined;
					});
				}
			}
		}
	});
}

// Auto-register when loaded via bun -r / --preload
registerWebloadBunPlugin();

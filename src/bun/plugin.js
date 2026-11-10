/**
 * WebLoad Bun Plugin Integration
 * Intercepts HTTP/HTTPS URLs and import-map remapped specifiers in Bun runtime.
 * Handles redirection security, relative resolution against canonical URL,
 * and metadata-first cache resolution.
 */

import { plugin } from 'bun';
import { resolveConfig } from '../config.js';
import { resolveImportMap } from '../import-map.js';
import { validateScriptSrc } from '../security.js';
import { isCached, readFromCacheSync } from '../cache.js';
import { fetchSync } from '../node/sync-fetch.js';

let activeConfig = null;

/**
 * In-memory map from initial/intermediate requested URL to canonical final response URL.
 * @type {Map<string, string>}
 */
export const canonicalUrlMap = new Map();

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
 * Resolves module source by following cached redirects or fetching over network.
 * @param {string} initialUrl
 * @param {Object} config
 * @returns {{ content: string, finalUrl: string }}
 */
export function resolveModuleSource (initialUrl, config) {
	let currentUrl = initialUrl;
	const maxHops = 20;
	let hopCount = 0;
	let content = null;
	let finalUrl = initialUrl;

	while (true) {
		// Validate current hop against active CSP rules
		validateScriptSrc(currentUrl, config.scriptSrc);

		if (isCached(currentUrl, config.cacheDir)) {
			const cached = readFromCacheSync(currentUrl, config.cacheDir);
			if (cached?.isRedirect) {
				hopCount++;
				if (hopCount > maxHops) {
					throw new Error(`Too many redirects (maximum of ${maxHops} exceeded) for ${initialUrl}`);
				}
				const nextUrl = new URL(cached.location, currentUrl).href;
				currentUrl = nextUrl;
				continue;
			} else if (cached?.code !== null && cached?.code !== undefined) {
				content = cached.code;
				finalUrl = currentUrl;
				break;
			}
		}

		// Cache miss or terminal target missing from cache -> fetch from network
		const fetchResult = fetchSync(currentUrl, {
			cacheDir: config.cacheDir,
			scriptSrc: config.scriptSrc,
			timeout: config.timeout
		});

		content = fetchResult.content;
		finalUrl = fetchResult.finalUrl || currentUrl;
		break;
	}

	canonicalUrlMap.set(initialUrl, finalUrl);
	if (finalUrl !== initialUrl) {
		canonicalUrlMap.set(finalUrl, finalUrl);
	}

	return { content, finalUrl };
}

/**
 * Creates and registers the WebLoad Bun plugin.
 * NOTE: Requires bun 1.4.4-canary.1 (*post-release*) or later
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
				const rawImporter = args.importer?.replace(/^_http_:/, '') || null;
				const importer = (rawImporter && canonicalUrlMap.get(rawImporter)) || rawImporter;

				// Resolve the original, unmodified entry point if sentinel detected, or specifier otherwise
				let target = (specifier === 'WEBLOAD:MAIN') ? process.env.WEBLOAD_MAIN : specifier;

				const remapped = resolveImportMap(target, importer, importMap, config.configBaseUrl);

				if (remapped) {
					target = remapped.replace(/^file:\/\//, '');
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
				if (importer && /^https?:\/\//i.test(importer)) {
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
					};
				}
			});

			build.onLoad({ filter: /.*/, namespace: '_http_' }, function (args) {
				const url = args.path;
				const { content } = resolveModuleSource(url, config);

				return {
					contents: content,
					loader: 'js'
				};
			});
		}
	});
}

// Auto-register when loaded via bun -r / --preload
registerWebloadBunPlugin();

/**
 * WebLoad Node.js Module Hooks (resolve & load)
 * Handles redirection security, relative resolution against canonical URL,
 * and metadata-first cache resolution.
 */

import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { resolveConfig } from '../config.js';
import { resolveImportMap } from '../import-map.js';
import { validateScriptSrc } from '../security.js';
import { isCached, getCachePath, readFromCacheSync } from '../cache.js';
import { fetchSync } from './sync-fetch.js';

let activeConfig = null;

/**
 * In-memory map from initial/intermediate requested URL to canonical final response URL.
 * Used for resolving relative imports (e.g. ./utils.js) against the redirected base URL.
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
 * Node.js ESM resolve hook.
 * Intercepts HTTP/HTTPS URLs and import-map mapped specifiers.
 * Resolves relative file paths to absolute URLs when parent URL is http(s).
 * @param {string} specifier
 * @param {Object} context
 * @param {Function} nextResolve
 * @returns {Promise<Object>}
 */
export function resolve (specifier, context, nextResolve) {
	const config = getConfig();
	const rawParentURL = context?.parentURL || null;
	const parentURL = (rawParentURL && canonicalUrlMap.get(rawParentURL)) || rawParentURL;

	// Resolve unmodified original entry point if sentinel detected, or specifier otherwise
	let target = (!parentURL && specifier.endsWith('/WEBLOAD:MAIN')) ? process.env.WEBLOAD_MAIN : specifier;
	const importMap = {
		imports: config.imports || {},
		scopes: config.scopes || {}
	};
	const remapped = resolveImportMap(target, parentURL, importMap, config.configBaseUrl);

	if (remapped) {
		target = remapped;
	}

	// Check if target is a remote HTTP/HTTPS URL
	if (/^https?:\/\//i.test(target)) {
		return {
			url: target,
			shortCircuit: true
		};
	}

	// Resolve relative file paths to absolute URLs when parent URL is http(s)
	if (parentURL && /^https?:\/\//i.test(parentURL)) {
		if (target.startsWith('./') || target.startsWith('../') || target.startsWith('/')) {
			const resolvedUrl = new URL(target, parentURL).href;

			return {
				url: resolvedUrl,
				shortCircuit: true
			};
		}
	}

	return nextResolve(target, context);
}

/**
 * Node.js ESM load hook.
 * Handles security check, cache lookup/fetching, and returns module source.
 * @param {string} url
 * @param {Object} context
 * @param {Function} nextLoad
 * @returns {Promise<Object>}
 */
export function load (url, context, nextLoad) {
	if (/^https?:\/\//i.test(url)) {
		const config = getConfig();
		const { content, finalUrl } = resolveModuleSource(url, config);

		return {
			format: 'module',
			source: content,
			responseURL: finalUrl,
			shortCircuit: true
		};
	}

	return nextLoad(url, context);
}

registerHooks({ resolve, load });

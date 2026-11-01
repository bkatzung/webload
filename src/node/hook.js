/**
 * WebLoad Node.js Module Hooks (resolve & load)
 */

import fs from 'node:fs';
import { resolveConfig } from '../config.js';
import { resolveImportMap } from '../import-map.js';
import { validateScriptSrc } from '../security.js';
import { isCached, getCachePath, readFromCacheSync } from '../cache.js';
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
 * Resolves relative file paths to absolute URLs when parent URL is http(s).
 * @param {string} specifier
 * @param {Object} context
 * @param {Function} nextResolve
 * @returns {Promise<Object>}
 */
export function resolve (specifier, context, nextResolve) {
	const config = getConfig();
	const parentURL = context?.parentURL || null;

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

		// 1. Check allowed URL (security check)
		validateScriptSrc(url, config.scriptSrc);

		// 2. Handle cache misses
		const cacheDir = config.cacheDir;
		let content;

		if (isCached(url, cacheDir)) {
			const cached = readFromCacheSync(url, cacheDir);

			content = cached?.code;
		} else {
			const fetchResult = fetchSync(url, { cacheDir });

			content = fetchResult.content;
		}

		// 3. Return cache file contents
		return {
			format: 'module',
			source: content,
			shortCircuit: true
		};
	}

	return nextLoad(url, context);
}

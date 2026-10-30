/**
 * WebLoad Import Map Subsystem: WICG Import Maps Standard Resolver
 */

/**
 * Checks if a string is a URL (has scheme) or relative path.
 * @param {string} specifier
 * @returns {boolean}
 */
export function isUrlOrPath (specifier) {
	return (
		specifier.startsWith('/') ||
		specifier.startsWith('./') ||
		specifier.startsWith('../') ||
		/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)
	);
}

/**
 * Resolves a target address against a base URL string or URL object.
 * @param {string} address
 * @param {string | URL} baseUrl
 * @returns {string}
 */
export function resolveAddress (address, baseUrl) {
	try {
		const base = typeof baseUrl === 'string' ? new URL(baseUrl) : baseUrl;
		return new URL(address, base).href;
	} catch {
		return address;
	}
}

/**
 * Normalizes an imports map object with targets resolved against baseUrl.
 * @param {Record<string, string>} imports
 * @param {string | URL} baseUrl
 * @returns {Record<string, string>}
 */
export function normalizeImports (imports, baseUrl) {
	const normalized = {};
	if (!imports || typeof imports !== 'object') {
		return normalized;
	}

	for (const [key, target] of Object.entries(imports)) {
		if (typeof target !== 'string') {
			continue;
		}

		if (key.endsWith('/') && !target.endsWith('/')) {
			console.warn(`[webload:import-map] Invalid mapping: key "${key}" ends with '/' but target "${target}" does not.`);
			continue;
		}

		if (isUrlOrPath(target)) {
			normalized[key] = resolveAddress(target, baseUrl);
		} else {
			normalized[key] = target;
		}
	}

	return normalized;
}

/**
 * Normalizes an entire import map specification (imports and scopes).
 * @param {Object} importMap
 * @param {string | URL} [baseUrl]
 * @returns {{ imports: Record<string, string>, scopes: Record<string, Record<string, string>> }}
 */
export function normalizeImportMap (importMap, baseUrl = 'file:///') {
	const result = {
		imports: {},
		scopes: {}
	};

	if (!importMap || typeof importMap !== 'object') {
		return result;
	}

	if (importMap.imports && typeof importMap.imports === 'object') {
		result.imports = normalizeImports(importMap.imports, baseUrl);
	}

	if (importMap.scopes && typeof importMap.scopes === 'object') {
		for (const [scopeKey, scopeImports] of Object.entries(importMap.scopes)) {
			const resolvedScopeKey = isUrlOrPath(scopeKey)
				? resolveAddress(scopeKey, baseUrl)
				: scopeKey;
			result.scopes[resolvedScopeKey] = normalizeImports(scopeImports, baseUrl);
		}
	}

	return result;
}

/**
 * Matches a specifier against a sorted list of prefix keys.
 * @param {string} specifier
 * @param {Record<string, string>} entries
 * @returns {string | null}
 */
export function matchSpecifierInMap (specifier, entries) {
	if (!entries || typeof entries !== 'object') {
		return null;
	}

	// 1. Exact match
	if (Object.prototype.hasOwnProperty.call(entries, specifier)) {
		return entries[specifier];
	}

	// 2. Prefix match (sorted by length descending for longest prefix match)
	const prefixKeys = Object.keys(entries)
		.filter(function (key) { return key.endsWith('/'); })
		.sort(function (a, b) { return b.length - a.length; });

	for (const prefix of prefixKeys) {
		if (specifier.startsWith(prefix)) {
			const targetPrefix = entries[prefix];
			const remainder = specifier.slice(prefix.length);
			return targetPrefix + remainder;
		}
	}

	return null;
}

/**
 * Resolves a module specifier against a normalized or raw import map.
 * @param {string} specifier - The import specifier to resolve
 * @param {string | URL | null} [referrerUrl] - The URL or path of the importing script
 * @param {Object} [importMap] - The import map containing `imports` and/or `scopes`
 * @param {string | URL} [baseUrl] - Base URL for relative resolution
 * @returns {string | null} - The resolved specifier/URL, or null if no mapping applies
 */
export function resolveImportMap (specifier, referrerUrl = null, importMap = null, baseUrl = 'file:///') {
	if (!importMap || typeof importMap !== 'object') {
		return null;
	}

	const normalizedMap = normalizeImportMap(importMap, baseUrl);
	const referrerStr = referrerUrl
		? (typeof referrerUrl === 'string' ? resolveAddress(referrerUrl, baseUrl) : referrerUrl.href)
		: null;

	// 1. Check scopes if referrer is available
	if (referrerStr && normalizedMap.scopes) {
		const matchingScopes = Object.keys(normalizedMap.scopes)
			.filter(function (scopeKey) { return referrerStr.startsWith(scopeKey); })
			.sort(function (a, b) { return b.length - a.length; });

		for (const scopeKey of matchingScopes) {
			const scopeEntries = normalizedMap.scopes[scopeKey];
			const resolved = matchSpecifierInMap(specifier, scopeEntries);
			if (resolved !== null) {
				return resolved;
			}
		}
	}

	// 2. Check top-level imports
	if (normalizedMap.imports) {
		const resolved = matchSpecifierInMap(specifier, normalizedMap.imports);
		if (resolved !== null) {
			return resolved;
		}
	}

	return null;
}

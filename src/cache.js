/**
 * WebLoad Cache Subsystem: Atomic Local Filesystem Cache
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getCacheDir } from './config.js';

/**
 * Sanitizes a string for safe filesystem path segments.
 * Replaces illegal filesystem characters.
 * @param {string} segment
 * @returns {string}
 */
export function sanitizePathSegment (segment) {
	return segment
		.replace(/[:*?"<>|]/g, '_')
		.replace(/\\/g, '/');
}

/**
 * Encodes query string into a safe filename suffix.
 * @param {string} search
 * @returns {string}
 */
export function encodeQueryString (search) {
	if (!search || search === '?') {
		return '';
	}
	const hash = crypto.createHash('sha256').update(search).digest('hex').slice(0, 8);
	return `_q_${hash}`;
}

/**
 * Computes the relative cache path for a given URL.
 * Preserves directory hierarchy for relative import resolution.
 * @param {string | URL} targetUrl
 * @returns {string}
 */
export function urlToRelativeCachePath (targetUrl) {
	const urlObj = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;

	// Host part (e.g. esm.sh or localhost_3000)
	let hostPart = urlObj.hostname;
	if (urlObj.port && urlObj.port !== '80' && urlObj.port !== '443') {
		hostPart = `${hostPart}_${urlObj.port}`;
	}
	hostPart = sanitizePathSegment(hostPart);

	let pathname = decodeURIComponent(urlObj.pathname);
	if (!pathname || pathname === '/') {
		pathname = '/index.js';
	} else if (pathname.endsWith('/')) {
		pathname = `${pathname}index.js`;
	}

	// Split into segments and sanitize each
	const rawSegments = pathname.split('/').filter(Boolean);
	const segments = rawSegments.map(function (s) { return sanitizePathSegment(s); });

	// Prefix the last (file) path component with $
	const lastIdx = segments.length - 1;
	const lastSegment = segments[lastIdx];

	// Handle query parameters if present
	if (urlObj.search) {
		const querySuffix = encodeQueryString(urlObj.search);
		const ext = path.extname(lastSegment);
		const base = path.basename(lastSegment, ext);
		segments[lastIdx] = `$${base}${querySuffix}${ext}`;
	} else {
		segments[lastIdx] = `$${lastSegment}`;
	}

	return path.join(hostPart, ...segments);
}

/**
 * Computes the absolute filesystem path for a cached module.
 * @param {string | URL} targetUrl
 * @param {string} [cacheDir]
 * @returns {string}
 */
export function getCachePath (targetUrl, cacheDir = getCacheDir()) {
	const relPath = urlToRelativeCachePath(targetUrl);
	return path.join(cacheDir, relPath);
}

/**
 * Checks if a URL is already present in cache and not expired.
 * Inspects .meta.json first to support cached redirects and expiration tracking.
 * @param {string | URL} targetUrl
 * @param {string} [cacheDir]
 * @returns {boolean}
 */
export function isCached (targetUrl, cacheDir = getCacheDir()) {
	const filePath = getCachePath(targetUrl, cacheDir);
	const metaPath = `${filePath}.meta.json`;

	if (fs.existsSync(metaPath)) {
		try {
			const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
			if (meta?.expiresAt) {
				const expiresTime = new Date(meta.expiresAt).getTime();
				if (!Number.isNaN(expiresTime) && Date.now() > expiresTime) {
					return false; // Expired entry -> cache miss
				}
			}
			if (meta?.isRedirect === true || typeof meta?.location === 'string') {
				return true; // Redirect entry without content file
			}
		} catch {
			// ignore corrupt meta and fall back to checking primary content file
		}
	}

	return fs.existsSync(filePath);
}

/**
 * Reads cached module content and metadata.
 * Inspects .meta.json first to handle expiration, redirects, and primary files.
 * @param {string | URL} targetUrl
 * @param {string} [cacheDir]
 * @returns {{ isRedirect?: boolean, location?: string, code?: string | null, meta: Object | null, filePath: string } | null}
 */
export function readFromCacheSync (targetUrl, cacheDir = getCacheDir()) {
	const filePath = getCachePath(targetUrl, cacheDir);
	const metaPath = `${filePath}.meta.json`;
	let meta = null;

	if (fs.existsSync(metaPath)) {
		try {
			meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
		} catch {
			meta = null;
		}
	}

	if (meta?.expiresAt) {
		const expiresTime = new Date(meta.expiresAt).getTime();
		if (!Number.isNaN(expiresTime) && Date.now() > expiresTime) {
			return null; // Expired entry -> cache miss
		}
	}

	if (meta?.isRedirect === true || typeof meta?.location === 'string') {
		return {
			isRedirect: true,
			location: meta.location,
			code: null,
			meta,
			filePath
		};
	}

	if (!fs.existsSync(filePath)) {
		return null;
	}

	const code = fs.readFileSync(filePath, 'utf8');

	return {
		isRedirect: false,
		code,
		meta,
		filePath
	};
}

/**
 * Ensures directory contains an auxiliary package.json with {"type": "module"}.
 * Never modifies root cache directory package.json.
 * @param {string} dirPath
 */
export function ensureModulePackageJsonSync (dirPath) {
	const pkgPath = path.join(dirPath, 'package.json');
	if (!fs.existsSync(pkgPath)) {
		try {
			fs.writeFileSync(pkgPath, JSON.stringify({ type: 'module' }, null, '\t'), 'utf8');
		} catch {
			// Ignore concurrency race if already written
		}
	}
}

/**
 * Writes module content and metadata to cache atomically.
 * Synchronous version for Node.js synchronous loader hook.
 * Supports writing redirect-only entries when content is null/undefined.
 * @param {string | URL} targetUrl
 * @param {string | Buffer | null} content
 * @param {Object} [metaOptions]
 * @param {string} [cacheDir]
 * @returns {string} Absolute path to written cached file or metadata
 */
export function writeToCacheSync (targetUrl, content, metaOptions = {}, cacheDir = getCacheDir()) {
	const urlStr = typeof targetUrl === 'string' ? targetUrl : targetUrl.href;
	const finalPath = getCachePath(urlStr, cacheDir);
	const targetDir = path.dirname(finalPath);

	// Ensure target directory exists
	fs.mkdirSync(targetDir, { recursive: true });

	// Write primary content file if content is provided
	if (content !== null && content !== undefined) {
		const tempFilename = `.tmp.${crypto.randomUUID()}${path.extname(finalPath)}`;
		const tempPath = path.join(targetDir, tempFilename);

		fs.writeFileSync(tempPath, content);
		fs.renameSync(tempPath, finalPath);
	}

	// Write metadata file
	const meta = {
		url: urlStr,
		cachedAt: new Date().toISOString(),
		...metaOptions
	};

	if (content !== null && content !== undefined) {
		if (!meta.contentType) {
			meta.contentType = metaOptions.contentType || 'application/javascript';
		}
		if (meta.size === undefined) {
			meta.size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8');
		}
	}

	const metaTempPath = path.join(targetDir, `.tmp.${crypto.randomUUID()}.meta.json`);
	const metaFinalPath = `${finalPath}.meta.json`;

	try {
		fs.writeFileSync(metaTempPath, JSON.stringify(meta, null, '\t'), 'utf8');
		fs.renameSync(metaTempPath, metaFinalPath);
	} catch {
		// Non-fatal if metadata fails
	}

	return finalPath;
}

/**
 * Asynchronous atomic cache write.
 * @param {string | URL} targetUrl
 * @param {string | Buffer} content
 * @param {Object} [metaOptions]
 * @param {string} [cacheDir]
 * @returns {Promise<string>}
 */
export async function writeToCache (targetUrl, content, metaOptions = {}, cacheDir = getCacheDir()) {
	return writeToCacheSync(targetUrl, content, metaOptions, cacheDir);
}

/**
 * Clears the entire cache directory.
 * @param {string} [cacheDir]
 * @returns {boolean}
 */
export function clearCache (cacheDir = getCacheDir()) {
	if (fs.existsSync(cacheDir)) {
		fs.rmSync(cacheDir, { recursive: true, force: true });
		return true;
	}
	return false;
}

/**
 * Recursively scans directory for cached modules and their metadata.
 * @param {string} [cacheDir]
 * @returns {Array<{ url: string, filePath: string, cachedAt: string | null, size: number }>}
 */
export function listCache (cacheDir = getCacheDir()) {
	const results = [];
	if (!fs.existsSync(cacheDir)) {
		return results;
	}

	function walk (dir) {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile()) {
				// Ignore auxiliary files and temp files
				if (
					entry.name === 'package.json' ||
					entry.name.endsWith('.meta.json') ||
					entry.name.startsWith('.tmp.')
				) {
					continue;
				}

				let url = null;
				let cachedAt = null;
				let size = 0;

				const metaPath = `${fullPath}.meta.json`;
				if (fs.existsSync(metaPath)) {
					try {
						const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
						url = meta.url;
						cachedAt = meta.cachedAt;
						size = meta.size;
					} catch {
						// fallback
					}
				}

				if (!size) {
					try {
						size = fs.statSync(fullPath).size;
					} catch {
						size = 0;
					}
				}

				if (!url) {
					// Infer original URL from relative path
					const rel = path.relative(cacheDir, fullPath).replace(/\\/g, '/');
					const parts = rel.split('/');
					parts[parts.length - 1] = parts[parts.length - 1].replace(/^\$/, '');
					url = `https://${parts.join('/')}`;
				}

				results.push({
					url,
					filePath: fullPath,
					cachedAt,
					size
				});
			}
		}
	}

	walk(cacheDir);
	return results;
}

/**
 * Removes cached files for specific URLs.
 * @param {string[]} urls
 * @param {string} [cacheDir]
 * @returns {number} Number of evicted entries
 */
export function removeCache (urls, cacheDir = getCacheDir()) {
	let removedCount = 0;
	if (!Array.isArray(urls) || urls.length === 0) {
		return removedCount;
	}

	for (const targetUrl of urls) {
		const filePath = getCachePath(targetUrl, cacheDir);
		const metaPath = `${filePath}.meta.json`;

		let removedAny = false;
		if (fs.existsSync(filePath)) {
			fs.rmSync(filePath, { force: true });
			removedAny = true;
		}
		if (fs.existsSync(metaPath)) {
			fs.rmSync(metaPath, { force: true });
			removedAny = true;
		}

		if (removedAny) {
			removedCount++;
		}
	}

	return removedCount;
}

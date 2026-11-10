/**
 * WebLoad Node.js Synchronous Fetch Client
 * Uses Worker Thread + Atomics.wait for robust, non-blocking synchronous network retrieval.
 */

import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeToCacheSync } from '../cache.js';
import { reportSecurityViolation } from '../security.js';

let workerInstance = null;
let reqCounter = 0;

/**
 * Initializes or returns the background fetch worker.
 * @returns {Worker}
 */
export function getWorker () {
	if (!workerInstance) {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const workerPath = path.join(currentDir, 'sync-fetch-worker.js');

		workerInstance = new Worker(workerPath);
		workerInstance.on('error', (err) => {
			console.error('[sync-fetch] Worker error event:', err);
		});
		workerInstance.on('exit', (code) => {
			// Worker exited
		});
		workerInstance.unref();
	}
	return workerInstance;
}

/**
 * Synchronously fetches and caches a URL over HTTP/HTTPS.
 * @param {string | URL} targetUrl
 * @param {Object} [options]
 * @param {number} [options.timeout=30000]
 * @param {string[]} [options.scriptSrc]
 * @param {string} [options.cacheDir]
 * @returns {{ content: string, filePath: string | null, meta: Object, finalUrl: string }}
 */
export function fetchSync (targetUrl, options = {}) {
	const urlStr = typeof targetUrl === 'string' ? targetUrl : targetUrl.href;
	const timeout = typeof options.timeout === 'number' && options.timeout > 0 ? options.timeout : 30000;
	const scriptSrc = options.scriptSrc || [];
	const worker = getWorker();

	const reqId = ++reqCounter;
	const tempDir = os.tmpdir();
	const tempOutPath = path.join(tempDir, `webload-fetch-${reqId}-${crypto.randomUUID()}.tmp`);

	const statusBuffer = new SharedArrayBuffer(4);
	const status = new Int32Array(statusBuffer);

	Atomics.store(status, 0, 0); // 0 = pending

	worker.postMessage({
		id: reqId,
		url: urlStr,
		timeout,
		scriptSrc,
		tempOutPath,
		statusBuffer
	});

	// Wait with 500ms IPC grace period beyond network timeout
	const waitTimeout = timeout + 500;
	const result = Atomics.wait(status, 0, 0, waitTimeout);

	if (result === 'timed-out') {
		// Worker completely deadlocked; terminate worker instance and re-spawn on next call
		if (workerInstance) {
			try {
				workerInstance.terminate();
			} catch {
				// ignore
			}
			workerInstance = null;
		}

		try {
			if (fs.existsSync(tempOutPath)) fs.unlinkSync(tempOutPath);
			if (fs.existsSync(`${tempOutPath}.meta`)) fs.unlinkSync(`${tempOutPath}.meta`);
		} catch {
			// ignore
		}
		throw new Error(`Synchronous fetch for '${urlStr}' timed out after ${timeout}ms`);
	}

	const statusCode = Atomics.load(status, 0);

	if (statusCode === 2) {
		let info = null;

		try {
			if (fs.existsSync(tempOutPath)) {
				info = JSON.parse(fs.readFileSync(tempOutPath, 'utf8'));
				fs.unlinkSync(tempOutPath);
			}
		} catch {
			// ignore
		}

		if (info?.type === 'CSP_VIOLATION') {
			throw reportSecurityViolation(info.violatingUrl || urlStr, scriptSrc);
		}

		if (info?.type === 'TIMEOUT') {
			throw new Error(`Synchronous fetch for '${urlStr}' timed out after ${timeout}ms`);
		}

		const errMsg = info
			? `Fetch failed with status ${info.status} ${info.statusText || ''} for ${urlStr}`
			: `Network fetch failed for ${urlStr}`;
		throw new Error(errMsg);
	}

	if (!fs.existsSync(tempOutPath)) {
		throw new Error(`Fetch output file missing for ${urlStr}`);
	}

	const contentBuffer = fs.readFileSync(tempOutPath);
	const metaPath = `${tempOutPath}.meta`;
	let meta = { url: urlStr, contentType: 'application/javascript', isCacheable: true };

	if (fs.existsSync(metaPath)) {
		try {
			meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
			fs.unlinkSync(metaPath);
		} catch {
			// ignore
		}
	}

	try {
		fs.unlinkSync(tempOutPath);
	} catch {
		// ignore
	}

	const content = contentBuffer.toString('utf8');
	const finalUrl = meta.finalUrl || urlStr;

	// Persist intermediate redirect hops if cacheable
	if (Array.isArray(meta.hops)) {
		for (const hop of meta.hops) {
			if (hop.isCacheable !== false) {
				try {
					writeToCacheSync(
						hop.url,
						null,
						{
							isRedirect: true,
							location: hop.location,
							statusCode: hop.statusCode,
							expiresAt: hop.expiresAt
						},
						options.cacheDir
					);
				} catch {
					// Non-fatal if hop cache fails
				}
			}
		}
	}

	// Persist final code file if cacheable
	let cachedFilePath = null;
	if (meta.isCacheable !== false) {
		cachedFilePath = writeToCacheSync(
			finalUrl,
			content,
			{
				contentType: meta.contentType,
				isRedirect: false,
				statusCode: meta.status,
				expiresAt: meta.expiresAt
			},
			options.cacheDir
		);
	}

	return {
		content,
		filePath: cachedFilePath,
		meta,
		finalUrl
	};
}

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

let workerInstance = null;
let reqCounter = 0;

/**
 * Initializes or returns the background fetch worker.
 * @returns {Worker}
 */
function getWorker () {
	if (!workerInstance) {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const workerPath = path.join(currentDir, 'sync-fetch-worker.js');

		workerInstance = new Worker(workerPath);
		workerInstance.on('error', (err) => {
			console.error('[sync-fetch] Worker error event:', err);
		});
		workerInstance.on('exit', (code) => {
			console.log('[sync-fetch] Worker exit event with code:', code);
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
 * @param {string} [options.cacheDir]
 * @returns {{ content: string, filePath: string, meta: Object }}
 */
export function fetchSync (targetUrl, options = {}) {
	const urlStr = typeof targetUrl === 'string' ? targetUrl : targetUrl.href;
	const timeout = options.timeout || 30000;
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
		tempOutPath,
		statusBuffer
	});

	const result = Atomics.wait(status, 0, 0, timeout);

	if (result === 'timed-out') {
		try {
			if (fs.existsSync(tempOutPath)) fs.unlinkSync(tempOutPath);
		} catch {
			// ignore
		}
		throw new Error(`Synchronous fetch for '${urlStr}' timed out after ${timeout}ms`);
	}

	const statusCode = Atomics.load(status, 0);

	if (statusCode === 2) {
		let errMsg = 'Network fetch failed';

		try {
			if (fs.existsSync(tempOutPath)) {
				const info = JSON.parse(fs.readFileSync(tempOutPath, 'utf8'));

				errMsg = `Fetch failed with status ${info.status} ${info.statusText || ''} for ${urlStr}`;
				fs.unlinkSync(tempOutPath);
			}
		} catch {
			// ignore
		}
		throw new Error(errMsg);
	}

	if (!fs.existsSync(tempOutPath)) {
		throw new Error(`Fetch output file missing for ${urlStr}`);
	}

	const contentBuffer = fs.readFileSync(tempOutPath);
	const metaPath = `${tempOutPath}.meta`;
	let meta = { url: urlStr, contentType: 'application/javascript' };

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
	const cachedFilePath = writeToCacheSync(
		meta.finalUrl || urlStr,
		content,
		{ contentType: meta.contentType },
		options.cacheDir
	);

	return {
		content,
		filePath: cachedFilePath,
		meta
	};
}

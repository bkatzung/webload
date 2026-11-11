/**
 * WebLoad Node.js Synchronous Fetch Worker
 * Runs in worker thread to perform async fetch operations for the main thread.
 * Implements manual redirect loop, AbortSignal timeout, per-hop CSP validation,
 * and Cache-Control inspection.
 */

const MAX_HOPS = 20;

import { parentPort } from 'node:worker_threads';
import fs from 'node:fs';
import { isAllowedScriptSrc } from '../security.js';

/**
 * Parses HTTP Cache-Control header for uncacheable directives and max-age expiration.
 * @param {string | null} header
 * @returns {{ isCacheable: boolean, expiresAt: string | null }}
 */
function parseCacheControl (header) {
	if (!header || typeof header !== 'string') {
		return { isCacheable: true, expiresAt: null };
	}

	const tokens = header.toLowerCase().split(',').map(function (t) { return t.trim(); });
	const uncacheableDirectives = ['no-store', 'no-cache', 'private', 'must-revalidate'];

	for (const dir of uncacheableDirectives) {
		if (tokens.includes(dir)) {
			return { isCacheable: false, expiresAt: null };
		}
	}

	let expiresAt = null;
	for (const token of tokens) {
		const match = token.match(/^max-age\s*=\s*(\d+)$/);
		if (match) {
			const seconds = parseInt(match[1], 10);
			if (!Number.isNaN(seconds)) {
				expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
			}
		}
	}

	return { isCacheable: true, expiresAt };
}

if (parentPort) {
	parentPort.on('message', async function (msg) {
		const {
			id,
			url,
			timeout = 30000,
			scriptSrc = [],
			tempOutPath,
			statusBuffer
		} = msg;
		const status = new Int32Array(statusBuffer);

		try {
			const signal = AbortSignal.timeout(timeout);
			let currentUrl = url;
			const hops = [];
			let hopCount = 0;

			while (true) {
				const res = await fetch(currentUrl, {
					headers: {
						'User-Agent': 'WebLoad/0.6.0 (Node.js)'
					},
					redirect: 'manual',
					signal
				});

				// Check for 3xx redirect status codes
				if (
					res.status === 301 ||
					res.status === 302 ||
					res.status === 303 ||
					res.status === 307 ||
					res.status === 308
				) {
					hopCount++;
					if (hopCount > MAX_HOPS) {
						throw new Error(`Too many redirects (maximum of ${MAX_HOPS} exceeded)`);
					}

					const rawLocation = res.headers.get('location');
					if (!rawLocation) {
						throw new Error(`Redirect response (${res.status}) missing Location header for ${currentUrl}`);
					}

					const nextUrl = new URL(rawLocation, currentUrl).href;

					// Validate redirect target URL against script-src
					if (Array.isArray(scriptSrc) && scriptSrc.length > 0 && !isAllowedScriptSrc(nextUrl, scriptSrc)) {
						const errorInfo = {
							ok: false,
							type: 'CSP_VIOLATION',
							violatingUrl: nextUrl,
							status: res.status,
							statusText: `Blocked redirect to '${nextUrl}' by script-src`,
							url: currentUrl
						};
						fs.writeFileSync(tempOutPath, JSON.stringify(errorInfo), 'utf8');
						Atomics.store(status, 0, 2); // 2 = error
						Atomics.notify(status, 0, 1);
						return;
					}

					const hopCc = parseCacheControl(res.headers.get('cache-control'));
					hops.push({
						url: currentUrl,
						location: nextUrl,
						statusCode: res.status,
						isCacheable: hopCc.isCacheable,
						expiresAt: hopCc.expiresAt
					});

					currentUrl = nextUrl;
					continue;
				}

				if (!res.ok) {
					const errorInfo = {
						ok: false,
						status: res.status,
						statusText: res.statusText,
						url: currentUrl
					};
					fs.writeFileSync(tempOutPath, JSON.stringify(errorInfo), 'utf8');
					Atomics.store(status, 0, 2); // 2 = error
					Atomics.notify(status, 0, 1);
					return;
				}

				// Final successful response (2xx)
				const finalCc = parseCacheControl(res.headers.get('cache-control'));
				const arrayBuffer = await res.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);
				fs.writeFileSync(tempOutPath, buffer);

				const metaInfo = {
					ok: true,
					status: res.status,
					statusText: res.statusText,
					finalUrl: currentUrl,
					contentType: res.headers.get('content-type') || 'application/javascript',
					isCacheable: finalCc.isCacheable,
					expiresAt: finalCc.expiresAt,
					hops
				};
				fs.writeFileSync(`${tempOutPath}.meta`, JSON.stringify(metaInfo), 'utf8');

				Atomics.store(status, 0, 1); // 1 = success
				Atomics.notify(status, 0, 1);
				return;
			}
		} catch (err) {
			const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
			const errorInfo = {
				ok: false,
				type: isTimeout ? 'TIMEOUT' : 'ERROR',
				status: 0,
				statusText: err.message,
				url
			};
			try {
				fs.writeFileSync(tempOutPath, JSON.stringify(errorInfo), 'utf8');
			} catch {
				// ignore
			}
			Atomics.store(status, 0, 2); // 2 = error
			Atomics.notify(status, 0, 1);
		}
	});
}

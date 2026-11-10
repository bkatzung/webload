import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { fetchSync } from '../src/node/sync-fetch.js';
import { isCached, readFromCacheSync } from '../src/cache.js';

describe('Cache-Control Directives & Expiration', function () {
	let serverWorker;
	let serverPort;
	let testCacheDir;

	before(async function () {
		serverPort = await new Promise((resolve, reject) => {
			const workerCode = `
				import http from 'node:http';
				import { parentPort } from 'node:worker_threads';

				let port;
				const server = http.createServer((req, res) => {
					const reqUrl = new URL(req.url, 'http://127.0.0.1:' + port);

					if (reqUrl.pathname === '/no-store.js') {
						res.writeHead(200, {
							'Content-Type': 'application/javascript',
							'Cache-Control': 'no-store'
						});
						res.end('export const time = Date.now();');
						return;
					}

					if (reqUrl.pathname === '/no-cache.js') {
						res.writeHead(200, {
							'Content-Type': 'application/javascript',
							'Cache-Control': 'no-cache, private'
						});
						res.end('export const dynamic = true;');
						return;
					}

					if (reqUrl.pathname === '/must-revalidate.js') {
						res.writeHead(200, {
							'Content-Type': 'application/javascript',
							'Cache-Control': 'must-revalidate'
						});
						res.end('export const reval = 1;');
						return;
					}

					if (reqUrl.pathname === '/short-lived.js') {
						res.writeHead(200, {
							'Content-Type': 'application/javascript',
							'Cache-Control': 'public, max-age=1'
						});
						res.end('export const short = "1 second";');
						return;
					}

					res.writeHead(404);
					res.end('Not Found');
				});

				server.listen(0, '127.0.0.1', () => {
					port = server.address().port;
					parentPort.postMessage({ port });
				});
			`;

			serverWorker = new Worker(workerCode, { eval: true });
			serverWorker.on('message', (msg) => {
				if (msg.port) resolve(msg.port);
			});
			serverWorker.on('error', reject);
		});
	});

	after(async function () {
		if (serverWorker) {
			await serverWorker.terminate();
		}
	});

	beforeEach(function () {
		testCacheDir = path.join(os.tmpdir(), `webload-cc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(testCacheDir, { recursive: true });
	});

	afterEach(function () {
		if (fs.existsSync(testCacheDir)) {
			fs.rmSync(testCacheDir, { recursive: true, force: true });
		}
	});

	it('should not persist modules with Cache-Control: no-store to disk cache', function () {
		const url = `http://127.0.0.1:${serverPort}/no-store.js`;
		const result = fetchSync(url, {
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});

		assert.ok(result.content.includes('export const time'));
		assert.equal(result.filePath, null);
		assert.equal(isCached(url, testCacheDir), false);
		assert.equal(readFromCacheSync(url, testCacheDir), null);
	});

	it('should not persist modules with Cache-Control: no-cache, private, or must-revalidate', function () {
		const url1 = `http://127.0.0.1:${serverPort}/no-cache.js`;
		const result1 = fetchSync(url1, {
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});
		assert.equal(result1.filePath, null);
		assert.equal(isCached(url1, testCacheDir), false);

		const url2 = `http://127.0.0.1:${serverPort}/must-revalidate.js`;
		const result2 = fetchSync(url2, {
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});
		assert.equal(result2.filePath, null);
		assert.equal(isCached(url2, testCacheDir), false);
	});

	it('should cache with expiresAt timestamp for max-age and treat as miss after expiration', async function () {
		const url = `http://127.0.0.1:${serverPort}/short-lived.js`;
		const result = fetchSync(url, {
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});

		assert.ok(result.filePath);
		assert.equal(isCached(url, testCacheDir), true);

		const cachedImmediately = readFromCacheSync(url, testCacheDir);
		assert.ok(cachedImmediately);
		assert.ok(cachedImmediately.meta.expiresAt);

		// Wait 1.2s for max-age=1 to expire
		await new Promise(function (resolve) { setTimeout(resolve, 1200); });

		assert.equal(isCached(url, testCacheDir), false);
		assert.equal(readFromCacheSync(url, testCacheDir), null);
	});
});

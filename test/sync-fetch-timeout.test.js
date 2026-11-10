import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { fetchSync } from '../src/node/sync-fetch.js';

describe('Worker Timeout & Abort Handling', function () {
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

					if (reqUrl.pathname === '/slow') {
						// Hang request indefinitely without responding
						return;
					}

					if (reqUrl.pathname === '/fast') {
						res.writeHead(200, { 'Content-Type': 'application/javascript' });
						res.end('export const fast = true;');
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
		testCacheDir = path.join(os.tmpdir(), `webload-timeout-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(testCacheDir, { recursive: true });
	});

	afterEach(function () {
		if (fs.existsSync(testCacheDir)) {
			fs.rmSync(testCacheDir, { recursive: true, force: true });
		}
	});

	it('should abort and throw error when network fetch exceeds timeout', function () {
		const slowUrl = `http://127.0.0.1:${serverPort}/slow`;

		assert.throws(function () {
			fetchSync(slowUrl, {
				timeout: 100,
				cacheDir: testCacheDir,
				scriptSrc: [`http://127.0.0.1:${serverPort}`]
			});
		}, /timed out after 100ms/);
	});

	it('should successfully recover and process subsequent fetches after a timeout event', function () {
		const fastUrl = `http://127.0.0.1:${serverPort}/fast`;

		const result = fetchSync(fastUrl, {
			timeout: 5000,
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});

		assert.equal(result.content, 'export const fast = true;');
	});
});

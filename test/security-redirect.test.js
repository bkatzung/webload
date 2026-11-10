import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { fetchSync } from '../src/node/sync-fetch.js';
import { WebloadSecurityError } from '../src/security.js';

describe('Redirection Security & CSP Enforcement', function () {
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

					if (reqUrl.pathname === '/redirect-allowed') {
						res.writeHead(302, {
							Location: 'http://127.0.0.1:' + port + '/target.js'
						});
						res.end();
						return;
					}

					if (reqUrl.pathname === '/target.js') {
						res.writeHead(200, { 'Content-Type': 'application/javascript' });
						res.end('export const msg = "allowed target";');
						return;
					}

					if (reqUrl.pathname === '/redirect-to-disallowed') {
						res.writeHead(302, {
							Location: 'http://127.0.0.1:9999/malicious.js'
						});
						res.end();
						return;
					}

					if (reqUrl.pathname === '/multihop-1') {
						res.writeHead(301, {
							Location: 'http://127.0.0.1:' + port + '/multihop-2'
						});
						res.end();
						return;
					}

					if (reqUrl.pathname === '/multihop-2') {
						res.writeHead(301, {
							Location: 'http://127.0.0.1:' + port + '/multihop-3'
						});
						res.end();
						return;
					}

					if (reqUrl.pathname === '/multihop-3') {
						res.writeHead(301, {
							Location: 'http://evil.attacker.com/payload.js'
						});
						res.end();
						return;
					}

					if (reqUrl.pathname === '/circular-a') {
						res.writeHead(302, {
							Location: 'http://127.0.0.1:' + port + '/circular-b'
						});
						res.end();
						return;
					}

					if (reqUrl.pathname === '/circular-b') {
						res.writeHead(302, {
							Location: 'http://127.0.0.1:' + port + '/circular-a'
						});
						res.end();
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
		testCacheDir = path.join(os.tmpdir(), `webload-sec-redirect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(testCacheDir, { recursive: true });
	});

	afterEach(function () {
		if (fs.existsSync(testCacheDir)) {
			fs.rmSync(testCacheDir, { recursive: true, force: true });
		}
	});

	it('should allow direct redirect when initial and target URLs match script-src', function () {
		const initialUrl = `http://127.0.0.1:${serverPort}/redirect-allowed`;
		const targetUrl = `http://127.0.0.1:${serverPort}/target.js`;
		const scriptSrc = [`http://127.0.0.1:${serverPort}`];

		const result = fetchSync(initialUrl, {
			cacheDir: testCacheDir,
			scriptSrc
		});

		assert.equal(result.finalUrl, targetUrl);
		assert.match(result.content, /allowed target/);
	});

	it('should throw WebloadSecurityError when redirect location violates script-src', function () {
		const initialUrl = `http://127.0.0.1:${serverPort}/redirect-to-disallowed`;
		const scriptSrc = [`http://127.0.0.1:${serverPort}`];

		assert.throws(function () {
			fetchSync(initialUrl, {
				cacheDir: testCacheDir,
				scriptSrc
			});
		}, function (err) {
			return err instanceof WebloadSecurityError && err instanceof TypeError;
		});
	});

	it('should abort multi-hop redirect at intermediate disallowed hop', function () {
		const initialUrl = `http://127.0.0.1:${serverPort}/multihop-1`;
		// Only 127.0.0.1 is allowed; evil.attacker.com is blocked
		const scriptSrc = [`http://127.0.0.1:${serverPort}`];

		assert.throws(function () {
			fetchSync(initialUrl, {
				cacheDir: testCacheDir,
				scriptSrc
			});
		}, function (err) {
			return err instanceof WebloadSecurityError && err.targetUrl === 'http://evil.attacker.com/payload.js';
		});
	});

	it('should detect and abort circular redirect loops after 20 hops', function () {
		const initialUrl = `http://127.0.0.1:${serverPort}/circular-a`;
		const scriptSrc = [`http://127.0.0.1:${serverPort}`];

		assert.throws(function () {
			fetchSync(initialUrl, {
				cacheDir: testCacheDir,
				scriptSrc
			});
		}, /Too many redirects/);
	});
});

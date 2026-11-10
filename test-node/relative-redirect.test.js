import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { resolve, load, setConfig, canonicalUrlMap } from '../src/node/hook.js';

describe('Node Hook: Relative Path Resolution Against Canonical Response URL', function () {
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

					if (reqUrl.pathname === '/pkg') {
						res.writeHead(301, {
							Location: 'http://127.0.0.1:' + port + '/pkg/v2/index.js'
						});
						res.end();
						return;
					}

					if (reqUrl.pathname === '/pkg/v2/index.js') {
						res.writeHead(200, { 'Content-Type': 'application/javascript' });
						res.end('import "./helper.js"; export const v = 2;');
						return;
					}

					if (reqUrl.pathname === '/pkg/v2/helper.js') {
						res.writeHead(200, { 'Content-Type': 'application/javascript' });
						res.end('export const helper = true;');
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
		testCacheDir = path.join(os.tmpdir(), `webload-rel-redirect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(testCacheDir, { recursive: true });
		canonicalUrlMap.clear();
	});

	afterEach(function () {
		if (fs.existsSync(testCacheDir)) {
			fs.rmSync(testCacheDir, { recursive: true, force: true });
		}
	});

	it('should resolve sub-module relative import against final redirected response URL', async function () {
		const initialUrl = `http://127.0.0.1:${serverPort}/pkg`;
		const canonicalUrl = `http://127.0.0.1:${serverPort}/pkg/v2/index.js`;

		setConfig({
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});

		// 1. Load the initial redirecting module
		const loadResult = await load(initialUrl, {}, function () {});
		assert.ok(loadResult.source.includes('export const v = 2'));
		assert.equal(loadResult.responseURL, canonicalUrl);

		// 2. Resolve relative sub-import with parentURL = initialUrl
		const resolveResult = await resolve('./helper.js', { parentURL: initialUrl }, function (spec) {
			return { url: spec };
		});

		assert.equal(resolveResult.url, `http://127.0.0.1:${serverPort}/pkg/v2/helper.js`);
	});
});

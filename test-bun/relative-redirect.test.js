import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveModuleSource, setConfig, canonicalUrlMap } from '../src/bun/plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const wicbunBin = path.join(rootDir, 'bin', 'wicbun');

describe('Bun Plugin: Relative Path Resolution Against Canonical Response URL', function () {
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
						res.end('export const helper = true; console.log("HELPER_LOADED");');
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
		testCacheDir = path.join(os.tmpdir(), `webload-bun-rel-redirect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(testCacheDir, { recursive: true });
		canonicalUrlMap.clear();
	});

	afterEach(function () {
		if (fs.existsSync(testCacheDir)) {
			fs.rmSync(testCacheDir, { recursive: true, force: true });
		}
	});

	it('should record canonical URL and map redirected sub-module imports in Bun plugin', async function () {
		const initialUrl = `http://127.0.0.1:${serverPort}/pkg`;
		const canonicalUrl = `http://127.0.0.1:${serverPort}/pkg/v2/index.js`;

		setConfig({
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});

		// 1. Resolve source for initial URL
		const res = resolveModuleSource(initialUrl, {
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		});

		assert.ok(res.content.includes('export const v = 2'));
		assert.equal(res.finalUrl, canonicalUrl);
		assert.equal(canonicalUrlMap.get(initialUrl), canonicalUrl);

		// 2. Relative resolution using canonicalUrlMap
		const importer = canonicalUrlMap.get(initialUrl) || initialUrl;
		const resolvedSubUrl = new URL('./helper.js', importer).href;
		assert.equal(resolvedSubUrl, `http://127.0.0.1:${serverPort}/pkg/v2/helper.js`);
	});

	it('should end-to-end execute redirected remote entry point with relative imports using wicbun', function () {
		const configFile = path.join(testCacheDir, 'webload.json');
		const configData = {
			cacheDir: testCacheDir,
			scriptSrc: [`http://127.0.0.1:${serverPort}`]
		};
		fs.writeFileSync(configFile, JSON.stringify(configData));

		const redirectEntryUrl = `http://127.0.0.1:${serverPort}/pkg`;
		const res = spawnSync(wicbunBin, ['--config', configFile, redirectEntryUrl], {
			encoding: 'utf-8',
			timeout: 5000
		});

		assert.equal(res.status, 0, `wicbun failed: ${res.stderr}`);
		assert.ok(res.stdout.includes('HELPER_LOADED'), `Output should include HELPER_LOADED, got: ${res.stdout}`);
	});
});

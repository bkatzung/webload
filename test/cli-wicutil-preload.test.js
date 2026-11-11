import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { isCached, readFromCacheSync } from '../src/cache.js';
import { computeIntegrityHash } from '../src/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wicutilBin = path.resolve(__dirname, '../bin/wicutil');

describe('CLI: wicutil --preload & --integrity', function () {
	let testTmpDir;
	let testCacheDir;
	let testConfigFile;
	let serverWorker;
	let serverPort;

	before(async function () {
		serverPort = await new Promise((resolve, reject) => {
			const workerCode = `
				import http from 'node:http';
				import { parentPort } from 'node:worker_threads';

				let port;
				const contentStore = {
					'/lodash-es@4.17.21/lodash.js': 'export const chunk = "4.17.21";',
					'/canvas-confetti@1.9.4/index.js': 'export const confetti = "1.9.4";',
					'/app.js': 'console.log("non-semver app");'
				};

				const server = http.createServer((req, res) => {
					const reqUrl = new URL(req.url, 'http://127.0.0.1:' + port);
					const content = contentStore[reqUrl.pathname];

					if (content !== undefined) {
						res.writeHead(200, {
							'Content-Type': 'application/javascript',
							'Cache-Control': 'public, max-age=3600'
						});
						res.end(content);
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
		testTmpDir = path.join(os.tmpdir(), `webload-preload-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		testCacheDir = path.join(testTmpDir, 'cache');
		fs.mkdirSync(testCacheDir, { recursive: true });

		testConfigFile = path.join(testTmpDir, 'webload.json');
		fs.writeFileSync(
			testConfigFile,
			JSON.stringify(
				{
					cacheDir: testCacheDir,
					'script-src': [`http://127.0.0.1:${serverPort}`]
				},
				null,
				2
			),
			'utf8'
		);
	});

	afterEach(function () {
		if (fs.existsSync(testTmpDir)) {
			fs.rmSync(testTmpDir, { recursive: true, force: true });
		}
	});

	it('should preload a single URL under TOFU rules', function () {
		const url = `http://127.0.0.1:${serverPort}/lodash-es@4.17.21/lodash.js`;

		const result = spawnSync(
			wicutilBin,
			['--config', testConfigFile, '--preload', url],
			{ encoding: 'utf8' }
		);

		assert.equal(result.status, 0);
		assert.match(result.stdout, /Preloaded/);
		assert.equal(isCached(url, testCacheDir), true);

		const cached = readFromCacheSync(url, testCacheDir);
		assert.ok(cached);
		assert.equal(cached.code, 'export const chunk = "4.17.21";');
		assert.equal(cached.meta.integrity, computeIntegrityHash('export const chunk = "4.17.21";', 'sha256'));
	});

	it('should preload a single URL with matching --integrity', function () {
		const url = `http://127.0.0.1:${serverPort}/lodash-es@4.17.21/lodash.js`;
		const expectedHash = computeIntegrityHash('export const chunk = "4.17.21";', 'sha256');

		const result = spawnSync(
			wicutilBin,
			['--config', testConfigFile, '--preload', url, '--integrity', expectedHash],
			{ encoding: 'utf8' }
		);

		assert.equal(result.status, 0);
		assert.match(result.stdout, /Preloaded/);
		assert.equal(isCached(url, testCacheDir), true);

		const cached = readFromCacheSync(url, testCacheDir);
		assert.equal(cached.meta.integrity, expectedHash);
	});

	it('should fail and not commit cache when single URL preload has mismatching --integrity', function () {
		const url = `http://127.0.0.1:${serverPort}/lodash-es@4.17.21/lodash.js`;
		const wrongHash = 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';

		const result = spawnSync(
			wicutilBin,
			['--config', testConfigFile, '--preload', url, '--integrity', wrongHash],
			{ encoding: 'utf8' }
		);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Integrity check failed/);
		assert.equal(isCached(url, testCacheDir), false);
	});

	it('should store integrity when preloading non-semver URL with --integrity', function () {
		const url = `http://127.0.0.1:${serverPort}/app.js`;
		const expectedHash = computeIntegrityHash('console.log("non-semver app");', 'sha256');

		const result = spawnSync(
			wicutilBin,
			['--config', testConfigFile, '--preload', url, '--integrity', expectedHash],
			{ encoding: 'utf8' }
		);

		assert.equal(result.status, 0);
		assert.match(result.stdout, /Preloaded/);

		const cached = readFromCacheSync(url, testCacheDir);
		assert.ok(cached);
		assert.equal(cached.meta.integrity, expectedHash);
	});

	it('should preload multiple URLs in sequence', function () {
		const url1 = `http://127.0.0.1:${serverPort}/lodash-es@4.17.21/lodash.js`;
		const url2 = `http://127.0.0.1:${serverPort}/canvas-confetti@1.9.4/index.js`;

		const result = spawnSync(
			wicutilBin,
			['--config', testConfigFile, '--preload', url1, url2],
			{ encoding: 'utf8' }
		);

		assert.equal(result.status, 0);
		assert.equal(isCached(url1, testCacheDir), true);
		assert.equal(isCached(url2, testCacheDir), true);
	});

	it('should reject --integrity when multiple URLs are passed to --preload', function () {
		const url1 = `http://127.0.0.1:${serverPort}/lodash-es@4.17.21/lodash.js`;
		const url2 = `http://127.0.0.1:${serverPort}/canvas-confetti@1.9.4/index.js`;

		const result = spawnSync(
			wicutilBin,
			['--config', testConfigFile, '--preload', url1, url2, '--integrity', 'sha256-xxx'],
			{ encoding: 'utf8' }
		);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /--integrity option can only be specified when preloading a single URL/);
		assert.equal(isCached(url1, testCacheDir), false);
		assert.equal(isCached(url2, testCacheDir), false);
	});

	it('should display SRI hash in wicutil --list output when present', function () {
		const url = `http://127.0.0.1:${serverPort}/lodash-es@4.17.21/lodash.js`;

		spawnSync(wicutilBin, ['--config', testConfigFile, '--preload', url]);

		const listResult = spawnSync(
			wicutilBin,
			['--config', testConfigFile, '--list'],
			{ encoding: 'utf8' }
		);

		assert.equal(listResult.status, 0);
		assert.match(listResult.stdout, /SRI:\s+sha256-/);
	});
});

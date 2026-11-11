import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import {
	isSemverPath,
	computeIntegrityHash,
	verifyIntegrity,
	WebloadIntegrityError
} from '../src/security.js';
import {
	writeToCacheSync,
	readFromCacheSync,
	isCached,
	removeCache
} from '../src/cache.js';
import { fetchSync } from '../src/node/sync-fetch.js';

describe('WebLoad Security: Trust-On-First-Use (TOFU) Subresource Integrity', function () {
	let testTmpDir;
	let testCacheDir;
	let serverWorker;
	let serverPort;
	let serverState = {};

	before(async function () {
		serverPort = await new Promise((resolve, reject) => {
			const workerCode = `
				import http from 'node:http';
				import { parentPort } from 'node:worker_threads';

				let port;
				let pkgHits = 0;

				const server = http.createServer((req, res) => {
					const reqUrl = new URL(req.url, 'http://127.0.0.1:' + port);

					if (reqUrl.pathname === '/pkg@1.2.3/index.js') {
						pkgHits++;
						res.writeHead(200, {
							'Content-Type': 'application/javascript',
							'Cache-Control': 'public, max-age=3600'
						});
						res.end(pkgHits === 1 ? 'export const v = "1.2.3";' : 'export const v = "compromised";');
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
		testTmpDir = path.join(os.tmpdir(), `webload-tofu-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		testCacheDir = path.join(testTmpDir, 'cache');
		fs.mkdirSync(testCacheDir, { recursive: true });
	});

	afterEach(function () {
		if (fs.existsSync(testTmpDir)) {
			fs.rmSync(testTmpDir, { recursive: true, force: true });
		}
	});

	describe('Semver Path Detection & SRI Utilities', function () {
		it('should identify semver-like paths accurately', function () {
			assert.equal(isSemverPath('https://esm.sh/lodash-es@4.17.21/lodash.js'), true);
			assert.equal(isSemverPath('https://cdn.jsdelivr.net/npm/@scope/pkg@1.0.0/dist/index.mjs'), true);
			assert.equal(isSemverPath('https://deno.land/std@0.224.0/http/server.ts'), true);
			assert.equal(isSemverPath('https://unpkg.com/react/18.2.0/index.js'), true);
			assert.equal(isSemverPath('/v1.2.3/bundle.js'), true);
			assert.equal(isSemverPath('package-2.0.1.mjs'), true);

			assert.equal(isSemverPath('https://esm.sh/lodash'), false);
			assert.equal(isSemverPath('https://example.com/app.js'), false);
			assert.equal(isSemverPath('https://esm.sh/v135/main.js'), false);
			assert.equal(isSemverPath(null), false);
		});

		it('should compute and verify SRI hashes across algorithms', function () {
			const content = 'export const test = "hello integrity";';
			const sha256 = computeIntegrityHash(content, 'sha256');
			const sha384 = computeIntegrityHash(content, 'sha384');
			const sha512 = computeIntegrityHash(content, 'sha512');

			assert.ok(sha256.startsWith('sha256-'));
			assert.ok(sha384.startsWith('sha384-'));
			assert.ok(sha512.startsWith('sha512-'));

			assert.equal(verifyIntegrity(content, sha256), true);
			assert.equal(verifyIntegrity(content, sha384), true);
			assert.equal(verifyIntegrity(content, sha512), true);
			assert.equal(verifyIntegrity(content, 'sha256-invalidhash'), false);
			assert.equal(verifyIntegrity(content, 'invalid'), false);
			assert.equal(verifyIntegrity(content, null), false);
		});
	});

	describe('TOFU Lifecycle & Cache Verification', function () {
		it('should compute and store TOFU integrity hash on initial write of semver URL', function () {
			const semverUrl = 'https://esm.sh/lodash-es@4.17.21/lodash.js';
			const content = 'export const chunk = function () {};';
			const expectedHash = computeIntegrityHash(content, 'sha256');

			writeToCacheSync(semverUrl, content, {}, testCacheDir);

			const cached = readFromCacheSync(semverUrl, testCacheDir);
			assert.ok(cached);
			assert.equal(cached.code, content);
			assert.equal(cached.meta.integrity, expectedHash);
		});

		it('should not compute TOFU integrity on initial write of non-semver URL unless forced or specified', function () {
			const nonSemverUrl = 'https://esm.sh/lodash/main.js';
			const content = 'export const main = 1;';

			writeToCacheSync(nonSemverUrl, content, {}, testCacheDir);

			const cached = readFromCacheSync(nonSemverUrl, testCacheDir);
			assert.ok(cached);
			assert.equal(cached.code, content);
			assert.equal(cached.meta.integrity, undefined);
		});

		it('should succeed on cache refresh when content matches stored integrity', function () {
			const semverUrl = 'https://esm.sh/lodash-es@4.17.21/lodash.js';
			const content = 'export const chunk = function () {};';

			writeToCacheSync(semverUrl, content, {}, testCacheDir);
			const firstCached = readFromCacheSync(semverUrl, testCacheDir);
			const storedHash = firstCached.meta.integrity;

			// Refresh with identical content
			writeToCacheSync(semverUrl, content, {}, testCacheDir);

			const refreshed = readFromCacheSync(semverUrl, testCacheDir);
			assert.ok(refreshed);
			assert.equal(refreshed.code, content);
			assert.equal(refreshed.meta.integrity, storedHash);
		});

		it('should reject cache refresh and throw WebloadIntegrityError when content is tampered', function () {
			const semverUrl = 'https://esm.sh/lodash-es@4.17.21/lodash.js';
			const originalContent = 'export const chunk = function () { return "clean"; };';
			const tamperedContent = 'export const chunk = function () { return "malicious"; };';

			writeToCacheSync(semverUrl, originalContent, {}, testCacheDir);
			const originalCached = readFromCacheSync(semverUrl, testCacheDir);
			const originalHash = originalCached.meta.integrity;

			assert.throws(
				() => {
					writeToCacheSync(semverUrl, tamperedContent, {}, testCacheDir);
				},
				(err) => {
					assert.ok(err instanceof WebloadIntegrityError);
					assert.equal(err.name, 'WebloadIntegrityError');
					assert.equal(err.targetUrl, semverUrl);
					assert.equal(err.expectedIntegrity, originalHash);
					assert.notEqual(err.actualIntegrity, originalHash);
					return true;
				}
			);

			// Verify original cache is still intact and uncorrupted
			const afterAttempt = readFromCacheSync(semverUrl, testCacheDir);
			assert.equal(afterAttempt.code, originalContent);
			assert.equal(afterAttempt.meta.integrity, originalHash);
		});

		it('should enforce explicit integrity on non-semver URL and persist integrity', function () {
			const nonSemverUrl = 'https://example.com/app.js';
			const content = 'console.log("secure app");';
			const validHash = computeIntegrityHash(content, 'sha256');

			writeToCacheSync(nonSemverUrl, content, { integrity: validHash }, testCacheDir);

			const cached = readFromCacheSync(nonSemverUrl, testCacheDir);
			assert.ok(cached);
			assert.equal(cached.code, content);
			assert.equal(cached.meta.integrity, validHash);

			// Attempt refresh with modified content
			assert.throws(
				() => {
					writeToCacheSync(nonSemverUrl, 'console.log("tampered");', {}, testCacheDir);
				},
				WebloadIntegrityError
			);
		});

		it('should reject initial write if explicit integrity does not match provided content', function () {
			const url = 'https://example.com/pkg@1.0.0/index.js';
			const content = 'export const clean = true;';
			const wrongHash = 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';

			assert.throws(
				() => {
					writeToCacheSync(url, content, { integrity: wrongHash }, testCacheDir);
				},
				WebloadIntegrityError
			);

			assert.equal(isCached(url, testCacheDir), false);
		});

		it('should reset TOFU lock when URL is evicted via removeCache', function () {
			const semverUrl = 'https://esm.sh/lodash-es@4.17.21/lodash.js';
			const version1 = 'export const version = 1;';
			const version2 = 'export const version = 2;';

			writeToCacheSync(semverUrl, version1, {}, testCacheDir);
			const hash1 = readFromCacheSync(semverUrl, testCacheDir).meta.integrity;

			// Evict URL
			const removed = removeCache([semverUrl], testCacheDir);
			assert.equal(removed, 1);
			assert.equal(isCached(semverUrl, testCacheDir), false);

			// Re-download altered version -> new TOFU hash established
			writeToCacheSync(semverUrl, version2, {}, testCacheDir);
			const cached2 = readFromCacheSync(semverUrl, testCacheDir);
			assert.equal(cached2.code, version2);
			assert.notEqual(cached2.meta.integrity, hash1);
			assert.equal(cached2.meta.integrity, computeIntegrityHash(version2, 'sha256'));
		});

		it('should allow force overwrite with force option', function () {
			const semverUrl = 'https://esm.sh/lodash-es@4.17.21/lodash.js';
			const version1 = 'export const version = 1;';
			const version2 = 'export const version = 2;';

			writeToCacheSync(semverUrl, version1, {}, testCacheDir);

			// Overwrite with force: true
			writeToCacheSync(semverUrl, version2, { force: true }, testCacheDir);

			const cached = readFromCacheSync(semverUrl, testCacheDir);
			assert.equal(cached.code, version2);
			assert.equal(cached.meta.integrity, computeIntegrityHash(version2, 'sha256'));
		});
	});

	describe('Network Fetch Integration with TOFU', function () {
		it('should record TOFU integrity on remote fetch of semver URL and reject tampered re-fetch', function () {
			const path = '/pkg@1.2.3/index.js';
			const url = `http://127.0.0.1:${serverPort}${path}`;
			const originalContent = 'export const v = "1.2.3";';

			// Initial fetch (server serves original content on first hit)
			const res1 = fetchSync(url, {
				cacheDir: testCacheDir,
				scriptSrc: [`http://127.0.0.1:${serverPort}`]
			});

			assert.equal(res1.content, originalContent);
			const cached1 = readFromCacheSync(url, testCacheDir);
			assert.ok(cached1.meta.integrity);
			const expectedHash = cached1.meta.integrity;

			// Re-fetch triggers server hit 2 (tampered content) -> rejected by integrity check
			assert.throws(
				() => {
					fetchSync(url, {
						cacheDir: testCacheDir,
						scriptSrc: [`http://127.0.0.1:${serverPort}`]
					});
				},
				WebloadIntegrityError
			);

			// Cached file remains original uncorrupted payload
			const cachedAfter = readFromCacheSync(url, testCacheDir);
			assert.equal(cachedAfter.code, originalContent);
			assert.equal(cachedAfter.meta.integrity, expectedHash);
		});
	});
});

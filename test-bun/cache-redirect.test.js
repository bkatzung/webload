import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
	isCached,
	readFromCacheSync,
	writeToCacheSync
} from '../src/cache.js';
import { resolveModuleSource } from '../src/bun/plugin.js';
import { WebloadSecurityError } from '../src/security.js';

describe('Bun Plugin: Metadata-First Cache & Offline Redirect Traversal', function () {
	let testCacheDir;

	beforeEach(function () {
		testCacheDir = path.join(os.tmpdir(), `webload-bun-cache-redirect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(testCacheDir, { recursive: true });
	});

	afterEach(function () {
		if (fs.existsSync(testCacheDir)) {
			fs.rmSync(testCacheDir, { recursive: true, force: true });
		}
	});

	it('should identify redirect-only entries as cached and return redirect descriptor without primary content file', function () {
		const redirectUrl = 'https://esm.sh/lodash';
		const targetLocation = 'https://esm.sh/lodash@4.17.21/lodash.bundle.mjs';

		writeToCacheSync(
			redirectUrl,
			null,
			{ isRedirect: true, location: targetLocation, statusCode: 301 },
			testCacheDir
		);

		assert.equal(isCached(redirectUrl, testCacheDir), true);

		const cached = readFromCacheSync(redirectUrl, testCacheDir);
		assert.ok(cached);
		assert.equal(cached.isRedirect, true);
		assert.equal(cached.location, targetLocation);
		assert.equal(cached.code, null);
	});

	it('should resolve multi-hop redirects offline from cache with zero network calls', function () {
		const origUrl = 'https://esm.sh/pkg';
		const hopA = 'https://esm.sh/pkg@1.0.0';
		const finalUrl = 'https://esm.sh/pkg@1.0.0/dist/index.mjs';
		const finalCode = 'export const version = "1.0.0";';

		// Store hop 1
		writeToCacheSync(origUrl, null, { isRedirect: true, location: hopA, statusCode: 301 }, testCacheDir);
		// Store hop 2
		writeToCacheSync(hopA, null, { isRedirect: true, location: finalUrl, statusCode: 301 }, testCacheDir);
		// Store final content
		writeToCacheSync(finalUrl, finalCode, { isRedirect: false, statusCode: 200 }, testCacheDir);

		const config = {
			cacheDir: testCacheDir,
			scriptSrc: ['https://esm.sh']
		};

		const result = resolveModuleSource(origUrl, config);
		assert.equal(result.finalUrl, finalUrl);
		assert.equal(result.content, finalCode);
	});

	it('should enforce stepwise per-configuration CSP during cache traversal without network access', function () {
		const origUrl = 'https://allowed.com/original';
		const hopA = 'https://allowed.com/A';
		const hopB = 'https://disallowed.com/B';
		const hopC = 'https://allowed.com/C';
		const finalUrl = 'https://allowed.com/final.js';
		const finalCode = 'export const ready = true;';

		writeToCacheSync(origUrl, null, { isRedirect: true, location: hopA }, testCacheDir);
		writeToCacheSync(hopA, null, { isRedirect: true, location: hopB }, testCacheDir);
		writeToCacheSync(hopB, null, { isRedirect: true, location: hopC }, testCacheDir);
		writeToCacheSync(hopC, null, { isRedirect: true, location: finalUrl }, testCacheDir);
		writeToCacheSync(finalUrl, finalCode, { isRedirect: false }, testCacheDir);

		const config = {
			cacheDir: testCacheDir,
			scriptSrc: ['https://allowed.com']
		};

		// 1. Importing original should fail when it encounters hop B (disallowed.com)
		assert.throws(function () {
			resolveModuleSource(origUrl, config);
		}, function (err) {
			return err instanceof WebloadSecurityError && err.targetUrl === hopB;
		});

		// 2. Importing hop C directly should succeed because C -> final.js are both on allowed.com
		const result = resolveModuleSource(hopC, config);
		assert.equal(result.finalUrl, finalUrl);
		assert.equal(result.content, finalCode);
	});
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
	urlToRelativeCachePath,
	getCachePath,
	isCached,
	writeToCacheSync,
	readFromCacheSync,
	listCache,
	removeCache,
	clearCache
} from '../src/cache.js';

describe('WebLoad Cache Subsystem: Atomic Local Filesystem Cache', function () {
	let testCacheDir;

	beforeEach(function () {
		testCacheDir = path.join(os.tmpdir(), `webload-test-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(testCacheDir, { recursive: true });
	});

	afterEach(function () {
		if (fs.existsSync(testCacheDir)) {
			fs.rmSync(testCacheDir, { recursive: true, force: true });
		}
	});

	describe('urlToRelativeCachePath', function () {
		it('should convert standard URLs to hierarchical relative paths', function () {
			const rel = urlToRelativeCachePath('https://esm.sh/lodash-es@4.17.21/lodash.js');
			assert.equal(rel, path.join('esm.sh', 'lodash-es@4.17.21', 'lodash.js'));
		});

		it('should handle ports and queries cleanly', function () {
			const rel = urlToRelativeCachePath('http://localhost:3000/app.js?dev=true');
			assert.match(rel, /localhost_3000/);
			assert.match(rel, /app_q_/);
		});

		it('should append .js for extensionless URLs', function () {
			const rel = urlToRelativeCachePath('https://esm.sh/lodash');
			assert.equal(rel, path.join('esm.sh', 'lodash.js'));
		});
	});

	describe('writeToCacheSync and atomic operations', function () {
		it('should write module content and generate per-module package.json', function () {
			const testUrl = 'https://esm.sh/test-pkg/mod.js';
			const testContent = 'export const message = "hello";';

			const cachedPath = writeToCacheSync(testUrl, testContent, {}, testCacheDir);
			assert.equal(fs.existsSync(cachedPath), true);
			assert.equal(fs.readFileSync(cachedPath, 'utf8'), testContent);

			// Check per-module package.json exists in module dir
			const moduleDir = path.dirname(cachedPath);
			const pkgJsonPath = path.join(moduleDir, 'package.json');
			assert.equal(fs.existsSync(pkgJsonPath), true);

			const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
			assert.equal(pkg.type, 'module');

			// Verify shared root cache directory does NOT have a package.json
			assert.equal(fs.existsSync(path.join(testCacheDir, 'package.json')), false);
		});

		it('should read cached content accurately', function () {
			const testUrl = 'https://esm.sh/math/add.js';
			const content = 'export function add (a, b) { return a + b; }';

			writeToCacheSync(testUrl, content, { contentType: 'application/javascript' }, testCacheDir);

			assert.equal(isCached(testUrl, testCacheDir), true);
			const data = readFromCacheSync(testUrl, testCacheDir);
			assert.ok(data);
			assert.equal(data.code, content);
			assert.equal(data.meta.url, testUrl);
		});
	});

	describe('Cache management: listCache, removeCache, clearCache', function () {
		it('should enumerate cached modules with listCache', function () {
			writeToCacheSync('https://esm.sh/a.js', 'export const a = 1;', {}, testCacheDir);
			writeToCacheSync('https://esm.sh/b.js', 'export const b = 2;', {}, testCacheDir);

			const list = listCache(testCacheDir);
			assert.equal(list.length, 2);
			const urls = list.map(function (item) { return item.url; });
			assert.ok(urls.includes('https://esm.sh/a.js'));
			assert.ok(urls.includes('https://esm.sh/b.js'));
		});

		it('should selectively remove modules with removeCache', function () {
			writeToCacheSync('https://esm.sh/a.js', 'export const a = 1;', {}, testCacheDir);
			writeToCacheSync('https://esm.sh/b.js', 'export const b = 2;', {}, testCacheDir);

			const removed = removeCache(['https://esm.sh/a.js'], testCacheDir);
			assert.equal(removed, 1);
			assert.equal(isCached('https://esm.sh/a.js', testCacheDir), false);
			assert.equal(isCached('https://esm.sh/b.js', testCacheDir), true);
		});

		it('should purge entire cache with clearCache', function () {
			writeToCacheSync('https://esm.sh/a.js', 'export const a = 1;', {}, testCacheDir);
			assert.equal(fs.existsSync(testCacheDir), true);

			clearCache(testCacheDir);
			assert.equal(fs.existsSync(testCacheDir), false);
		});
	});
});

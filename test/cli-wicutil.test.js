import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeToCacheSync } from '../src/cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wicutilBin = path.resolve(__dirname, '../bin/wicutil');

describe('CLI: wicutil (Cache Management Utility)', function () {
	let testTmpDir;
	let testCacheDir;

	beforeEach(function () {
		testTmpDir = path.join(os.tmpdir(), `webload-test-util-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		testCacheDir = path.join(testTmpDir, 'cache');
		fs.mkdirSync(testCacheDir, { recursive: true });
	});

	afterEach(function () {
		if (fs.existsSync(testTmpDir)) {
			fs.rmSync(testTmpDir, { recursive: true, force: true });
		}
	});

	it('should list cached modules with --list', function () {
		writeToCacheSync('https://esm.sh/lodash.js', 'export const chunk = 1;', {}, testCacheDir);

		const result = spawnSync(wicutilBin, ['--cache-dir', testCacheDir, '--list'], {
			encoding: 'utf8'
		});

		assert.equal(result.status, 0);
		assert.match(result.stdout, /https:\/\/esm.sh\/lodash.js/);
	});

	it('should remove specific modules with --remove', function () {
		writeToCacheSync('https://esm.sh/lodash.js', 'export const chunk = 1;', {}, testCacheDir);
		writeToCacheSync('https://esm.sh/ms.js', 'export const ms = 1;', {}, testCacheDir);

		const result = spawnSync(
			wicutilBin,
			['--cache-dir', testCacheDir, '--remove', 'https://esm.sh/lodash.js'],
			{ encoding: 'utf8' }
		);

		assert.equal(result.status, 0);
		assert.match(result.stdout, /Removed 1 cached module/);

		const listResult = spawnSync(wicutilBin, ['--cache-dir', testCacheDir, '--list'], {
			encoding: 'utf8'
		});
		assert.doesNotMatch(listResult.stdout, /lodash.js/);
		assert.match(listResult.stdout, /ms.js/);
	});

	it('should clear entire cache with --clear', function () {
		writeToCacheSync('https://esm.sh/lodash.js', 'export const chunk = 1;', {}, testCacheDir);

		const result = spawnSync(wicutilBin, ['--cache-dir', testCacheDir, '--clear'], {
			encoding: 'utf8'
		});

		assert.equal(result.status, 0);
		assert.match(result.stdout, /Cache cleared successfully/);
		assert.equal(fs.existsSync(testCacheDir), false);
	});
});

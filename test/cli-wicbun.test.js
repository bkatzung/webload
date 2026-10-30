import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wicbunBin = path.resolve(__dirname, '../bin/wicbun');

describe('CLI: wicbun (Bun URL Import Runner)', function () {
	let server;
	let serverPort;
	let testTmpDir;

	before(function (t, done) {
		testTmpDir = path.join(os.tmpdir(), `webload-test-bun-${Date.now()}`);
		fs.mkdirSync(testTmpDir, { recursive: true });

		server = http.createServer(function (req, res) {
			if (req.url === '/module.js') {
				res.writeHead(200, { 'Content-Type': 'application/javascript' });
				res.end(`
					export function compute (x) {
						return x * 42;
					}
				`);
			} else if (req.url === '/entrypoint.js') {
				res.writeHead(200, { 'Content-Type': 'application/javascript' });
				res.end(`
					console.log('BUN_ENTRYPOINT_SUCCESS');
				`);
			} else {
				res.writeHead(404);
				res.end('Not found');
			}
		});

		server.listen(0, '127.0.0.1', function () {
			serverPort = server.address().port;
			done();
		});
	});

	after(function (t, done) {
		if (fs.existsSync(testTmpDir)) {
			fs.rmSync(testTmpDir, { recursive: true, force: true });
		}
		server.close(done);
	});

	it('should execute a script importing remote URL module in Bun when script-src is allowed', function () {
		const testConfigPath = path.join(testTmpDir, 'webload.json');
		fs.writeFileSync(
			testConfigPath,
			JSON.stringify({
				'script-src': ['http://127.0.0.1:*', 'http://localhost:*']
			}, null, '\t')
		);

		const testScriptPath = path.join(testTmpDir, 'app.js');
		fs.writeFileSync(
			testScriptPath,
			`
				import { compute } from 'http://127.0.0.1:${serverPort}/module.js';
				console.log('RESULT=' + compute(2));
			`
		);

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache') }
		});

		assert.equal(result.status, 0, `Bun process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /RESULT=84/);
	});

	it('should enforce default deny in Bun when script-src is missing or empty', function () {
		const testConfigPath = path.join(testTmpDir, 'deny-webload.json');
		fs.writeFileSync(
			testConfigPath,
			JSON.stringify({
				'script-src': []
			}, null, '\t')
		);

		const testScriptPath = path.join(testTmpDir, 'denied-app.js');
		fs.writeFileSync(
			testScriptPath,
			`
				import { compute } from 'http://127.0.0.1:${serverPort}/module.js';
				console.log('RESULT=' + compute(2));
			`
		);

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache') }
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /violates the following script-src directive/);
	});

	it('should execute remote URL entrypoint directly in Bun', function () {
		const testConfigPath = path.join(testTmpDir, 'webload.json');
		const entryUrl = `http://127.0.0.1:${serverPort}/entrypoint.js`;

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, entryUrl], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache') }
		});

		assert.equal(result.status, 0, `Bun process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /BUN_ENTRYPOINT_SUCCESS/);
	});
});

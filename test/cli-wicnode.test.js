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
const wicnodeBin = path.resolve(__dirname, '../bin/wicnode');

describe('CLI: wicnode (Node.js URL Import Runner)', function () {
	let server;
	let serverPort;
	let testTmpDir;

	before(function (t, done) {
		testTmpDir = path.join(os.tmpdir(), `webload-test-node-${Date.now()}`);
		fs.mkdirSync(testTmpDir, { recursive: true });

		server = http.createServer(function (req, res) {
			if (req.url === '/module.js') {
				res.writeHead(200, { 'Content-Type': 'application/javascript' });
				res.end(`
					import { sub } from './sub.js';
					export function greet (name) {
						return 'Hello ' + name + ' from ' + sub();
					}
				`);
			} else if (req.url === '/sub.js') {
				res.writeHead(200, { 'Content-Type': 'application/javascript' });
				res.end(`
					export function sub () {
						return 'submodule';
					}
				`);
			} else if (req.url === '/entrypoint.js') {
				res.writeHead(200, { 'Content-Type': 'application/javascript' });
				res.end(`
					console.log('ENTRYPOINT_EXECUTED_SUCCESSFULLY');
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

	it('should execute a local script importing a remote URL module when script-src is allowed', function () {
		const testConfigPath = path.join(testTmpDir, 'webload.json');
		fs.writeFileSync(
			testConfigPath,
			JSON.stringify({
				'script-src': ['http://127.0.0.1:*', 'http://localhost:*']
			}, null, '\t')
		);

		const testScriptPath = path.join(testTmpDir, 'test-app.js');
		fs.writeFileSync(
			testScriptPath,
			`
				import { greet } from 'http://127.0.0.1:${serverPort}/module.js';
				console.log(greet('NodeTest'));
			`
		);

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache') }
		});

		assert.equal(result.status, 0, `Process failed with output:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /Hello NodeTest from submodule/);
	});

	it('should block remote URL module execution when script-src is not configured (default deny)', function () {
		const testConfigPath = path.join(testTmpDir, 'empty-webload.json');
		fs.writeFileSync(
			testConfigPath,
			JSON.stringify({
				'script-src': []
			}, null, '\t')
		);

		const testScriptPath = path.join(testTmpDir, 'test-denied.js');
		fs.writeFileSync(
			testScriptPath,
			`
				import { greet } from 'http://127.0.0.1:${serverPort}/module.js';
				console.log(greet('Denied'));
			`
		);

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache') }
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /violates the following script-src directive/);
	});

	it('should execute remote URL entrypoint directly', function () {
		const testConfigPath = path.join(testTmpDir, 'webload.json');
		const entryUrl = `http://127.0.0.1:${serverPort}/entrypoint.js`;

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, entryUrl], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache') }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /ENTRYPOINT_EXECUTED_SUCCESSFULLY/);
	});
});

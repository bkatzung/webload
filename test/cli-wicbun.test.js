import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wicbunBin = path.resolve(__dirname, '../bin/wicbun');

function getBunRevision () {
	try {
		const result = spawnSync('bun', ['--revision'], { encoding: 'utf8' });
		if (result.error || result.status !== 0) {
			return null;
		}
		return (result.stdout || '').trim();
	} catch {
		return null;
	}
}

function isBunVersionSupported (rev) {
	if (!rev) return false;
	const cleanRev = rev.split('+')[0].trim();
	const match = cleanRev.match(/^(\d+)\.(\d+)\.(\d+)(?:-canary\.(\d+))?$/);
	if (!match) return false;
	const [, maj, min, pat, can] = match.map((x) => (x !== undefined ? Number(x) : undefined));

	if (maj > 1) return true;
	if (maj < 1) return false;
	if (min > 4) return true;
	if (min < 4) return false;
	if (pat > 4) return true;
	if (pat < 4) return false;
	// 1.4.4 further requires canary >= 1
	if (can === undefined) return false;
	return can >= 1;
}

const bunRevision = getBunRevision();
const isSupported = isBunVersionSupported(bunRevision);
const skipReason = isSupported
	? false
	: `Bun version >= 1.4.4-canary.1 required (found: ${bunRevision || 'none'}). Plugin onResolve will not activate on older versions.`;

describe('CLI: wicbun (Bun URL Import Runner)', function () {
	let serverWorker;
	let serverPort;
	let testTmpDir;
	let testConfigPath;
	let cacheCount = 0;

	before(async function () {
		if (!isSupported) {
			return;
		}

		testTmpDir = path.join(os.tmpdir(), `webload-test-bun-${Date.now()}`);
		fs.mkdirSync(testTmpDir, { recursive: true });

		serverPort = await new Promise((resolve, reject) => {
			const workerCode = `
				import http from 'node:http';
				import { parentPort } from 'node:worker_threads';

				const server = http.createServer((req, res) => {
					if (req.url === '/hello.js') {
						res.writeHead(200, { 'Content-Type': 'application/javascript' });
						res.end(\`
							console.log('HELLO_MODULE_EXECUTED');
							export function hello (name = 'world') {
								return 'Hello, ' + name + '!';
							}
						\`);
					} else if (req.url === '/dot_hello.js') {
						res.writeHead(200, { 'Content-Type': 'application/javascript' });
						res.end(\`
							import { hello } from './hello.js';
							console.log('DOT_HELLO_SUCCESS: ' + hello('relative'));
						\`);
					} else {
						res.writeHead(404);
						res.end('Not found');
					}
				});

				server.listen(0, '127.0.0.1', () => {
					parentPort.postMessage({ port: server.address().port });
				});
			`;

			serverWorker = new Worker(workerCode, { eval: true });
			serverWorker.on('message', (msg) => {
				if (msg.port) resolve(msg.port);
			});
			serverWorker.on('error', reject);
		});

		testConfigPath = path.join(testTmpDir, 'webload.json');
		fs.writeFileSync(
			testConfigPath,
			JSON.stringify({
				imports: {
					'@hello': `http://127.0.0.1:${serverPort}/hello.js`
				},
				'script-src': ['http://127.0.0.1:*', 'http://localhost:*']
			}, null, '\t')
		);
	});

	after(async function () {
		if (testTmpDir && fs.existsSync(testTmpDir)) {
			fs.rmSync(testTmpDir, { recursive: true, force: true });
		}
		if (serverWorker) {
			await serverWorker.terminate();
		}
	});

	it('should execute a local file importing a remote URL module', { skip: skipReason }, function () {
		const testScriptPath = path.join(testTmpDir, 'import_hello.js');
		fs.writeFileSync(
			testScriptPath,
			`
				import { hello } from 'http://127.0.0.1:${serverPort}/hello.js';
				console.log('LOCAL_IMPORT: ' + hello('Bun'));
			`
		);

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Bun process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
		assert.match(result.stdout, /LOCAL_IMPORT: Hello, Bun!/);
	});

	it('should execute an import map entry specifier directly as entrypoint', { skip: skipReason }, function () {
		const result = spawnSync(wicbunBin, ['--config', testConfigPath, '@hello'], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Bun process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
	});

	it('should execute a remote entry point directly when it is the primary module', { skip: skipReason }, function () {
		const entryUrl = `http://127.0.0.1:${serverPort}/hello.js`;

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, entryUrl], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Bun process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
	});

	it('should execute a remote entry point that imports a relative remote module', { skip: skipReason }, function () {
		const entryUrl = `http://127.0.0.1:${serverPort}/dot_hello.js`;

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, entryUrl], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Bun process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
		assert.match(result.stdout, /DOT_HELLO_SUCCESS: Hello, relative!/);
	});

	it('should enforce default deny when script-src is not configured or empty', { skip: skipReason }, function () {
		const denyConfigPath = path.join(testTmpDir, 'deny-webload.json');
		fs.writeFileSync(
			denyConfigPath,
			JSON.stringify({
				'script-src': []
			}, null, '\t')
		);

		const testScriptPath = path.join(testTmpDir, 'denied-app.js');
		fs.writeFileSync(
			testScriptPath,
			`
				import { hello } from 'http://127.0.0.1:${serverPort}/hello.js';
				console.log(hello('Denied'));
			`
		);

		const result = spawnSync(wicbunBin, ['--config', denyConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /violates the following script-src directive/);
	});

	it('should pass script-args to -e / --eval code', { skip: skipReason }, function () {
		const evalCode = `
			console.log('ARGS: ' + process.argv.slice(1).join(','));
		`;

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, '--eval', evalCode, 'foo', 'bar'], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /ARGS: .*foo.*bar/);
	});

	it('should evaluate inline code using -e / --eval with URL imports', { skip: skipReason }, function () {
		const evalCode = `
			import { hello } from 'http://127.0.0.1:${serverPort}/hello.js';
			console.log('EVAL_RESULT: ' + hello('Eval'));
		`;

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, '-e', evalCode], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
		assert.match(result.stdout, /EVAL_RESULT: Hello, Eval!/);
	});

	it('should run tests with --test when test files import remote URL modules', { skip: skipReason }, function () {
		const testFilePath = path.join(testTmpDir, 'test.bun.test.js');
		fs.writeFileSync(
			testFilePath,
			`
				import { describe, it, expect } from 'bun:test';
				import { hello } from 'http://127.0.0.1:${serverPort}/hello.js';

				describe('remote module test in wicbun', function () {
					it('should import and execute correctly inside test runner', function () {
						expect(hello('Tester')).toBe('Hello, Tester!');
					});
				});
			`
		);

		const result = spawnSync(wicbunBin, ['--config', testConfigPath, '--test', testFilePath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		const output = result.stdout + '\n' + result.stderr;
		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(output, /pass/i);
	});
});

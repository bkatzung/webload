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
const wicnodeBin = path.resolve(__dirname, '../bin/wicnode');

describe('CLI: wicnode (Node.js URL Import Runner)', function () {
	let serverWorker;
	let serverPort;
	let testTmpDir;
	let testConfigPath;
	let cacheCount = 0;

	before(async function () {
		testTmpDir = path.join(os.tmpdir(), `webload-test-node-${Date.now()}`);
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
					'@hello': `http://127.0.0.1:${serverPort}/hello.js`,
					'dot/': './'
				},
				'script-src': ['http://127.0.0.1:*', 'http://localhost:*']
			}, null, '\t')
		);
	});

	after(async function () {
		if (fs.existsSync(testTmpDir)) {
			fs.rmSync(testTmpDir, { recursive: true, force: true });
		}
		if (serverWorker) {
			await serverWorker.terminate();
		}
	});

	it('should execute a local file importing a remote URL module', function () {
		const testScriptPath = path.join(testTmpDir, 'import_hello.js');
		fs.writeFileSync(
			testScriptPath,
			`
				import { hello } from 'http://127.0.0.1:${serverPort}/hello.js';
				console.log('LOCAL_IMPORT: ' + hello('Node'));
			`
		);

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
		assert.match(result.stdout, /LOCAL_IMPORT: Hello, Node!/);
	});

	it('should execute an import map entry specifier directly as entrypoint', function () {
		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, '@hello'], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
	});

	it('should resolve and execute a local file entry-point via import map prefix', function () {
		const localScriptPath = path.join(testTmpDir, 'local.js');
		fs.writeFileSync(
			localScriptPath,
			`
				console.log('LOCAL_PREFIX_EXECUTED');
			`
		);

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, 'dot/local.js'], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /LOCAL_PREFIX_EXECUTED/);
	});

	it('should execute a remote entry point directly when it is the primary module', function () {
		const entryUrl = `http://127.0.0.1:${serverPort}/hello.js`;

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, entryUrl], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
	});

	it('should execute a remote entry point that imports a relative remote module', function () {
		const entryUrl = `http://127.0.0.1:${serverPort}/dot_hello.js`;

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, entryUrl], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
		assert.match(result.stdout, /DOT_HELLO_SUCCESS: Hello, relative!/);
	});

	it('should enforce default deny when script-src is not configured or empty', function () {
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

		const result = spawnSync(wicnodeBin, ['--config', denyConfigPath, testScriptPath], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /violates the following script-src directive/);
	});

	it('should pass script-args to -e / --eval code', function () {
		const evalCode = `
			console.log('ARGS: ' + process.argv.slice(1).join(','));
		`;

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, '--eval', evalCode, 'foo', 'bar'], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /ARGS: foo,bar/);
	});

	it('should evaluate inline code using -e / --eval with URL imports', function () {
		const evalCode = `
			import { hello } from 'http://127.0.0.1:${serverPort}/hello.js';
			console.log('EVAL_RESULT: ' + hello('Eval'));
		`;

		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, '-e', evalCode], {
			encoding: 'utf8',
			env: { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) }
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /HELLO_MODULE_EXECUTED/);
		assert.match(result.stdout, /EVAL_RESULT: Hello, Eval!/);
	});

	it('should run tests with --test when test files import remote URL modules', function () {
		const testFilePath = path.join(testTmpDir, 'test.inner.js');
		fs.writeFileSync(
			testFilePath,
			`
				import { describe, it } from 'node:test';
				import assert from 'node:assert/strict';
				import { hello } from 'http://127.0.0.1:${serverPort}/hello.js';

				describe('remote module test in wicnode', function () {
					it('should import and execute correctly inside test runner', function () {
						assert.equal(hello('Tester'), 'Hello, Tester!');
					});
				});
			`
		);

		// Exclude NODE_TEST_CONTEXT and NODE_TEST_WORKER_ID to avoid nested Node test-runner issues
		const { NODE_TEST_CONTEXT, NODE_TEST_WORKER_ID, ...env } = { ...process.env, WEBLOAD_CACHE_DIR: path.join(testTmpDir, 'cache' + ++cacheCount) };
		const result = spawnSync(wicnodeBin, ['--config', testConfigPath, '--test', testFilePath], {
			encoding: 'utf8',
			env
		});

		assert.equal(result.status, 0, `Process failed:\n${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /pass 1/i);
	});
});

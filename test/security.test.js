import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseSourceExpression,
	matchSourceExpression,
	isAllowedScriptSrc,
	validateScriptSrc,
	WebloadSecurityError
} from '../src/security.js';

describe('WebLoad Security: script-src Allowlist', function () {
	describe('parseSourceExpression', function () {
		it('should parse scheme-only rules', function () {
			assert.deepEqual(parseSourceExpression('https:'), {
				scheme: 'https:',
				host: null,
				isWildcard: false,
				baseHost: null,
				port: null,
				pathPrefix: null
			});

			assert.deepEqual(parseSourceExpression('http:'), {
				scheme: 'http:',
				host: null,
				isWildcard: false,
				baseHost: null,
				port: null,
				pathPrefix: null
			});
		});

		it('should parse host-only rules', function () {
			assert.deepEqual(parseSourceExpression('esm.sh'), {
				scheme: null,
				host: 'esm.sh',
				isWildcard: false,
				baseHost: 'esm.sh',
				port: null,
				pathPrefix: null
			});
		});

		it('should parse scheme + host rules', function () {
			assert.deepEqual(parseSourceExpression('https://esm.sh'), {
				scheme: 'https:',
				host: 'esm.sh',
				isWildcard: false,
				baseHost: 'esm.sh',
				port: null,
				pathPrefix: null
			});
		});

		it('should parse wildcard subdomain rules', function () {
			assert.deepEqual(parseSourceExpression('*.esm.sh'), {
				scheme: null,
				host: '*.esm.sh',
				isWildcard: true,
				baseHost: 'esm.sh',
				port: null,
				pathPrefix: null
			});

			assert.deepEqual(parseSourceExpression('https://*.unpkg.com'), {
				scheme: 'https:',
				host: '*.unpkg.com',
				isWildcard: true,
				baseHost: 'unpkg.com',
				port: null,
				pathPrefix: null
			});
		});

		it('should parse host with port and path prefix', function () {
			assert.deepEqual(parseSourceExpression('http://localhost:3000/api/'), {
				scheme: 'http:',
				host: 'localhost',
				isWildcard: false,
				baseHost: 'localhost',
				port: '3000',
				pathPrefix: '/api/'
			});
		});
	});

	describe('matchSourceExpression', function () {
		it('should match schemes correctly', function () {
			assert.equal(matchSourceExpression('https://example.com/mod.js', 'https:'), true);
			assert.equal(matchSourceExpression('http://example.com/mod.js', 'https:'), false);
			assert.equal(matchSourceExpression('http://example.com/mod.js', 'http:'), true);
		});

		it('should match exact hosts', function () {
			assert.equal(matchSourceExpression('https://esm.sh/lodash', 'esm.sh'), true);
			assert.equal(matchSourceExpression('https://esm.sh/lodash', 'https://esm.sh'), true);
			assert.equal(matchSourceExpression('http://esm.sh/lodash', 'https://esm.sh'), false);
			assert.equal(matchSourceExpression('https://other.com/lodash', 'esm.sh'), false);
		});

		it('should match wildcard subdomains', function () {
			assert.equal(matchSourceExpression('https://cdn.esm.sh/mod.js', '*.esm.sh'), true);
			assert.equal(matchSourceExpression('https://sub.cdn.esm.sh/mod.js', '*.esm.sh'), true);
			assert.equal(matchSourceExpression('https://esm.sh/mod.js', '*.esm.sh'), false);
		});

		it('should match path prefixes', function () {
			assert.equal(matchSourceExpression('https://esm.sh/v135/mod.js', 'https://esm.sh/v135/'), true);
			assert.equal(matchSourceExpression('https://esm.sh/v134/mod.js', 'https://esm.sh/v135/'), false);
		});
	});

	describe('validateScriptSrc & Default Deny', function () {
		it('should deny all remote URLs when script-src is missing or empty', function () {
			assert.equal(isAllowedScriptSrc('https://esm.sh/lodash', null), false);
			assert.equal(isAllowedScriptSrc('https://esm.sh/lodash', []), false);
			assert.equal(isAllowedScriptSrc('https://esm.sh/lodash', undefined), false);

			assert.throws(function () {
				validateScriptSrc('https://esm.sh/lodash', []);
			}, function (err) {
				return err instanceof WebloadSecurityError && err instanceof TypeError;
			});
		});

		it('should allow matching URLs and throw on non-matching URLs', function () {
			const rules = ['https://esm.sh', '*.unpkg.com'];

			assert.equal(validateScriptSrc('https://esm.sh/lodash', rules), true);
			assert.equal(validateScriptSrc('https://sub.unpkg.com/pkg', rules), true);

			assert.throws(function () {
				validateScriptSrc('https://malicious.com/hack.js', rules);
			}, WebloadSecurityError);
		});
	});
});

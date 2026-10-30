import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeImportMap,
	resolveImportMap,
	matchSpecifierInMap
} from '../src/import-map.js';

describe('WebLoad Import Maps: WICG Standard Resolution', function () {
	describe('matchSpecifierInMap', function () {
		it('should match exact keys', function () {
			const map = {
				lodash: 'https://esm.sh/lodash-es',
				react: 'https://esm.sh/react'
			};
			assert.equal(matchSpecifierInMap('lodash', map), 'https://esm.sh/lodash-es');
			assert.equal(matchSpecifierInMap('react', map), 'https://esm.sh/react');
			assert.equal(matchSpecifierInMap('vue', map), null);
		});

		it('should match prefix keys with trailing slashes (longest prefix match)', function () {
			const map = {
				'lodash/': 'https://esm.sh/lodash-es/',
				'lodash/fp/': 'https://esm.sh:443/lodash-es/fp/'
			};
			assert.equal(matchSpecifierInMap('lodash/chunk', map), 'https://esm.sh/lodash-es/chunk');
			assert.equal(matchSpecifierInMap('lodash/fp/curry', map), 'https://esm.sh:443/lodash-es/fp/curry');
		});
	});

	describe('resolveImportMap with top-level imports and scopes', function () {
		const importMap = {
			imports: {
				lodash: 'https://esm.sh/lodash-es',
				'components/': 'https://cdn.example.com/ui/'
			},
			scopes: {
				'https://esm.sh/pkg-a/': {
					helper: 'https://esm.sh/pkg-a-helper/index.js'
				},
				'https://esm.sh/pkg-b/': {
					helper: 'https://esm.sh/pkg-b-helper/index.js'
				}
			}
		};

		it('should resolve top-level imports', function () {
			assert.equal(resolveImportMap('lodash', null, importMap), 'https://esm.sh/lodash-es');
			assert.equal(resolveImportMap('components/button.js', null, importMap), 'https://cdn.example.com/ui/button.js');
		});

		it('should resolve context-specific scopes based on referrer', function () {
			assert.equal(
				resolveImportMap('helper', 'https://esm.sh/pkg-a/main.js', importMap),
				'https://esm.sh/pkg-a-helper/index.js'
			);

			assert.equal(
				resolveImportMap('helper', 'https://esm.sh/pkg-b/main.js', importMap),
				'https://esm.sh/pkg-b-helper/index.js'
			);

			// Fallback to top-level if not in scope
			assert.equal(
				resolveImportMap('lodash', 'https://esm.sh/pkg-a/main.js', importMap),
				'https://esm.sh/lodash-es'
			);
		});

		it('should return null when no mapping exists', function () {
			assert.equal(resolveImportMap('nonexistent-pkg', null, importMap), null);
		});
	});
});

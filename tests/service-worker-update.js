import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, it } from 'mocha';

// update.js transitively imports polling.js -> restful-queue, which calls
// idb's openDB() at its own module load time — that needs a real IndexedDB
// implementation (IDBRequest/IDBDatabase classes etc. for instanceof checks),
// which this project doesn't have a test-time polyfill for. Rather than add
// a new dependency (e.g. fake-indexeddb) just to import this one file, this
// test asserts on the file's source directly — a regression guard against
// the fix being accidentally removed, verified live against the built image
// (see the PR for lucas42/lucos_media_seinn#556).

const updateJsPath = fileURLToPath(new URL('../src/service-worker/update.js', import.meta.url));

describe('service-worker update.js', function () {
	it('claims existing clients on activate', function () {
		const source = readFileSync(updateJsPath, 'utf8');
		assert.match(source, /self\.addEventListener\(\s*['"]activate['"]/,
			'update.js should register an activate listener');
		assert.match(source, /self\.clients\.claim\(\)/,
			'the activate listener should call self.clients.claim()');
	});
});

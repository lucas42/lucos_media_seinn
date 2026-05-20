import assert from 'assert';
import { describe, it, beforeEach } from 'mocha';

// ── Globals required by cache-eviction.js ─────────────────────────────────────
//
// cache-eviction.js is a Service Worker module and uses APIs that aren't
// available in Node.js.  Stub them here, before the module is imported, so
// the module-level `new Request('LRU_TIMESTAMPS')` constant initialises
// correctly and `caches.open()` calls succeed.
//
// Node 22 has a native `Request` class, but its constructor rejects relative
// non-URL strings ('LRU_TIMESTAMPS'), so we unconditionally replace it with
// a lightweight stub.

globalThis.Request = class Request {
	constructor(url) { this.url = String(url); }
};

globalThis.Response = class Response {
	constructor(body) { this._body = body; }
	text()  { return Promise.resolve(this._body); }
	json()  { return Promise.resolve(JSON.parse(this._body)); }
	// arrayBuffer() is called by getCacheSizeWithMap; return empty buffer.
	arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
};

// ── In-memory Cache Storage mock ─────────────────────────────────────────────

let cacheStores;

function makeCache() {
	const store = new Map();
	return {
		match: async (request) => {
			const key = typeof request === 'string' ? request : request.url;
			return store.get(key) ?? null;
		},
		put: async (request, response) => {
			const key = typeof request === 'string' ? request : request.url;
			// Read and re-wrap so the stored response can be read multiple times.
			const text = await response.text();
			store.set(key, {
				text:        () => Promise.resolve(text),
				json:        () => Promise.resolve(JSON.parse(text)),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
			});
		},
		keys:   async () => [...store.keys()].map(k => ({ url: k })),
		delete: async (request) => {
			const key = typeof request === 'string' ? request : request.url;
			return store.delete(key);
		},
	};
}

function resetCaches() {
	cacheStores = new Map();
	globalThis.caches = {
		open: async (name) => {
			if (!cacheStores.has(name)) cacheStores.set(name, makeCache());
			return cacheStores.get(name);
		},
	};
}

// Initialise before the module is imported (it calls caches.open() at runtime,
// so the stub just needs to be present; the module-level constant only needs
// Request, which we've already set above).
resetCaches();

// ── Import the module under test ──────────────────────────────────────────────

const { updateLRUTimestamp } = await import('../src/service-worker/cache-eviction.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readStoredTimestamps() {
	const lruCache = await caches.open('lru-metadata-v1');
	const response = await lruCache.match(new Request('LRU_TIMESTAMPS'));
	if (!response) return {};
	return response.json();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cache-eviction: updateLRUTimestamp', function () {

	beforeEach(() => resetCaches());

	it('records a timestamp for a single track URL', async function () {
		const url = 'https://media.example.com/track-a.mp3';
		await updateLRUTimestamp(url);

		const timestamps = await readStoredTimestamps();
		assert.ok(
			Object.prototype.hasOwnProperty.call(timestamps, url),
			'Timestamp entry should exist for the track URL'
		);
		assert.strictEqual(typeof timestamps[url], 'number', 'Timestamp should be a number');
	});

	it('serialises parallel calls — all N timestamps are recorded', async function () {
		const N = 10;
		const urls = Array.from({ length: N }, (_, i) => `https://media.example.com/track-${i}.mp3`);

		// Mirror the forEach(async …) pattern in preload.js
		await Promise.all(urls.map(url => updateLRUTimestamp(url)));

		const timestamps = await readStoredTimestamps();

		for (const url of urls) {
			assert.ok(
				Object.prototype.hasOwnProperty.call(timestamps, url),
				`Expected timestamp for ${url} to be recorded — possible lost-update race`
			);
			assert.strictEqual(
				typeof timestamps[url], 'number',
				`Timestamp for ${url} should be a number`
			);
		}
		assert.strictEqual(
			Object.keys(timestamps).length, N,
			`Expected exactly ${N} entries in the timestamp store`
		);
	});

	it('updates an existing timestamp on repeated calls', async function () {
		const url = 'https://media.example.com/track-b.mp3';

		await updateLRUTimestamp(url);
		const { [url]: first } = await readStoredTimestamps();

		// Force a small delay so Date.now() advances
		await new Promise(resolve => setTimeout(resolve, 5));
		await updateLRUTimestamp(url);
		const { [url]: second } = await readStoredTimestamps();

		assert.ok(second >= first, 'Second timestamp should be >= first');
	});

});

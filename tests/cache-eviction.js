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
	// size option allows tests to control how large getCacheSizeWithMap() thinks
	// a response is (it calls arrayBuffer() and reads .byteLength).
	// faultyArrayBuffer option simulates a response whose body cannot be read —
	// used to test the getCacheSizeWithMap try-catch hardening added for #469.
	constructor(body, { size = 0, faultyArrayBuffer = false } = {}) {
		this._body = body;
		this._size = size;
		this._faultyArrayBuffer = faultyArrayBuffer;
	}
	text()  { return Promise.resolve(this._body); }
	json()  { return Promise.resolve(JSON.parse(this._body)); }
	// arrayBuffer() is called by getCacheSizeWithMap; return object with byteLength
	// so tests can control the reported size without allocating gigabytes of RAM.
	arrayBuffer() {
		if (this._faultyArrayBuffer) return Promise.reject(new TypeError('Failed to fetch'));
		return Promise.resolve({ byteLength: this._size });
	}
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
			// Preserve the size hint so getCacheSizeWithMap() sees the right byteLength.
			const sizeBytes = response._size ?? 0;
			// Preserve the faultyArrayBuffer flag so tests can simulate unreadable entries.
			const faultyArrayBuffer = response._faultyArrayBuffer ?? false;
			store.set(key, {
				text:        () => Promise.resolve(text),
				json:        () => Promise.resolve(JSON.parse(text)),
				arrayBuffer: faultyArrayBuffer
					? () => Promise.reject(new TypeError('Failed to fetch'))
					: () => Promise.resolve({ byteLength: sizeBytes }),
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

// ── Additional globals required by failure-detection tests ────────────────────

// BroadcastChannel: used by notifyCacheDegraded() to notify the page.
// The stub captures the last message posted so tests can assert on it.
// Must be set before the module is imported because the module-level code
// doesn't reference BroadcastChannel at import time, but we set it here for
// clarity alongside the other global stubs.
let lastBroadcastMessage = null;

globalThis.BroadcastChannel = class BroadcastChannel {
	constructor() {}
	postMessage(msg) { lastBroadcastMessage = msg; }
	addEventListener() {}
	close() {}
};

// navigator.storage.estimate: called by notifyCacheDegraded().
// Node.js exposes navigator as a read-only getter on globalThis, so a plain
// assignment throws.  We extend the existing object rather than replacing it so
// other tests that depend on navigator.userAgent or other properties continue
// to work.
globalThis.navigator.storage = {
	estimate: async () => ({ quota: 1_000_000, usage: 500_000 }),
};

// ── Import the module under test ──────────────────────────────────────────────

const { recordCacheHit, recordCacheWrite, _resetDetectionStateForTest } = await import('../src/service-worker/cache-eviction.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readStoredTimestamps() {
	const lruCache = await caches.open('lru-metadata-v1');
	const response = await lruCache.match(new Request('LRU_TIMESTAMPS'));
	if (!response) return {};
	return response.json();
}

function makeFaultyCaches() {
	globalThis.caches = {
		open: async () => { throw new Error('simulated cache open failure'); },
	};
}

// ── Failure-detection tests ───────────────────────────────────────────────────

describe('cache-eviction: eviction failure detection', function () {

	beforeEach(() => {
		resetCaches();
		lastBroadcastMessage = null;
		globalThis.BroadcastChannel = class BroadcastChannel {
			constructor() {}
			postMessage(msg) { lastBroadcastMessage = msg; }
			addEventListener() {}
			close() {}
		};
		_resetDetectionStateForTest();
	});

	it('does not fire the banner after a single eviction failure', async function () {
		makeFaultyCaches();
		await recordCacheWrite('https://media.example.com/track.mp3');
		assert.strictEqual(
			lastBroadcastMessage, null,
			'Banner should not fire after just one failure'
		);
	});

	it('fires the cache-thrash banner after reaching the failure threshold (2 in window)', async function () {
		makeFaultyCaches();
		await recordCacheWrite('https://media.example.com/track.mp3');
		await recordCacheWrite('https://media.example.com/track.mp3');
		assert.strictEqual(
			lastBroadcastMessage, 'cache-thrash',
			'Banner should fire once threshold is reached'
		);
	});

	it('fires the banner exactly once even when failures continue', async function () {
		makeFaultyCaches();
		let messageCount = 0;
		globalThis.BroadcastChannel = class BroadcastChannel {
			constructor() {}
			postMessage() { messageCount++; }
			close() {}
		};

		await recordCacheWrite('https://media.example.com/track.mp3');
		await recordCacheWrite('https://media.example.com/track.mp3');
		await recordCacheWrite('https://media.example.com/track.mp3');
		await recordCacheWrite('https://media.example.com/track.mp3');

		assert.strictEqual(messageCount, 1, 'Banner should fire exactly once regardless of subsequent failures');
	});

});

// ── LRU timestamp tests ───────────────────────────────────────────────────────

describe('cache-eviction: recordCacheHit', function () {

	beforeEach(() => resetCaches());

	it('records a timestamp for a single track URL', async function () {
		const url = 'https://media.example.com/track-a.mp3';
		await recordCacheHit(url);

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
		await Promise.all(urls.map(url => recordCacheHit(url)));

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

		await recordCacheHit(url);
		const { [url]: first } = await readStoredTimestamps();

		// Force a small delay so Date.now() advances
		await new Promise(resolve => setTimeout(resolve, 5));
		await recordCacheHit(url);
		const { [url]: second } = await readStoredTimestamps();

		assert.ok(second >= first, 'Second timestamp should be >= first');
	});

});

// ── Cross-lock race tests ─────────────────────────────────────────────────────
//
// Validates that the unified-lock fix (issue #472) prevents recordCacheHit()
// entries from being silently overwritten by a concurrent eviction pass.
//
// Before the fix, _evictIfOverBudget() ran under evictionLock only while
// recordCacheHit() ran under timestampLock only.  A recordCacheHit() that
// interleaved between _evictIfOverBudget()'s readTimestamps() and the
// subsequent writeTimestamps() inside evictTrack() would be silently dropped —
// confirmed in production on 2026-05-22 (LRU map shrank 14 → 2 while
// tracks-v1 grew 815 → 823 in the same window).
//
// After the fix, _evictIfOverBudget() also holds timestampLock for its entire
// duration, so concurrent recordCacheHit() calls queue behind it.

describe('cache-eviction: cross-lock race (recordCacheHit vs _evictIfOverBudget)', function () {

	beforeEach(() => {
		resetCaches();
		lastBroadcastMessage = null;
		globalThis.BroadcastChannel = class BroadcastChannel {
			constructor() {}
			postMessage(msg) { lastBroadcastMessage = msg; }
			addEventListener() {}
			close() {}
		};
		_resetDetectionStateForTest();
	});

	it('does not lose a concurrent recordCacheHit entry during an eviction pass', async function () {
		const existingUrl = 'https://media.example.com/existing.mp3';
		const newUrl      = 'https://media.example.com/concurrent.mp3';

		// Seed: put a large track in tracks-v1 so that getCacheSizeWithMap()
		// reports a total above CACHE_BUDGET_BYTES (750 MB), triggering eviction.
		// The size option is read by the updated makeCache() put() so no real
		// memory allocation happens — only .byteLength is used by the eviction code.
		//
		// Both URLs must be in tracks-v1: _evictIfOverBudget() prunes LRU entries
		// for URLs *not* in the cache (orphan-prune), which would remove newUrl
		// before eviction even starts, masking the cross-lock race under test.
		const OVER_BUDGET = 800 * 1024 * 1024;  // 800 MB
		const trackCache  = await caches.open('tracks-v1');
		await trackCache.put(new Request(existingUrl), new Response('{}', { size: OVER_BUDGET }));
		await trackCache.put(new Request(newUrl), new Response('{}', { size: 0 }));

		// Seed the LRU store with a timestamp for the existing track.
		await recordCacheHit(existingUrl);

		// Fire both concurrently: an eviction-triggering write and a recordCacheHit
		// for a brand-new URL.  Before the fix the new entry would be overwritten
		// by evictTrack()'s stale-snapshot writeTimestamps(); after the fix the
		// eviction holds timestampLock so the recordCacheHit() queues behind it.
		await Promise.all([
			recordCacheWrite(existingUrl),
			recordCacheHit(newUrl),
		]);

		const timestamps = await readStoredTimestamps();
		assert.ok(
			Object.prototype.hasOwnProperty.call(timestamps, newUrl),
			'recordCacheHit entry for newUrl must survive a concurrent eviction pass'
		);
	});

});

// ── getCacheSizeWithMap hardening tests ──────────────────────────────────────
//
// Validates the try-catch added around arrayBuffer() in getCacheSizeWithMap()
// (issue #469).  An unreadable entry must not abort the entire eviction pass;
// the pass should continue and succeed for the remaining healthy entries.

describe('cache-eviction: getCacheSizeWithMap tolerates unreadable entries', function () {

	beforeEach(() => {
		resetCaches();
		lastBroadcastMessage = null;
		globalThis.BroadcastChannel = class BroadcastChannel {
			constructor() {}
			postMessage(msg) { lastBroadcastMessage = msg; }
			addEventListener() {}
			close() {}
		};
		_resetDetectionStateForTest();
	});

	it('does not fire the eviction-failure banner when only one entry is unreadable', async function () {
		const healthyUrl = 'https://media.example.com/healthy.mp3';
		const faultyUrl  = 'https://media.example.com/faulty.mp3';

		// Put both entries in tracks-v1: one normal (over-budget), one unreadable.
		const OVER_BUDGET = 800 * 1024 * 1024;
		const trackCache  = await caches.open('tracks-v1');
		await trackCache.put(new Request(healthyUrl), new Response('{}', { size: OVER_BUDGET }));
		await trackCache.put(new Request(faultyUrl),  new Response('{}', { faultyArrayBuffer: true }));

		// Seed LRU with both URLs so _evictIfOverBudget() has candidates.
		await recordCacheHit(healthyUrl);
		await recordCacheHit(faultyUrl);

		// Trigger an eviction pass.  Without the try-catch this would throw and
		// increment the failure counter; with the try-catch it must succeed.
		await recordCacheWrite(healthyUrl);

		assert.strictEqual(
			lastBroadcastMessage, null,
			'Eviction-failure banner must not fire — unreadable entry should be skipped, not thrown'
		);
	});

	it('still evicts healthy entries even when a faulty entry is present', async function () {
		const healthyUrl = 'https://media.example.com/healthy-evict.mp3';
		const faultyUrl  = 'https://media.example.com/faulty-evict.mp3';

		// healthy entry is large enough to trigger eviction; faulty entry has no
		// measurable size (unreadable), so it is conservatively excluded from the total.
		const OVER_BUDGET = 800 * 1024 * 1024;
		const trackCache  = await caches.open('tracks-v1');
		await trackCache.put(new Request(healthyUrl), new Response('{}', { size: OVER_BUDGET }));
		await trackCache.put(new Request(faultyUrl),  new Response('{}', { faultyArrayBuffer: true }));

		// Seed LRU: healthy is older (lower timestamp) → first candidate for eviction.
		await recordCacheHit(healthyUrl);
		await new Promise(resolve => setTimeout(resolve, 5));
		await recordCacheHit(faultyUrl);

		await recordCacheWrite(healthyUrl);

		// The healthy entry should have been evicted to bring total back under budget.
		const keys = await (await caches.open('tracks-v1')).keys();
		const remaining = keys.map(k => k.url);
		assert.ok(
			!remaining.includes(healthyUrl),
			'Healthy over-budget entry should have been evicted'
		);
	});

});

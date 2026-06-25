import assert from 'assert';
import { describe, it, before, beforeEach, afterEach } from 'mocha';

// ── Globals required by handle-request.js (and its transitive deps) ────────────
//
// handle-request.js is a Service Worker module.  It imports local-device.js,
// which uses localStorage (provided by --localstorage-file in the test command)
// and lucos_pubsub (works in Node.js).  handle-request.js itself accesses:
//   - self.location.origin  — compared against the request URL's origin
//   - fetch                 — called for network-bypass paths
//   - caches.match          — called for the cache-hit path
//
// We set these up here so they are in place before the dynamic import below.

globalThis.self = {
	location: { origin: 'https://ceol.l42.eu' },
	addEventListener: () => {},
};

globalThis.caches = {
	match: async () => null,
	open: async () => ({ match: async () => null, put: async () => {} }),
	delete: async () => {},
};

// ── Module import ───────────────────────────────────────────────────────────────

let createHandleRequest;

before(async () => {
	const mod = await import('../src/service-worker/handle-request.js');
	createHandleRequest = mod.createHandleRequest;
});

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('service-worker handleRequest — cross-origin /auth/* bypass', function () {
	let fetchCalls;
	let queueCalls;
	let handleRequest;
	let origFetch;

	beforeEach(function () {
		fetchCalls = [];
		queueCalls = [];
		origFetch = globalThis.fetch;

		// Restore caches to the minimal stub needed for handle-request.js.
		// cache-eviction.js replaces globalThis.caches at module level with a
		// different mock; we reset it here so service-worker tests are isolated.
		globalThis.caches = {
			match: async () => null,
			open: async () => ({ match: async () => null, put: async () => {} }),
			delete: async () => {},
		};

		// cache-eviction.js replaces globalThis.Request with a stub that only
		// stores `url`, dropping `method`.  handleRequest relies on `method` to
		// route into the POST/PUT/DELETE write-queue branch, so restore a minimal
		// Request that preserves both fields for service-worker tests.
		globalThis.Request = class Request {
			constructor(url, { method = 'GET', headers = {} } = {}) {
				this.url = String(url);
				this.method = method;
				this.headers = headers;
			}
			clone() {
				return new globalThis.Request(this.url, { method: this.method, headers: this.headers });
			}
		};

		// Return a plain object rather than `new Response(...)` because
		// cache-eviction.js replaces globalThis.Response with a stub that omits
		// the `status` field; using a plain object keeps the assertion reliable.
		globalThis.fetch = async (request) => {
			fetchCalls.push(request.url);
			return { status: 200, statusText: 'OK' };
		};

		// queueAndAttemptRequest is a sentinel: if it fires for a cross-origin
		// /auth/* request, the guard is missing and the test must fail loudly.
		const queueAndAttemptRequest = async (request) => {
			queueCalls.push(request.url);
			return { status: 202, statusText: 'Added to Queue' };
		};

		handleRequest = createHandleRequest({
			queueAndAttemptRequest,
			getPoll: async () => { throw new Error('getPoll must not be called'); },
			modifyPollData: async () => { throw new Error('modifyPollData must not be called'); },
			recordCacheHit: async () => {},
		});
	});

	afterEach(function () {
		globalThis.fetch = origFetch;
	});

	// ── Core regression: cross-origin /auth/* goes straight to fetch ─────────────

	it('cross-origin /auth/* POST bypasses the write queue and returns the network response', async function () {
		const request = new Request('https://aithne.l42.eu/auth/remint', { method: 'POST' });
		const response = await handleRequest(request);

		assert.strictEqual(response.status, 200, 'should return the direct network response (status 200)');
		assert.strictEqual(fetchCalls.length, 1, 'fetch() should have been called exactly once');
		assert.strictEqual(fetchCalls[0], 'https://aithne.l42.eu/auth/remint', 'fetch() should be called with the original request URL');
		assert.strictEqual(queueCalls.length, 0, 'queueAndAttemptRequest must NOT be called for cross-origin /auth/* requests');
	});

	it('cross-origin /auth/* GET also bypasses the write queue', async function () {
		const request = new Request('https://aithne.l42.eu/auth/session', { method: 'GET' });
		const response = await handleRequest(request);

		assert.strictEqual(response.status, 200, 'should return the direct network response');
		assert.strictEqual(fetchCalls.length, 1, 'fetch() should be called for GET too');
		assert.strictEqual(queueCalls.length, 0, 'queueAndAttemptRequest must NOT be called');
	});

	// ── Contrast: same-origin POST goes through the write queue (guard is targeted) ─

	it('same-origin POST is NOT bypassed and reaches the write queue', async function () {
		// For this test we need modifyPollData to succeed (it runs before queueAndAttemptRequest).
		const sameOriginHandle = createHandleRequest({
			queueAndAttemptRequest: async (req) => {
				queueCalls.push(req.url);
				return new Response(null, { status: 202, statusText: 'Added to Queue' });
			},
			getPoll: async () => { throw new Error('getPoll must not be called'); },
			modifyPollData: async () => {},  // no-op; allows the POST branch to proceed
			recordCacheHit: async () => {},
		});
		const request = new Request('https://ceol.l42.eu/v3/tracks/123', { method: 'POST' });
		await sameOriginHandle(request);

		assert.strictEqual(queueCalls.length, 1, 'same-origin POST should go through the write queue');
		assert.strictEqual(fetchCalls.length, 0, 'fetch() should NOT be called directly for a same-origin POST');
	});
});

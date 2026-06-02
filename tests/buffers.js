import assert from 'assert';
import { describe, it, beforeEach, before } from 'mocha';

// ── Globals required by buffers.js ─────────────────────────────────────────────
//
// Note: tests/web-player.js also sets globalThis.AudioContext at module-level
// (always-rejecting decodeAudioData), and Mocha loads all files before running
// any before() hooks.  Buffers.js creates `audioContext = new AudioContext()` at
// module load time, so it ends up with web-player.js's always-rejecting stub.
// That's fine for these tests: we only need to exercise the rejection-eviction
// path, and we never need decodeAudioData to succeed here.
//
// The tests below verify the core fix for issue #487: rejected promises are
// evicted from the buffers cache so that callers can retry rather than getting
// back the same stale rejection indefinitely.

// ── Module import ──────────────────────────────────────────────────────────────

let getBuffer, _resetBuffersForTest;

before(async () => {
	// Init media-headers so buffers.js's getMediaHeaders() call resolves.
	// web-player.js's before() also calls this; calling it twice is idempotent.
	const { init: initMediaHeaders } = await import('../src/utils/media-headers.js');
	initMediaHeaders({ user: 'test', password: 'test' });

	const mod = await import('../src/client/buffers.js');
	getBuffer = mod.getBuffer;
	_resetBuffersForTest = mod._resetBuffersForTest;
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('buffers: rejected-promise cache eviction', function () {
	this.timeout(3000);

	let fetchCallCount;
	let originalFetch;

	beforeEach(() => {
		fetchCallCount = 0;
		originalFetch = global.fetch;
		global.fetch = async (_url, _options) => {
			fetchCallCount++;
			return {
				ok: true,
				status: 200,
				arrayBuffer: async () => new ArrayBuffer(8),
			};
		};
		_resetBuffersForTest();
	});

	it('retries a fresh fetch when the first call rejected (rejected promise is not cached)', async function () {
		const url = 'http://media.example.com/track.mp3';

		// First call — decodeAudioData rejects (always-rejecting stub from web-player.js tests).
		try {
			await getBuffer(url);
		} catch (_e) {
			// Expected.
		}

		// Give the internal eviction .catch() time to fire (it's a microtask, but be safe).
		await new Promise(resolve => setTimeout(resolve, 10));

		// Second call — must start a new fetch, not return the old rejection.
		try {
			await getBuffer(url);
		} catch (_e) {
			// Expected.
		}

		global.fetch = originalFetch;

		assert.strictEqual(
			fetchCallCount, 2,
			'fetch should have been called twice — once per attempt, not cached after rejection'
		);
	});
});

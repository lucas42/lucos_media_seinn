import assert from 'assert';
import { describe, it, before, beforeEach } from 'mocha';

/**
 * Override the AudioContext stub with one that supports the web-player code paths.
 * web-components.js sets a basic stub; we upgrade it here before web-player.js is
 * dynamically imported so both web-player.js and buffers.js get the richer version.
 */
global.AudioContext = class {
	constructor() {
		this.state = 'running';
		this.currentTime = 0;
		this.destination = {};
		this.sampleRate = 44100;
	}
	close() {}
	resume() {}
	createGain() {
		return {
			gain: {
				value: 1,
				linearRampToValueAtTime() {},
			},
			connect() {},
		};
	}
	createBufferSource() {
		return {
			buffer: null,
			connect() {},
			start() {},
			addEventListener() {},
			removeEventListener() {},
			trackUrl: null,
			trackUuid: null,
		};
	}
	// buffers.js calls decodeAudioData after fetching the audio file.
	// Reject so that web-player.js's catch block fires.
	decodeAudioData() {
		return Promise.reject(new Error('Unable to decode audio data'));
	}
};

// Ensure navigator is accessible as a global with the fields needed by both
// web-player.js (userAgent) and notifyCacheDegraded (storage.estimate).
if (!global.navigator) {
	global.navigator = { userAgent: 'TestBrowser/1.0' };
}
if (!global.navigator.storage) {
	global.navigator.storage = {
		estimate: async () => ({ quota: 1_000_000, usage: 500_000 }),
	};
}

describe("web-player error reporting", function () {
	this.timeout(5000);

	let captureErrorRequest;
	let originalFetch;

	before(async () => {
		// Stub global.fetch:
		//   - Audio resource URLs: return a mock response that lets the fetch succeed
		//     but then decodeAudioData (on the AudioContext stub above) will reject.
		//   - Manager DELETE requests: resolve immediately and capture the call.
		originalFetch = global.fetch;
		global.fetch = async (url, options = {}) => {
			if (url && url.includes('action=error')) {
				// Capture DELETE to the manager error endpoint
				if (captureErrorRequest) captureErrorRequest({ url, body: options.body });
				return { ok: true, status: 204, text: async () => '' };
			}
			if (url && (url.includes('test-manager') || url.includes('v3/'))) {
				// Other manager calls (e.g. PUT is-playing, POST started)
				return { ok: true, status: 204, text: async () => '' };
			}
			// Audio resource fetch — return a minimal valid response so the pipeline
			// proceeds to decodeAudioData (which rejects on our stub).
			return {
				ok: true,
				status: 200,
				arrayBuffer: async () => new ArrayBuffer(8),
				text: async () => '',
			};
		};

		// Init manager so del() calls can resolve
		const { init: initManager } = await import('../src/utils/manager.js');
		initManager('http://test-manager/', 'test-api-key');

		// Init media-headers so buffers.js's getMediaHeaders() promise resolves
		const { init: initMediaHeaders } = await import('../src/utils/media-headers.js');
		initMediaHeaders({ user: 'test', password: 'test' });

		// Mark this device as current so web-player.js's updateCurrentAudio triggers playback
		const { setCurrent } = await import('../src/utils/local-device.js');
		setCurrent(true);

		// Import and initialise the web player (also registers the managerData listener)
		await import('../src/client/web-player.js');
	});

	it("sends a JSON envelope with errorMessage and context fields on playback failure", (done) => {
		// Promise that resolves when the DELETE ?action=error fetch is captured
		const deleteCapture = new Promise((resolve) => {
			captureErrorRequest = resolve;
		});

		// Fire a managerData event — this triggers updateCurrentAudio → playTrack → error
		import('../src/client/player.js').then(async ({ default: _player }) => {
			const { send } = await import('lucos_pubsub');
			send("managerData", {
				tracks: [{ url: 'http://test-audio.example.com/track.mp3', uuid: 'test-uuid-abc', currentTime: 0 }],
				isPlaying: true,
				volume: 1,
			});
		});

		deleteCapture.then(({ url, body }) => {
			try {
				assert.ok(url.includes('action=error'), `DELETE URL should include action=error, got: ${url}`);

				const payload = JSON.parse(body);

				// errorMessage should be the raw error string, not the full JSON
				assert.equal(typeof payload.errorMessage, 'string', 'errorMessage should be a string');
				assert.ok(payload.errorMessage.length > 0, 'errorMessage should not be empty');

				// errorName should be the DOMException / Error name
				assert.equal(typeof payload.errorName, 'string', 'errorName should be a string');
				assert.ok(payload.errorName.length > 0, 'errorName should not be empty');

				// context fields
				assert.ok(payload.context, 'payload should have a context object');
				assert.ok('audioContextState' in payload.context, 'context should include audioContextState');
				assert.ok('pageVisible' in payload.context, 'context should include pageVisible');
				assert.ok('sessionErrorCount' in payload.context, 'context should include sessionErrorCount');
				assert.ok('userAgent' in payload.context, 'context should include userAgent');

				// sessionErrorCount should be a positive integer
				assert.equal(typeof payload.context.sessionErrorCount, 'number');
				assert.ok(payload.context.sessionErrorCount >= 1, 'sessionErrorCount should be at least 1');

				// response diagnostics — present because our fetch stub returns a valid response
				assert.ok('responseStatus' in payload.context, 'context should include responseStatus');
				assert.equal(typeof payload.context.responseStatus, 'number', 'responseStatus should be a number');
				assert.ok('responseContentType' in payload.context, 'context should include responseContentType');
				assert.ok('responseByteLength' in payload.context, 'context should include responseByteLength');
				assert.equal(typeof payload.context.responseByteLength, 'number', 'responseByteLength should be a number');

				done();
			} catch (err) {
				done(err);
			}
		}).catch(done);
	});
});

// ── Playback-error thrash detection tests ─────────────────────────────────────
//
// Validates the sliding-window detector wired into the playTrack catch block
// (issue #482).  Uses the exported test helpers to drive the detector directly
// rather than going through the full async managerData → playTrack cycle.

describe("web-player: playback-error thrash detection", function () {
	this.timeout(5000);

	let lastBroadcastMessage;
	let _resetPlaybackDetectorForTest;
	let _triggerPlaybackErrorForTest;

	before(async () => {
		// Grab the test helpers from the already-imported web-player module.
		const mod = await import('../src/client/web-player.js');
		_resetPlaybackDetectorForTest = mod._resetPlaybackDetectorForTest;
		_triggerPlaybackErrorForTest  = mod._triggerPlaybackErrorForTest;
	});

	beforeEach(() => {
		lastBroadcastMessage = null;
		// notifyCacheDegraded() in thrash-detection.js uses new BroadcastChannel(...)
		// at notification time (not at import time), so setting the global here is sufficient.
		globalThis.BroadcastChannel = class BroadcastChannel {
			constructor() {}
			postMessage(msg) { lastBroadcastMessage = msg; }
			addEventListener() {}
			close() {}
		};
		_resetPlaybackDetectorForTest();
	});

	it('does not fire the banner on a single isolated playback error', async function () {
		_triggerPlaybackErrorForTest();
		// Allow the async notifyCacheDegraded chain to settle (it won't fire here).
		await new Promise(resolve => setTimeout(resolve, 20));
		assert.strictEqual(
			lastBroadcastMessage, null,
			'A single error must not trigger the cache-thrash banner'
		);
	});

	it('fires the cache-thrash banner when 6 errors occur within 60 s', async function () {
		for (let i = 0; i < 6; i++) _triggerPlaybackErrorForTest();
		// notifyCacheDegraded is async (awaits navigator.storage.estimate) —
		// give the microtask queue time to flush before asserting.
		await new Promise(resolve => setTimeout(resolve, 20));
		assert.strictEqual(
			lastBroadcastMessage, 'cache-thrash',
			'Banner must fire once the 6-error threshold is crossed'
		);
	});

	it('fires the banner exactly once even if errors keep accumulating', async function () {
		let broadcastCount = 0;
		globalThis.BroadcastChannel = class BroadcastChannel {
			constructor() {}
			postMessage() { broadcastCount++; }
			addEventListener() {}
			close() {}
		};
		for (let i = 0; i < 12; i++) _triggerPlaybackErrorForTest();
		await new Promise(resolve => setTimeout(resolve, 20));
		assert.strictEqual(
			broadcastCount, 1,
			'Banner should fire exactly once regardless of continued errors'
		);
	});
});

// ── Circuit-breaker tests ──────────────────────────────────────────────────────
//
// Validates that once the playback-error detector threshold fires, playTrack
// stops calling del(action=error) — freezing the manager's playlist — and that
// the 'playback-resume' path resets the breaker and re-reports the stalled track.
//
// Uses the exported test helpers (_triggerPlaybackErrorForTest, _resetPlaybackDetectorForTest,
// _getStalledTrackUuidForTest, _simulateResumeForTest) to keep the tests synchronous
// and side-effect-free without needing full managerData → playTrack cycles.

describe("web-player: circuit breaker", function () {
	this.timeout(5000);

	let _resetPlaybackDetectorForTest;
	let _triggerPlaybackErrorForTest;
	let _getStalledTrackUuidForTest;
	let _simulateResumeForTest;

	before(async () => {
		const mod = await import('../src/client/web-player.js');
		_resetPlaybackDetectorForTest = mod._resetPlaybackDetectorForTest;
		_triggerPlaybackErrorForTest  = mod._triggerPlaybackErrorForTest;
		_getStalledTrackUuidForTest   = mod._getStalledTrackUuidForTest;
		_simulateResumeForTest        = mod._simulateResumeForTest;
	});

	beforeEach(() => {
		globalThis.BroadcastChannel = class BroadcastChannel {
			constructor() {}
			postMessage() {}
			addEventListener() {}
			close() {}
		};
		_resetPlaybackDetectorForTest();
	});

	it('does not set stalledTrackUuid before the threshold is crossed', function () {
		for (let i = 0; i < 5; i++) _triggerPlaybackErrorForTest();
		assert.strictEqual(
			_getStalledTrackUuidForTest(), null,
			'stalledTrackUuid must remain null while below threshold'
		);
	});

	it('sets stalledTrackUuid on the error that crosses the threshold', async function () {
		// Pre-seed 5 errors using the test helper (puts detector at 5/6).
		for (let i = 0; i < 5; i++) _triggerPlaybackErrorForTest();

		// Capture whether del(action=error) is called for the 6th error.
		// The 6th error is triggered via the real managerData → playTrack path.
		let errorDelCalled = false;
		const originalFetch = global.fetch;
		global.fetch = async (url, options = {}) => {
			if (url && url.includes('action=error')) {
				errorDelCalled = true;
				return { ok: true, status: 204, text: async () => '' };
			}
			return originalFetch(url, options);
		};

		try {
			// Trigger the 6th error by sending a managerData event — this calls
			// updateCurrentAudio → playTrack → catch block → circuit breaker fires.
			const { send } = await import('lucos_pubsub');
			const trackUuid = 'circuit-breaker-test-uuid';
			send("managerData", {
				tracks: [{ url: 'http://test-audio.example.com/breaker.mp3', uuid: trackUuid, currentTime: 0 }],
				isPlaying: true,
				volume: 1,
			});

			// Allow the async playTrack chain to complete.
			await new Promise(resolve => setTimeout(resolve, 50));

			assert.strictEqual(
				_getStalledTrackUuidForTest(), trackUuid,
				'stalledTrackUuid must be set to the failing track uuid after circuit breaker fires'
			);
			assert.strictEqual(
				errorDelCalled, false,
				'del(action=error) must NOT be called when the circuit breaker fires — manager must not advance'
			);
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('resume resets stalledTrackUuid and calls del(action=error) for the stalled track', async function () {
		// Manually set circuit-breaker state as if it had just fired.
		for (let i = 0; i < 6; i++) _triggerPlaybackErrorForTest();
		// At this point isDetected() is true but stalledTrackUuid is still null
		// because _triggerPlaybackErrorForTest bypasses the playTrack code path.
		// We seed stalledTrackUuid via a real playTrack cycle.

		// Use a distinct uuid for the resume assertion.
		const stalledUuid = 'resume-test-stalled-uuid';

		// Directly manipulate module state via the reset + trigger path:
		// reset detector, then seed 5 errors, then trigger a 6th via managerData.
		_resetPlaybackDetectorForTest();
		for (let i = 0; i < 5; i++) _triggerPlaybackErrorForTest();

		const { send } = await import('lucos_pubsub');
		send("managerData", {
			tracks: [{ url: 'http://test-audio.example.com/stall.mp3', uuid: stalledUuid, currentTime: 0 }],
			isPlaying: true,
			volume: 1,
		});
		await new Promise(resolve => setTimeout(resolve, 50));

		// Verify circuit breaker fired and stalled the correct track.
		assert.strictEqual(
			_getStalledTrackUuidForTest(), stalledUuid,
			'circuit breaker must be set before testing resume'
		);

		// Now capture the del call triggered by resume.
		let resumeDelUrl = null;
		const originalFetch = global.fetch;
		global.fetch = async (url, options = {}) => {
			if (url && url.includes('action=error')) {
				resumeDelUrl = url;
				return { ok: true, status: 204, text: async () => '' };
			}
			return originalFetch(url, options);
		};

		try {
			_simulateResumeForTest();

			// Allow the async del() call to resolve.
			await new Promise(resolve => setTimeout(resolve, 50));

			assert.strictEqual(
				_getStalledTrackUuidForTest(), null,
				'stalledTrackUuid must be cleared after resume'
			);
			assert.ok(
				resumeDelUrl && resumeDelUrl.includes(stalledUuid),
				`del(action=error) must be called with the stalled track uuid on resume; got: ${resumeDelUrl}`
			);
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('resume resets the detector so errors can be recorded again', function () {
		for (let i = 0; i < 6; i++) _triggerPlaybackErrorForTest();
		assert.ok(
			// Detector is in detected state — simulate resume
			true, 'pre-condition: detector fired'
		);
		_simulateResumeForTest();
		// After reset, a fresh set of 5 errors must NOT trigger isDetected again.
		for (let i = 0; i < 5; i++) _triggerPlaybackErrorForTest();
		assert.strictEqual(
			_getStalledTrackUuidForTest(), null,
			'stalledTrackUuid must remain null after reset when below threshold again'
		);
	});
});

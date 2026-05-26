/**
 * Shared thrash-detection primitives.
 *
 * Used by both the Service Worker (cache-eviction.js) and the client-side
 * player (web-player.js, audio-element-player.js).  Any change to the public
 * API here needs to be reflected in both callers and their tests.
 *
 * PUBLIC API
 * ──────────
 *   makeSlidingWindowDetector(opts) → { record(), reset() }
 *   notifyCacheDegraded(message)    → Promise<void>
 */

/**
 * Posts storage diagnostics to the console and notifies the page via
 * BroadcastChannel.  The broadcast contract: the string 'cache-thrash' is
 * posted on BroadcastChannel('lucos_status') when degraded-cache state is
 * detected.  Both SW and window contexts support BroadcastChannel and
 * navigator.storage.estimate().
 *
 * @param {string} message - Diagnostic string describing the event.
 */
export async function notifyCacheDegraded(message) {
	try {
		const estimate = await navigator.storage.estimate();
		console.warn(message, `Storage: quota=${estimate.quota}, usage=${estimate.usage}`);
	} catch (err) {
		console.warn(message, `(storage estimate unavailable: ${err.message})`);
	}
	const channel = new BroadcastChannel('lucos_status');
	channel.postMessage('cache-thrash');
	channel.close();
}

/**
 * Creates a sliding-window threshold detector that fires a cache-degraded
 * notification exactly once when `threshold` events occur within `windowMs`.
 *
 * @param {{ windowMs: number, threshold: number, label: string, unit: string }} opts
 * @returns {{ record: Function, reset: Function }}
 *   `record()` — call on each event occurrence.
 *   `reset()` — clears all state; exported for test isolation only.
 */
export function makeSlidingWindowDetector({ windowMs, threshold, label, unit }) {
	const times = [];
	let detected = false;

	function record() {
		const now = Date.now();
		times.push(now);
		const cutoff = now - windowMs;
		while (times.length > 0 && times[0] < cutoff) times.shift();
		if (!detected && times.length >= threshold) {
			detected = true;
			notifyCacheDegraded(
				`${label}: ${times.length} ${unit} in the last ${windowMs / 1000}s.`
			).catch(err => console.error(`${label} notification failed:`, err));
		}
	}

	function reset() {
		times.length = 0;
		detected = false;
	}

	return { record, reset };
}

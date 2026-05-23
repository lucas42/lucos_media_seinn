/**
 * Cache eviction for track caches.
 *
 * PUBLIC CONTRACT
 * ───────────────
 * This module exports exactly three symbols:
 *
 *   recordCacheHit(url)   — call on every cache read (updates access timestamp)
 *   recordCacheWrite(url) — call on every cache write (updates access timestamp
 *                           AND checks budget, evicting LRU entries if needed)
 *   _resetDetectionStateForTest() — test-only; do not call in production code
 *
 * Any PR that exports additional symbols or changes either function's signature
 * is an architectural change and needs separate review.
 *
 * The broadcast contract: the string 'cache-thrash' is posted on
 * BroadcastChannel('lucos_status') when degraded-cache state is detected.
 *
 * INTERNALS
 * ─────────
 * Maintains a lightweight timestamp store (in a dedicated cache entry) that
 * records { url -> lastAccessedAt } for every URL in tracks-v1.  After each
 * successful track write the total size of tracks-v1 is checked; if it
 * exceeds CACHE_BUDGET_BYTES the least-recently-used entry is removed
 * atomically from all three caches.
 */

import { TRACK_CACHE, TRACK_METADATA_CACHE, IMG_CACHE } from './cache-names.js';

// Cache used solely for persisting the LRU timestamp map across SW restarts.
const LRU_META_CACHE        = 'lru-metadata-v1';
const LRU_META_REQUEST      = new Request('LRU_TIMESTAMPS');

// ~750 MB expressed in bytes
const CACHE_BUDGET_BYTES    = 750 * 1024 * 1024;

// ─── Timestamp store ──────────────────────────────────────────────────────────

async function readTimestamps() {
	const lruCache = await caches.open(LRU_META_CACHE);
	const response = await lruCache.match(LRU_META_REQUEST);
	if (!response) return {};
	try {
		return await response.json();
	} catch {
		return {};
	}
}

async function writeTimestamps(timestamps) {
	const lruCache = await caches.open(LRU_META_CACHE);
	const response = new Response(JSON.stringify(timestamps));
	await lruCache.put(LRU_META_REQUEST, response);
}

// Mutex to serialise concurrent recordCacheHit() / recordCacheWrite() calls.
// preloadTracks uses forEach(async …) so multiple fetchTrack calls can finish
// at around the same time and each calls recordCacheWrite().  Without the
// lock, concurrent read-modify-write cycles race: two calls read the same
// snapshot, each adds its URL, and the second write overwrites the first,
// silently losing the earlier update.  Chaining onto a shared promise ensures
// only one update runs at a time.
let timestampLock = Promise.resolve();

/**
 * Records (or updates) the access timestamp for a given track URL.
 * Call this on every cache hit.
 *
 * Returns a promise that resolves once the update has been written.
 * Concurrent calls are serialised — no lost updates.
 */
export function recordCacheHit(trackUrl) {
	timestampLock = timestampLock
		.then(async () => {
			const timestamps = await readTimestamps();
			timestamps[trackUrl] = Date.now();
			await writeTimestamps(timestamps);
		})
		.catch(err => console.error('recordCacheHit failed:', err));
	return timestampLock;
}

// ─── Size helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the total byte size of all responses currently stored in a cache,
 * along with a per-URL size map for use during eviction.
 *
 * Note: the Cache Storage API does not expose sizes directly, so we must
 * read each response body via arrayBuffer() to measure it.  This is
 * memory-intensive for a large cache — but it's unavoidable.  To keep
 * the cost contained, _evictIfOverBudget() calls this once upfront and
 * then adjusts the total cumulatively rather than re-measuring after each
 * eviction.
 *
 * @returns {{ total: number, sizes: Map<string, number> }}
 */
async function getCacheSizeWithMap(cacheName) {
	const cache = await caches.open(cacheName);
	const requests = await cache.keys();
	let total = 0;
	const sizes = new Map();
	for (const request of requests) {
		const response = await cache.match(request);
		if (response) {
			const buffer = await response.arrayBuffer();
			sizes.set(request.url, buffer.byteLength);
			total += buffer.byteLength;
		}
	}
	return { total, sizes };
}

// ─── Thrash detection ─────────────────────────────────────────────────────────

// Thresholds for the two degradation detectors.
// Normal steady-state cadence is ~1 successful eviction per track play; 20 in
// 60 s is only reachable when the cache is perpetually over-budget.  Failed
// eviction passes are effectively zero in steady state, so the threshold is
// intentionally low — it exists only to absorb a single transient error.
const THRASH_WINDOW_MS           = 60 * 1000;  // sliding window for successful evictions
const THRASH_THRESHOLD           = 20;          // successful evictions within the window
const EVICTION_FAILURE_WINDOW_MS = 60 * 1000;  // sliding window for failed evictions
const EVICTION_FAILURE_THRESHOLD = 2;           // failures within the window

/**
 * Posts storage diagnostics to the console and notifies the page via
 * BroadcastChannel.  Shared by both the thrash detector (successful-eviction
 * path) and the failure detector (failed-eviction path) — the banner copy and
 * reload action are correct for either root cause.
 *
 * @param {string} message - Diagnostic string describing the event.
 */
async function notifyCacheDegraded(message) {
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
function makeSlidingWindowDetector({ windowMs, threshold, label, unit }) {
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

// Detector for runaway successful evictions (the 2026-05-19 thrash pattern).
const thrashDetector = makeSlidingWindowDetector({
	windowMs:  THRASH_WINDOW_MS,
	threshold: THRASH_THRESHOLD,
	label:     'Cache thrash detected',
	unit:      'evictions',
});

// Detector for failed eviction passes (the 2026-05-22 failure pattern).
const failureDetector = makeSlidingWindowDetector({
	windowMs:  EVICTION_FAILURE_WINDOW_MS,
	threshold: EVICTION_FAILURE_THRESHOLD,
	label:     'Cache eviction failure detected',
	unit:      'failures',
});

function recordEviction()        { thrashDetector.record(); }
function recordEvictionFailure() { failureDetector.record(); }

// ─── Eviction ─────────────────────────────────────────────────────────────────

// Mutex to serialise concurrent recordCacheWrite() calls on the eviction path.
// preloadTracks uses forEach(async …), so multiple fetchTrack calls can finish
// at around the same time and each calls recordCacheWrite().  Without the lock,
// each call independently reads the cache size, each independently decides
// eviction is needed, and the combined effect is over-eviction.  Chaining onto
// a shared promise ensures only one eviction pass runs at a time.
let evictionLock = Promise.resolve();

/**
 * Returns the image URL recorded in the track metadata cache for a given
 * track URL, or null if the metadata entry doesn't exist.
 */
async function getImageUrlForTrack(trackUrl) {
	const metaCache = await caches.open(TRACK_METADATA_CACHE);
	const keys = await metaCache.keys();
	for (const key of keys) {
		const response = await metaCache.match(key);
		if (!response) continue;
		try {
			const data = await response.json();
			if (data.url === trackUrl) {
				return data.metadata?.img ?? null;
			}
		} catch {
			// ignore malformed entries
		}
	}
	return null;
}

/**
 * Returns true if imageUrl is referenced by any track in the metadata cache
 * *other than* the one being evicted (evictedTrackUrl).
 */
async function imageUsedByOtherTracks(imageUrl, evictedTrackUrl) {
	const metaCache = await caches.open(TRACK_METADATA_CACHE);
	const keys = await metaCache.keys();
	for (const key of keys) {
		const response = await metaCache.match(key);
		if (!response) continue;
		try {
			const data = await response.json();
			if (data.url !== evictedTrackUrl && data.metadata?.img === imageUrl) {
				return true;
			}
		} catch {
			// ignore malformed entries
		}
	}
	return false;
}

/**
 * Removes a single track URL from all three caches (tracks-v1,
 * track-metadata-v1, images-v1) and from the LRU timestamp store.
 *
 * Image removal is conditional: the image is only deleted if no other cached
 * track references the same image URL, keeping the remaining offline
 * collection consistent.
 */
async function evictTrack(trackUrl, timestamps) {
	// 1. Remove from track audio cache
	const trackCache = await caches.open(TRACK_CACHE);
	await trackCache.delete(new Request(trackUrl));

	// 2. Find the image URL before we remove the metadata entry
	const imageUrl = await getImageUrlForTrack(trackUrl);

	// 3. Remove metadata entry (find by matching data.url)
	const metaCache = await caches.open(TRACK_METADATA_CACHE);
	const metaKeys = await metaCache.keys();
	for (const key of metaKeys) {
		const response = await metaCache.match(key);
		if (!response) continue;
		try {
			const data = await response.json();
			if (data.url === trackUrl) {
				await metaCache.delete(key);
				break;
			}
		} catch {
			// ignore malformed entries
		}
	}

	// 4. Remove image only if no other track references it
	if (imageUrl && !(await imageUsedByOtherTracks(imageUrl, trackUrl))) {
		const imgCache = await caches.open(IMG_CACHE);
		await imgCache.delete(new Request(imageUrl));
	}

	// 5. Remove from LRU timestamp store
	delete timestamps[trackUrl];
	await writeTimestamps(timestamps);

	console.log(`Cache eviction: removed ${trackUrl}`);
}

/**
 * Inner implementation of the eviction pass — called exclusively through
 * recordCacheWrite() which serialises concurrent calls via evictionLock.
 *
 * Checks whether the total size of tracks-v1 exceeds CACHE_BUDGET_BYTES.
 * If it does, removes LRU entries one at a time until we're back under budget.
 *
 * Cache size is measured once upfront (unavoidably via arrayBuffer() reads —
 * the Cache Storage API exposes no cheaper size API).  After each eviction the
 * running total is decremented by the evicted entry's known size rather than
 * re-reading the whole cache, keeping the memory cost bounded to a single pass.
 *
 * As a side effect, any orphaned timestamp entries (URLs that are in the store
 * but not present in tracks-v1) are pruned to prevent the store growing without
 * bound from failed or erroring track fetches.
 */
async function _evictIfOverBudget() {
	const evictionPassStart = Date.now();
	const { total, sizes } = await getCacheSizeWithMap(TRACK_CACHE);
	let totalSize = total;

	const timestamps = await readTimestamps();

	// Prune orphaned entries: remove timestamps for URLs that are no longer in
	// tracks-v1 (e.g. tracks that were fetched but failed to cache, or that were
	// evicted without the timestamp being cleaned up).
	let pruned = false;
	for (const url of Object.keys(timestamps)) {
		if (!sizes.has(url)) {
			delete timestamps[url];
			pruned = true;
		}
	}
	if (pruned) await writeTimestamps(timestamps);

	if (totalSize <= CACHE_BUDGET_BYTES) return;

	// Sort ascending by lastAccessedAt (oldest first = LRU candidates).
	// Only consider URLs that are actually present in the cache.
	const sorted = Object.entries(timestamps)
		.sort(([, a], [, b]) => a - b);

	for (const [url] of sorted) {
		if (totalSize <= CACHE_BUDGET_BYTES) break;
		const evictedSize = sizes.get(url) ?? 0;
		// Diagnostic: a timestamp newer than the start of this pass means the LRU
		// ordering may be stale (e.g. from a prior lost-update race).  Log so that
		// this is observable in CI / manual testing without a long-lived session.
		if (timestamps[url] > evictionPassStart) {
			console.warn(`Cache eviction: evicting ${url} with lastAccessedAt=${timestamps[url]} newer than pass start=${evictionPassStart} — possible LRU timestamp inconsistency`);
		}
		await evictTrack(url, timestamps);
		recordEviction();
		totalSize -= evictedSize;
	}
}

/**
 * Records (or updates) the access timestamp for a given track URL, then
 * checks whether the cache is over budget and evicts LRU entries if needed.
 * Call this on every successful cache write.
 *
 * Callers do not need to call recordCacheHit separately — it is called
 * internally.  Concurrent calls are serialised on both the timestamp and
 * eviction paths to prevent lost updates and over-eviction.
 */
export function recordCacheWrite(trackUrl) {
	const afterHit = recordCacheHit(trackUrl);   // returns updated timestampLock
	// Chain eviction onto the eviction lock AND onto the timestamp write for this
	// call, so _evictIfOverBudget() cannot start reading timestamps until after
	// the recordCacheHit write for this URL has landed.
	evictionLock = evictionLock
		.then(() => afterHit)                    // wait for timestamp write to complete
		.then(() => _evictIfOverBudget())
		.catch(err => {
			console.error('Cache eviction failed:', err);
			recordEvictionFailure();
		});
	return evictionLock;
}

/**
 * Resets all detection state.  Exported for test isolation only — do not call
 * in production code.  Module-level singleton state persists across tests in
 * the same ESM process; this function lets beforeEach() restore a clean slate.
 */
export function _resetDetectionStateForTest() {
	thrashDetector.reset();
	failureDetector.reset();
	evictionLock = Promise.resolve();
	timestampLock = Promise.resolve();
}

/**
 * LRU cache eviction for track caches.
 *
 * Maintains a lightweight timestamp store (in a dedicated cache entry) that
 * records { url -> lastAccessedAt } for every URL in tracks-v1.  After each
 * successful track write the total size of tracks-v1 is checked; if it
 * exceeds CACHE_BUDGET_BYTES the least-recently-used entry is removed
 * atomically from all three caches.
 */

const TRACK_CACHE           = 'tracks-v1';
const TRACK_METADATA_CACHE  = 'track-metadata-v1';
const IMG_CACHE             = 'images-v1';

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

// Mutex to serialise concurrent updateLRUTimestamp() calls.
// preloadTracks uses forEach(async …) so multiple fetchTrack calls can finish
// at around the same time and each calls updateLRUTimestamp().  Without the
// lock, concurrent read-modify-write cycles race: two calls read the same
// snapshot, each adds its URL, and the second write overwrites the first,
// silently losing the earlier update.  Chaining onto a shared promise ensures
// only one update runs at a time.
let timestampLock = Promise.resolve();

/**
 * Records (or updates) the access timestamp for a given track URL.
 * Call this on every cache write and every cache hit.
 *
 * Returns a promise that resolves once the update has been written.
 * Concurrent calls are serialised — no lost updates.
 */
export function updateLRUTimestamp(trackUrl) {
	timestampLock = timestampLock
		.then(async () => {
			const timestamps = await readTimestamps();
			timestamps[trackUrl] = Date.now();
			await writeTimestamps(timestamps);
		})
		.catch(err => console.error('updateLRUTimestamp failed:', err));
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
 * the cost contained, evictIfOverBudget() calls this once upfront and
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

// ─── Thrash detection: successful evictions ───────────────────────────────────

// If more than THRASH_THRESHOLD individual track evictions happen within
// THRASH_WINDOW_MS, the cache is considered to be thrashing.  Normal steady-
// state cadence is ~1 eviction per track play; 20 in 60 s is only reachable
// when the cache is perpetually over-budget and fills up between plays.
const THRASH_WINDOW_MS = 60 * 1000;  // sliding window width
const THRASH_THRESHOLD = 20;          // individual evictions within the window

const recentEvictionTimes = [];
let thrashDetected = false; // reset only on SW restart; prevents repeated alerts

/**
 * Records a single track eviction and checks whether the thrash threshold
 * has been crossed.  If so, fires onThrashDetected() exactly once.
 */
function recordEviction() {
	const now = Date.now();
	recentEvictionTimes.push(now);
	const cutoff = now - THRASH_WINDOW_MS;
	while (recentEvictionTimes.length > 0 && recentEvictionTimes[0] < cutoff) {
		recentEvictionTimes.shift();
	}
	if (!thrashDetected && recentEvictionTimes.length >= THRASH_THRESHOLD) {
		thrashDetected = true;
		onThrashDetected().catch(err => console.error('onThrashDetected failed:', err));
	}
}

/**
 * Called once when the thrash threshold is crossed.
 * Logs storage diagnostics and notifies the page via BroadcastChannel.
 */
async function onThrashDetected() {
	try {
		const estimate = await navigator.storage.estimate();
		console.warn(
			`Cache thrash detected: ${recentEvictionTimes.length} evictions in the last ${THRASH_WINDOW_MS / 1000}s.`,
			`Storage: quota=${estimate.quota}, usage=${estimate.usage}`
		);
	} catch (err) {
		console.warn(
			`Cache thrash detected: ${recentEvictionTimes.length} evictions in the last ${THRASH_WINDOW_MS / 1000}s.`,
			`(storage estimate unavailable: ${err.message})`
		);
	}
	const channel = new BroadcastChannel('lucos_status');
	channel.postMessage('cache-thrash');
	channel.close();
}

// ─── Thrash detection: failed evictions ───────────────────────────────────────

// If more than EVICTION_FAILURE_THRESHOLD eviction operations fail within
// EVICTION_FAILURE_WINDOW_MS, the cache is considered to be in a degraded
// failure state.  Steady-state failure rate is effectively zero, so the
// threshold is intentionally low — it exists only to absorb a single
// transient network error, not to normalise sustained failure.
const EVICTION_FAILURE_WINDOW_MS = 60 * 1000;  // sliding window width
const EVICTION_FAILURE_THRESHOLD = 2;           // failures within the window

const recentEvictionFailureTimes = [];
let evictionFailureDetected = false; // reset only on SW restart; prevents repeated alerts

/**
 * Records a single eviction-pass failure and checks whether the failure
 * threshold has been crossed.  If so, fires onEvictionFailureDetected() exactly
 * once.  Called from the evictionLock .catch handler so that failed eviction
 * passes are counted symmetrically alongside successful ones.
 */
function recordEvictionFailure() {
	const now = Date.now();
	recentEvictionFailureTimes.push(now);
	const cutoff = now - EVICTION_FAILURE_WINDOW_MS;
	while (recentEvictionFailureTimes.length > 0 && recentEvictionFailureTimes[0] < cutoff) {
		recentEvictionFailureTimes.shift();
	}
	if (!evictionFailureDetected && recentEvictionFailureTimes.length >= EVICTION_FAILURE_THRESHOLD) {
		evictionFailureDetected = true;
		onEvictionFailureDetected().catch(err => console.error('onEvictionFailureDetected failed:', err));
	}
}

/**
 * Called once when the eviction-failure threshold is crossed.
 * Logs diagnostics and notifies the page via the same BroadcastChannel
 * message as the thrash detector — the banner copy and reload action are
 * correct for both failure modes.
 */
async function onEvictionFailureDetected() {
	try {
		const estimate = await navigator.storage.estimate();
		console.warn(
			`Cache eviction failure detected: ${recentEvictionFailureTimes.length} failures in the last ${EVICTION_FAILURE_WINDOW_MS / 1000}s.`,
			`Storage: quota=${estimate.quota}, usage=${estimate.usage}`
		);
	} catch (err) {
		console.warn(
			`Cache eviction failure detected: ${recentEvictionFailureTimes.length} failures in the last ${EVICTION_FAILURE_WINDOW_MS / 1000}s.`,
			`(storage estimate unavailable: ${err.message})`
		);
	}
	const channel = new BroadcastChannel('lucos_status');
	channel.postMessage('cache-thrash');
	channel.close();
}

// ─── Eviction ─────────────────────────────────────────────────────────────────

// Mutex to serialise concurrent evictIfOverBudget() calls.
// preloadTracks uses forEach(async …), so multiple fetchTrack calls can finish
// at around the same time and each call evictIfOverBudget().  Without the lock,
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
 * Inner implementation of evictIfOverBudget — called exclusively through the
 * exported wrapper which serialises concurrent calls via evictionLock.
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
 * Serialised wrapper around _evictIfOverBudget.
 *
 * preloadTracks fires multiple concurrent fetchTrack calls via forEach(async …).
 * Without serialisation, each call could independently measure the cache as
 * over-budget and evict a track, causing more evictions than necessary.  This
 * wrapper chains each call onto a shared promise so only one eviction pass runs
 * at a time.
 *
 * This is called after every successful track write.
 */
export function evictIfOverBudget() {
	evictionLock = evictionLock
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
	recentEvictionTimes.length = 0;
	thrashDetected = false;
	recentEvictionFailureTimes.length = 0;
	evictionFailureDetected = false;
	evictionLock = Promise.resolve();
}

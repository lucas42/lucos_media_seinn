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

/**
 * Records (or updates) the access timestamp for a given track URL.
 * Call this on every cache write and every cache hit.
 */
export async function updateLRUTimestamp(trackUrl) {
	const timestamps = await readTimestamps();
	timestamps[trackUrl] = Date.now();
	await writeTimestamps(timestamps);
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
		await evictTrack(url, timestamps);
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
	evictionLock = evictionLock.then(() => _evictIfOverBudget());
	return evictionLock;
}

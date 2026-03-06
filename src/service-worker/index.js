import '../utils/init-variables.js';
import {refresh} from './static-resources.js';
import { queueAndAttemptRequest } from 'restful-queue';
import { getPoll, modifyPollData } from './polling.js';
import './preload.js';
import localDevice from '../utils/local-device.js';
import './update.js';
import { updateLRUTimestamp } from './cache-eviction.js';

self.addEventListener('install', event => {
	event.waitUntil(refresh());
});

async function handleRequest(request) {
	const url = new URL(request.url);
	const params = new URLSearchParams(url.search);
	if (params.has("device")) localDevice.setUuid(params.get("device"));
	if (["POST", "PUT", "DELETE"].includes(request.method)) {
		await modifyPollData(request.clone());

		// Offline requests shouldn't be sent to the server, so return a response now.
		if (url.pathname.startsWith("/offline/")) {
			return new Response(new Blob(), {status: 201, statusText: "Actioned"});
		}
		return queueAndAttemptRequest(request);
	}
	if (url.pathname === "/_info") {
		return await fetch(request);
	}
	if (url.hostname === "am.l42.eu") {
		// am.l42.eu serves time-sensitive endpoints (e.g. /now for clock sync).
		// Always go straight to the network — never serve from cache, as cached
		// responses would be stale and give wrong results.
		// Note: am.l42.eu does NOT serve audio tracks; track caching is handled
		// separately by preload.js using the track URLs from the poll response.
		return await fetch(request);
	}
	if (url.pathname === "/v3/poll") {
		const hashcode = parseInt(params.get("hashcode"));
		return await getPoll(hashcode);
	}
	const cachedResponse = await caches.match(request);
	if (cachedResponse) {
		// Update the LRU timestamp whenever a track is served from cache, so
		// that frequently accessed tracks stay warm and are less likely to be
		// evicted from tracks-v1 by the eviction logic in cache-eviction.js.
		updateLRUTimestamp(request.url).catch(() => {}); // fire-and-forget; don't block response
		return cachedResponse;
	}
	console.warn("Request not in cache", url.pathname, url.method, url.origin, url.search);
	return await fetch(request);
}

self.addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});

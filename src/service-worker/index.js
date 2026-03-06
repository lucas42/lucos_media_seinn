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
		// Audio tracks are played via new Audio(url), which triggers a fetch event here.
		// Strategy: try the network first (to get the freshest stream), then fall back to
		// the tracks-v1 cache for offline playback.  Either way, update the LRU timestamp
		// so frequently played tracks stay warm and are less likely to be evicted.
		updateLRUTimestamp(request.url).catch(() => {}); // fire-and-forget; don't block playback
		try {
			return await fetch(request);
		} catch {
			// Network unavailable — serve from cache if we have it
			const cached = await caches.match(request);
			if (cached) return cached;
			throw new Error(`Track not available offline: ${request.url}`);
		}
	}
	if (url.pathname === "/v3/poll") {
		const hashcode = parseInt(params.get("hashcode"));
		return await getPoll(hashcode);
	}
	const cachedResponse = await caches.match(request);
	if (cachedResponse) return cachedResponse;
	console.warn("Request not in cache", url.pathname, url.method, url.origin, url.search);
	return await fetch(request);
}

self.addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});

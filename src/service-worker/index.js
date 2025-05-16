import './init-manager.js'; // Initiate the manager first so other modules can use it immediately
import {refresh} from './static-resources.js';
import { queueAndAttemptRequest } from 'restful-queue';
import { getPoll, modifyPollData } from './polling.js';
import './preload.js';
import localDevice from '../classes/local-device.js';
import './update.js';

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
		return await fetch(request);
	}
	if (url.pathname === "/v3/poll") {
		const hashcode = parseInt(params.get("hashcode"));
		return await getPoll(hashcode);
	}
	const cachedResponse = await caches.match(request);
	if (cachedResponse) return cachedResponse;
	console.error("Request not in cache", url.pathname, url.method, url.origin, url.search);
	return await fetch(request);
}

self.addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});

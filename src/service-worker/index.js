import {init as managerInit} from '../classes/manager.js'
managerInit("https://ceol.l42.eu/"); // TODO: get this host from environment variable somehow
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
		modifyPollData(request.clone());
		return queueAndAttemptRequest(request);
	}
	if (url.pathname === "/_info") {
		return await fetch(request);
	}
	if (url.hostname === "am.l42.eu") {
		return await fetch(request);
	}
	if (url.pathname === "/poll/summary") {
		const hashcode = parseInt(params.get("hashcode"));
		return getPoll(hashcode);
	}
	const cachedResponse = await caches.match(request);
	if (cachedResponse) return cachedResponse;
	console.error("Request not in cache", url.pathname, url.method, url.origin, url.search);
	return await fetch(request);
}

self.addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});

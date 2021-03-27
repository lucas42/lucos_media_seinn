require("../manager").init("https://ceol.l42.eu/"); // TODO: get this host from environment variable somehow
const staticResources = require("./static-resources");
const actions = require("./actions");
const { getPoll, modifyPollData } = require("./polling");
require("./preload");
const localDevice = require("../local-device");

self.addEventListener('install', event => {
	event.waitUntil(staticResources.refresh());
});

async function handleRequest(request) {
	const url = new URL(request.url);
	const params = new URLSearchParams(url.search);
	if (params.has("device")) localDevice.setUuid(params.get("device"));
	if (request.method === "POST") {
		modifyPollData(request);
		await actions.add(request);
		return new Response(new Blob(), {status: 202, statusText: "Accepted by Service Worker"});
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


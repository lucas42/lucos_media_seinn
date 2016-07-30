const RESOURCE_CACHE = 'resources-v1';
var urlsToCache = [
	'/',
	'/player.css',
	'/player.js'
];
const TRACK_CACHE = 'tracks-v1';

self.addEventListener('install', function(event) {
	event.waitUntil(
		caches.open(RESOURCE_CACHE).then(function(cache) {
			return cache.addAll(urlsToCache);
		})
	);
});

self.addEventListener('fetch', function(event) {
	event.respondWith(
		caches.match(event.request).then(function(response) {
			if (response) {
				return response;
			}

			return fetch(event.request).then(function (response) {

				// For poll requests, inspect a clone of the response
				if (event.request.url.startsWith("https://ceol.l42.eu/poll")) {
					response.clone().json().then(function (polldata) {
						caches.open(TRACK_CACHE).then(function(cache) {

							// Cache the next track, so it's there when we need it
							if (polldata.next) {
								var nextRequest = new Request(polldata.next.url.replace("ceol srl", "import/black/ceol srl"));
								fetch(nextRequest).then(function (nextResponse) {
									if (nextResponse.status == 200) {
										cache.put(nextRequest, nextResponse);
									} else {
										throw "non-200 response";
									}
								}).catch(function (error) {
									fetch("https://ceol.l42.eu/done?track="+encodeURIComponent(polldata.next.url)+"&status=serviceWorkerFailedLookup", {
										method: "POST",
									})
								});
							}
						})
					});
				}
				return response;
			});
		})
	);
});
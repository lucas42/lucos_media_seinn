const RESOURCE_CACHE = 'resources-v1';
var urlsToCache = [
	'/',
	'/player.css',
	'/player.js'
];
const TRACK_CACHE = 'tracks-v1';
const IMG_CACHE = 'images-v1';

self.addEventListener('install', function swInstalled(event) {
	event.waitUntil(
		caches.open(RESOURCE_CACHE).then(function addUrlsToCache(cache) {
			return cache.addAll(urlsToCache);
		})
	);
});

self.addEventListener('fetch', function respondToFetch(event) {
	event.respondWith(
		caches.match(event.request).then(function serveFromCache(response) {
			if (response) {
				return response;
			}

			return fetch(event.request).then(function inspectResponse(response) {

				// For poll requests, inspect a clone of the response
				if (event.request.url.startsWith("https://ceol.l42.eu/poll")) {
					response.clone().json().then(function preLoadTracks(polldata) {
						preLoadTrack(polldata.now);
						preLoadTrack(polldata.next);
					});
				}
				return response;
			});
		})
	);
});

self.addEventListener('sync', function backgroundSync(event) {
	if (event.tag.startsWith("https://")) {
		event.waitUntil(fetch(event.tag, {method: 'POST'}));
	}
});

// Load resources for tracks into caches so they're quick to load
function preLoadTrack(trackData) {
	if (!trackData) return;

	// Attempt to load the track itself into the track cache
	caches.open(TRACK_CACHE).then(function fetchTrack(cache) {
		var trackRequest = new Request(trackData.url.replace("ceol srl", "import/black/ceol srl"));
		fetch(trackRequest).then(function cacheTrack(trackResponse) {
			if (trackResponse.status == 200) {
				cache.put(trackRequest, trackResponse);
			} else {
				throw "non-200 response";
			}

		// If the track wasn't reachable, tell the server, which should skip that one out
		}).catch(function trackError(error) {
			fetch("https://ceol.l42.eu/done?track="+encodeURIComponent(trackData.url)+"&status=serviceWorkerFailedLookup", {
				method: "POST",
			})
		});
	});

	// Add the track's image into the image cache.
	caches.open(IMG_CACHE).then(function fetchImage(cache) {
		var imgRequest = new Request(trackData.metadata.img, {mode: 'no-cors'});
		fetch(imgRequest).then(function cacheImage(imgResponse) {
			cache.put(imgRequest, imgResponse);
		}).catch(function imageError(error) {
			console.error("can't preload image", error);
		});
	});
}
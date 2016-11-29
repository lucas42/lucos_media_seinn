const RESOURCE_CACHE = 'resources-v1';
var urlsToCache = [
	'/',
	'/player.css',
	'/player.js'
];
const TRACK_CACHE = 'tracks-v1';
const IMG_CACHE = 'images-v1';
const POLL_CACHE = 'polls-v1';
var waitingPolls = {};

// To prevent the same thing being downloaded multiple times
var fetchingTracks = {};
var fetchingImages = {};
var erroringTracks = {};
var registration = self.registration;

self.addEventListener('install', function swInstalled(event) {
	event.waitUntil(refreshResources());
});

self.addEventListener('fetch', function respondToFetch(event) {
	var url = new URL(event.request.url);
	if (event.request.method == "GET") {

		// HACK: chrome doesn't support ignoreSearch yet http://crbug.com/520784
		var fakeurl = new URL(event.request.url);
		fakeurl.search = '';
		var fakerequest = new Request(fakeurl.href);
		var responsePromise = caches.match(fakerequest).then(function serveFromCache(response) {
			if (response) {
				if (event.request.url.startsWith("https://ceol.l42.eu/poll")) {
					return response.clone().json().then(function pollFromCache (data) {
						var pollResponse = new Promise(function pollPromiser (resolve) {
							if (data.hashcode != url.searchParams.get("hashcode")) {
								resolve(response);
							} else {
								if (!waitingPolls[url.pathname]) waitingPolls[url.pathname] = [];
								waitingPolls[url.pathname].push(resolve);
							}
						});
						if (url.pathname == "/poll/summary") {
							pollResponse = pollResponse.then(function summaryJSON(response){
								return response.clone().json();
							}).then(function (data) {
								if (data.tracks) data.tracks.forEach(function (track) {
									var trackUrl = new URL(track.url.replace("ceol srl", "import/black/ceol srl"));
									if (tracksCached.isCached(trackUrl.href)) track.cached = true;
									if (trackUrl.href in fetchingTracks) track.caching = true;
									if (trackUrl.href in erroringTracks) track.erroring = true;
								});
								return new Response(new Blob([JSON.stringify(data)]));
							});
						}
						return pollResponse;
					});
				}
				return response;
			}
			return fetch(event.request);
		});

		event.respondWith(responsePromise);

		// As well as getting the main page from the cache, check the network for updates
		if (url.pathname == "/") refreshResources();
	} else if (event.request.method == "POST") {
		var postPromise = new Promise(function (resolve) {resolve()});
		if (url.pathname == "/done") {
			try {
				postPromise = trackDone(url.searchParams.get("track"));
			} catch (error) {
				console.error('Track not marked as done', error);
			}
		}
		var responsePromise = postPromise.then(function () {
			return registration.sync.register(event.request.url);
		}).then(function (){
			return new Response(new Blob(), {status: 202, statusText: "Accepted by Service Worker"});
		});
		event.respondWith(responsePromise);
	}
});

self.addEventListener('sync', function backgroundSync(event) {
	if (event.tag.startsWith("https://")) {
		event.waitUntil(fetch(event.tag, {method: 'POST'}));
	}
});

// Load resources for tracks into caches so they're quick to load
function preLoadTrack(trackData) {
	if (!trackData || !trackData.url) return;

	// Attempt to load the track itself into the track cache
	caches.open(TRACK_CACHE).then(function preFetchTrack(cache) {
		var trackRequest = new Request(trackData.url.replace("ceol srl", "import/black/ceol srl"));
		cache.match(trackRequest).then(function (fromCache) {
			if (fromCache || trackRequest.url in fetchingTracks) return;
			fetchingTracks[trackRequest.url] = fetch(trackRequest).then(function cacheTrack(trackResponse) {
				if (trackResponse.status == 200) {
					return cache.put(trackRequest, trackResponse).catch(function (error) {
						console.error("Failed to cache track:", error.message);
					}).then(function () {
						delete fetchingTracks[trackRequest.url];
						tracksCached.refresh();
					});
				} else {
					throw "non-200 response";
				}

			// If the track wasn't reachable, tell the server, which should skip that one out
			}).catch(function trackError(error) {
				delete fetchingTracks[trackRequest.url];
				trackDone(trackRequest.url);
				registration.sync.register("https://ceol.l42.eu/done?track="+encodeURIComponent(trackData.url)+"&status=serviceWorkerFailedLookup");
				erroringTracks[trackRequest.url] = error;
				tracksCached.refresh();
			});
			tracksCached.refresh();
		});
	});

	// Add the track's image into the image cache.
	caches.open(IMG_CACHE).then(function preFetchImage(cache) {
		var imgRequest = new Request(trackData.metadata.img, {mode: 'no-cors'});
		cache.match(imgRequest).then(function (fromCache) {
			if (fromCache || imgRequest.url in fetchingImages) return;

			// Ideally just do cache.add(imgRequest), but that has poor error handling
			fetchingImages[imgRequest.url] = fetch(imgRequest).then(function (response) {
				cache.put(imgRequest, response).catch(function (error) {
					console.error("Failed to cache image:", error.message);
				}).then(function () {
					delete fetchingImages[imgRequest.url];
				});
			});
		})
	});
}

function poll(url, handleDataFunction, additionalParamFunction, cache) {
	if (!url) throw "no URL given to poll";
	if (handleDataFunction && typeof handleDataFunction != 'function') throw "handleDataFunction must be a function";
	if (additionalParamFunction && typeof additionalParamFunction != 'function') throw "additionalParamFunction must be a function";
	function actuallyPoll(hashcode) {
		var params = "?";
		params += "hashcode="+hashcode;
		params += "&_cb="+new Date().getTime();
		if (additionalParamFunction) params += additionalParamFunction();
		var response;
		fetch(url+params).then(function decodePoll(response) {
			return response.clone().json().then(function handlePoll(data) {

				// Create a request object which ignores all the params to cache against
				var baseurl = new URL(url);
				var request = new Request(baseurl);

				// If there's a hashcode, use the new one and evaluate new data.
				if (data.hashcode) {
					hashcode = data.hashcode;
					if (cache) cache.put(request, response.clone()).catch(function (error) {
						cache.delete(request).then(function () {
							console.error("Failed to cache poll.  Deleted stale copy from cache.", error.message);
						}).catch(function (error) {
							console.error("Can't replace or delete cached poll.  Data Stuck.", error.message);
						});
					});
					if (handleDataFunction) handleDataFunction(data);
					statusChanged(baseurl.pathname, response);
				}
				actuallyPoll(hashcode);
			});
		}).catch(function pollError(error){

			// Wait 5 second before trying again to prevent making things worse
			setTimeout(function pollRetry() {
				actuallyPoll(hashcode);
			}, 5000);
		});
	}
	actuallyPoll(null);
}

// Removes the done track from the cached summary poll
function trackDone(url) {
	var summaryData;
	var summaryRequest = new Request('https://ceol.l42.eu/poll/summary');
	return caches.match(summaryRequest).then(function decodeCachedSummary(response) {
		if (!response) throw "No summary in cache";
		return response.json();
	}).then(function handleCachedSummary(data) {

		// Keep all tracks which aren't the done one
		data.tracks = data.tracks.filter(function (track) {
			return (track.url != url);
		});
		summaryData = data;
		return caches.open(POLL_CACHE);
	}).then(function (cache) {
		var summaryResponse = new Response(new Blob([JSON.stringify(summaryData)]));
		return cache.put(summaryRequest, summaryResponse.clone()).catch(function (error) {
			cache.delete(summaryRequest).then(function () {
				console.error("Failed to cache changes.  Deleted poll from cache.", error.message);
			}).catch(function (error) {
				console.error("Can't alter or delete cached poll.  Data Stuck.", error.message);
			});
		}).then(function () {
			statusChanged('/poll/summary', summaryResponse.clone());
		});
	}).catch(function (error) {
		console.warn("Didn't update cached summary:", error);
	});
}

// Resolve any requests waiting for the new status response
function statusChanged(path, response) {
	var resolve;
	if (!waitingPolls[path]) return;
	while (resolve = waitingPolls[path].shift()) {
		resolve(response);
	}
}

function preloadAllTracks(data) {
	if (!data.tracks) return;
	data.tracks.forEach(function (track) {
		preLoadTrack(track);
	});
}
function refreshResources() {
	return caches.open(RESOURCE_CACHE).then(function addUrlsToCache(cache) {
		return cache.addAll(urlsToCache);
	}).catch(function (error) {
		console.error("Failed to cache resources:", error.message);
	});
}
function forceResolvePoll(url) {
	var url = new URL(url);
	var request = new Request(url);
	caches.match(request).then(function respond(response) {
		if (response) {
			statusChanged(url.pathname, response);
		} else {
			console.warn("No poll in cache, can't force resolve")
		}
	});
}

// Synchronously check which tracks are cached
var tracksCached = (function () {
	var tracks = {};
	var trackCache = caches.open(TRACK_CACHE);
	function isCached(trackURL) {
		return trackURL in tracks;
	}

	function refresh() {
		caches.open(TRACK_CACHE).then(function (cache) {
			cache.keys().then(function (requests) {
				requests.forEach(function (request) {
					if (isCached(request.url)) return;
					tracks[request.url] = true;
				});
				forceResolvePoll("https://ceol.l42.eu/poll/summary");
			});
		});
	}
	refresh();
	return {
		isCached: isCached,
		refresh: refresh,
	};
})();
caches.open(POLL_CACHE).catch(function (error) {
	console.error('Failed to open caches', error);
}).then(function (cache) {
	poll("https://ceol.l42.eu/poll/summary", preloadAllTracks, null, cache);
});

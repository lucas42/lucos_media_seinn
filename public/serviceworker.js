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
				if (event.request.url.startsWith(dataOrigin+"poll")) {
					return response.clone().json().then(function pollFromCache (data) {
						return new Promise(function pollPromiser (resolve) {
							if (data.hashcode != url.searchParams.get("hashcode")) {
								resolve(response);
							} else {
								if (!waitingPolls[url.pathname]) waitingPolls[url.pathname] = [];
								waitingPolls[url.pathname].push(resolve);
							}
						});
					});
				}
				return response;
			}
			return fetch(event.request);
		}).then(function postResponseHandler(response) {
			if (url.pathname == "/poll/summary") {
				return response.clone().json()
				.then(function (data) {
					if (data.tracks) data.tracks.forEach(function (track) {
						var trackUrl = new URL(track.url.replace("ceol srl", "import/black/ceol srl"));
						if (tracksCached.isCached(trackUrl.href)) track.cached = true;
						if (trackUrl.href in fetchingTracks) track.caching = true;
						if (trackUrl.href in erroringTracks) track.erroring = erroringTracks[trackUrl.href];
					});
					return new Response(new Blob([JSON.stringify(data)]));
				});
			}
			return response;
		});

		event.respondWith(responsePromise);

		// When the main page is requested, try updating the resources from the network asynchronously.
		if (url.pathname == "/") {
			responsePromise.then(refreshResources);
		}
	} else if (event.request.method == "POST") {
		var postPromise;
		switch (url.pathname) {
			case "/done":
				postPromise = modifySummary.trackDone(url.searchParams.get("track"));
				break;
			case "/play":
				postPromise = modifySummary.play();
				break;
			case "/pause":
				postPromise = modifySummary.pause();
				break;
			case "/update":
				postPromise = modifySummary.update(url.searchParams.get("update_url"),url.searchParams.get("update_time"));
				break;
			default:
				postPromise = new Promise(function (resolve) {resolve()});
		}
		var responsePromise = postPromise.catch(function (error) {
			console.warn("Cached summary not modified", error.message);
		}).then(function () {
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
						erroringTracks[trackRequest.url] = error.message;
					}).then(function () {
						delete fetchingTracks[trackRequest.url];
					});
				} else {
					throw "non-200 response";
				}

			// If the track wasn't reachable, tell the server, which should skip that one out
			}).catch(function trackError(error) {
				delete fetchingTracks[trackRequest.url];
				modifySummary.trackDone(trackRequest.url);
				registration.sync.register(dataOrigin+"done?track="+encodeURIComponent(trackData.url)+"&status=serviceWorkerFailedLookup");
				erroringTracks[trackRequest.url] = error.message;
			}).then(tracksCached.refresh);
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

var modifySummary = (function () {
	var summaryRequest = new Request(dataOrigin+'poll/summary');
	var cachePromise = caches.open(POLL_CACHE);

	// Get the summary response from the cache and JSON decode it
	function getCachedSummary() {
		return caches.match(summaryRequest).then(function decodeCachedSummary(response) {
			if (!response) throw "No summary in cache";
			return response.json();
		});
	}

	function putCachedSummary(newData) {
		var json = JSON.stringify(newData)
		var summaryResponse = new Response(new Blob([json]));
		return cachePromise.then(function (cache) {
			return cache.put(summaryRequest, summaryResponse.clone())
			.catch(function (error) {
				cache.delete(summaryRequest).then(function () {
					console.error("Failed to cache changes.  Deleted poll from cache.", error.message);
				}).catch(function (error) {
					console.error("Can't alter or delete cached poll.  Data Stuck.", error.message);
				});

			});
		}).catch(function (error) {
			console.error("Can't access poll cache", error.message);
		}).then(function () {
			statusChanged('/poll/summary', summaryResponse.clone());
		});
	}

	// Removes the done track from the cached summary poll
	function trackDone(url) {
		return getCachedSummary().then(function handleCachedSummary(data) {

			// Keep all tracks which aren't the done one
			data.tracks = data.tracks.filter(function (track) {
				return (track.url != url);
			});
			return putCachedSummary(data);
		});
	}

	function play() {
		return getCachedSummary().then(function handleCachedSummary(data) {
			data.isPlaying = true;
			return putCachedSummary(data);
		});
	}
	function pause() {
		return getCachedSummary().then(function handleCachedSummary(data) {
			data.isPlaying = false;
			return putCachedSummary(data);
		});
	}
	function update(url, time) {
		return getCachedSummary().then(function handleCachedSummary(data) {

			// Update the time for the track specified
			data.tracks.forEach(function (track) {
				if (track.url == url) {
					track.currentTime = time;
				}
			});
			return putCachedSummary(data);
		});
	}
	return {
		trackDone: trackDone,
		play: play,
		pause: pause,
		update: update,
	}
})();

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
	var tracks = {};
	data.tracks.forEach(function (track) {
		preLoadTrack(track);
		tracks[track.url] = true;
	});
	tracksCached.tidyCache(tracks);
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

	// Deletes all tracks from the cache whose URL isn't in the object upcomingtracks
	function tidyCache(upcomingtracks) {
		cacheIterate(function deleteTrack(trackurl, cache) {
			var equivtrackurl = trackurl.replace("import/black/", "").replace(/%20/g, ' ');
			if (!(equivtrackurl in upcomingtracks)) cache.delete(new Request(trackurl));
		}).then(refresh);
	}

	function cacheIterate(trackFunction) {
		return caches.open(TRACK_CACHE).then(function (cache) {
			return cache.keys().then(function (requests) {
				return requests.map(function (request) {
					return trackFunction(request.url, cache);
				});
			});
		});
	}

	function refresh() {
		var tracksNowInCache = {};
		cacheIterate(function setIsCached(trackurl) {
			tracksNowInCache[trackurl] = true;
		}).then(function resolve() {
			tracks = tracksNowInCache;
			forceResolvePoll(dataOrigin+"poll/summary");
		});
	}
	refresh();
	return {
		isCached: isCached,
		refresh: refresh,
		tidyCache: tidyCache,
	};
})();
caches.open(POLL_CACHE).catch(function (error) {
	console.error('Failed to open caches', error);
}).then(function (cache) {
	poll(dataOrigin+"poll/summary", preloadAllTracks, null, cache);
});

const RESOURCE_CACHE = 'resources-v1';
var urlsToCache = [
	'/',
	'/player.css',
	'/player.js'
];
const TRACK_CACHE = 'tracks-v1';
const IMG_CACHE = 'images-v1';
const POLL_CACHE = 'polls-v1';
var waitingPolls = [];

// To prevent the same thing being downloaded multiple times
var fetchingTracks = {};
var fetchingImages = {};
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
						if (url.pathname == "/poll/playlist") {
							pollResponse = pollResponse.then(function playlistJSON(response){
								return response.clone().json();
							}).then(function (playlistData) {
								if (playlistData.playlist) playlistData.playlist.forEach(function (track) {
									var trackUrl = new URL(track.url.replace("ceol srl", "import/black/ceol srl"));
									if (tracksCached.isCached(trackUrl.href)) track.cached = true;
								});
								return new Response(new Blob([JSON.stringify(playlistData)]));
							});
						}
						pollResponse.then(function pollJSON(response) {
							return response.clone().json();
						}).then(function preloadPollData(polldata) {
							preLoadTrack(polldata.now);
							preLoadTrack(polldata.next);
						});
						return pollResponse;
					});
				}
				return response;
			}

			return fetch(event.request).then(function inspectResponse(response) {

				// For poll requests, inspect a clone of the response
				/*if (event.request.url.startsWith("https://ceol.l42.eu/poll")) {
					response.clone().json().then(function preLoadTracks(polldata) {
						preLoadTrack(polldata.now);
						preLoadTrack(polldata.next);
					});
				}*/
				return response;
			});
		});

		event.respondWith(responsePromise);

		// As well as getting the main page from the cache, check the network for updates
		if (url.pathname == "/") refreshResources();
	} else if (event.request.method == "POST") {
		var postPromise = new Promise(function (resolve) {resolve()});
		if (url.pathname == "/done") {
			postPromise = trackDone(url.searchParams.get("track"));
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
					return cache.put(trackRequest, trackResponse).then(function () {
						tracksCached.refresh();
						delete fetchingTracks[trackRequest.url];
					});
				} else {
					throw "non-200 response";
				}

			// If the track wasn't reachable, tell the server, which should skip that one out
			}).catch(function trackError(error) {
				delete fetchingTracks[trackRequest.url];

				// Skipping currently not supported by music manager for tracks other than now or next.
				registration.sync.register("https://ceol.l42.eu/done?track="+encodeURIComponent(trackData.url)+"&status=serviceWorkerFailedLookup");
				//trackDone(trackData.url);
			});
		});
	});

	// Add the track's image into the image cache.
	caches.open(IMG_CACHE).then(function preFetchImage(cache) {
		var imgRequest = new Request(trackData.metadata.img, {mode: 'no-cors'});
		cache.match(imgRequest).then(function (fromCache) {
			if (fromCache || imgRequest.url in fetchingImages) return;

			// Ideally just do cache.add(imgRequest), but that has poor error handling
			fetchingImages[imgRequest.url] = fetch(imgRequest).then(function (response) {
				cache.put(imgRequest, response).then(function () {
					delete fetchingImages[imgRequest.url];
				});
			});
		})
	}).catch(function () {console.error(arguments);});
}

function poll(url, handleDataFunction, additionalParamFunction) {
	if (!url) throw "no URL given to poll";
	if (handleDataFunction && typeof handleDataFunction != 'function') throw "handleDataFunction must be a function";
	if (additionalParamFunction && typeof additionalParamFunction != 'function') throw "additionalParamFunction must be a function";
	caches.open(POLL_CACHE).then(function fetchImage(cache) {
		function actuallyPoll(hashcode) {
			var params = "?";
			params += "hashcode="+hashcode;
			params += "&_cb="+new Date().getTime();
			if (additionalParamFunction) params += additionalParamFunction();
			var response;
			fetch(url+params).then(function decodePoll(response) {
				return response.clone().json().then(function handlePoll(data) {

					// Create a request object which ignores all the params to cache against
					var request = new Request(url);

					// If there's a hashcode, use the new one and evaluate new data.
					if (data.hashcode) {
						hashcode = data.hashcode;
						cache.put(request, response.clone());
						if (handleDataFunction) handleDataFunction(data);
						statusChanged(request.pathname, response);
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
	});
}
function trackDone(url) {
	var statusData, playlistData;
	var statusRequest = new Request('https://ceol.l42.eu/poll');
	var playlistRequest = new Request('https://ceol.l42.eu/poll/playlist');
	return caches.match(statusRequest).then(function decodeCachedStatus(response) {
		return response.json();
	}).then(function handleCachedStatus(data) {
		if (data.now.url == url) {
			data.now = data.next;
			delete data.next;
		}
		if (data.next && data.next.url == url) {
			delete data.next;
		}
		statusData = data;
		return caches.match(playlistRequest);
	}).then(function decodeCachedPlaylist(response) {
		return response.json();
	}).then(function handleCachedPlaylist(data) {
		data.playlist = data.playlist.filter(function (track) {
			if (track.url == url) return false;
			if (statusData.now && track.url == statusData.now.url) return false;
			return true;
		});

		// Fill missing status data from playlist
		if (!statusData.now && data.playlist.length) {
			statusData.now = data.playlist.shift();
		}
		if (!statusData.next && data.playlist.length) {
			statusData.next = data.playlist[0];
		}
		playlistData = data;
		return caches.open(POLL_CACHE);
	}).then(function (cache) {
		var statusResponse = new Response(new Blob([JSON.stringify(statusData)]));
		var playlistResponse = new Response(new Blob([JSON.stringify(playlistData)]));
		return Promise.all([
			cache.put(statusRequest, statusResponse.clone()),
			cache.put(playlistRequest, playlistResponse.clone())
		]).then(function () {
			statusChanged('/poll', statusResponse.clone());
			statusChanged('/poll/playlist', playlistResponse.clone());
			return "successful";
		});
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

function preloadNowNext(polldata) {
	preLoadTrack(polldata.now);
	preLoadTrack(polldata.next);
}

function preloadPlaylist(data) {
	if (!data.playlist) return;
	data.playlist.forEach(function (track) {
		preLoadTrack(track);
	});
}
function refreshResources() {
	return caches.open(RESOURCE_CACHE).then(function addUrlsToCache(cache) {
		return cache.addAll(urlsToCache);
	});
}

// Synchronously check which tracks are cached
var tracksCached = (function () {
	var tracks = {};
	var trackCache = caches.open(TRACK_CACHE);
	function isCached(trackURL) {
		return trackURL in tracks;
	}
	function add(trackURL) {
		//tracks.push(trackURL);
		//console.log(tracks);
		refresh();
	}

	// This doesn't seem to work :(
	function refresh() {
		caches.open(TRACK_CACHE).then(function (cache) {
			cache.keys().then(function (requests) {
				requests.forEach(function (request) {
					tracks[request.url] = true;
				})
			});
		});
	}
	refresh();
	return {
		isCached: isCached,
		refresh: refresh,
		add: add,
	};
})();

poll("https://ceol.l42.eu/poll/playlist", preloadPlaylist);
poll("https://ceol.l42.eu/poll", preloadNowNext);
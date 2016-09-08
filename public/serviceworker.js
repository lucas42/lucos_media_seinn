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

self.addEventListener('install', function swInstalled(event) {
	event.waitUntil(
		caches.open(RESOURCE_CACHE).then(function addUrlsToCache(cache) {
			return cache.addAll(urlsToCache);
		})
	);
});

self.addEventListener('fetch', function respondToFetch(event) {

	// HACK: chrome doesn't support ignoreSearch yet http://crbug.com/520784
	var fakeurl = new URL(event.request.url);
	fakeurl.search = '';
	var fakerequest = new Request(fakeurl.href);
	var url = new URL(event.request.url);
	var responsePromise = caches.match(fakerequest).then(function serveFromCache(response) {
		if (response) {
			if (event.request.url.startsWith("https://ceol.l42.eu/poll")) {
				return response.clone().json().then(function pollFromCache (data) {
					var pollResponse = new Promise(function pollPromiser (resolve) {
						if (data.hashcode != url.searchParams.get("hashcode")) {
							resolve(response);
						} else {
							waitingPolls.push(resolve);
						}
					});
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
});

self.addEventListener('sync', function backgroundSync(event) {
	if (event.tag.startsWith("https://")) {
		var url = new URL(event.tag);
		if (url.pathname == "/done") {
			event.waitUntil(
				trackDone(url.searchParams.get("track")).then(function () {
					return fetch(event.tag, {method: 'POST'});
				})
			);
		} else {

			event.waitUntil(fetch(event.tag, {method: 'POST'}));
		}
	}
});

// Load resources for tracks into caches so they're quick to load
function preLoadTrack(trackData) {
	if (!trackData || !trackData.url) return;

	// Attempt to load the track itself into the track cache
	caches.open(TRACK_CACHE).then(function preFetchTrack(cache) {
		var trackRequest = new Request(trackData.url.replace("ceol srl", "import/black/ceol srl"));

		cache.match(trackRequest).catch(function fetchTrack() {
			fetch(trackRequest).then(function cacheTrack(trackResponse) {
				if (trackResponse.status == 200) {
					cache.put(trackRequest, trackResponse);
				} else {
					throw "non-200 response";
				}

			// If the track wasn't reachable, tell the server, which should skip that one out
			}).catch(function trackError(error) {
				self.sync.register("https://ceol.l42.eu/done?track="+encodeURIComponent(trackData.url)+"&status=serviceWorkerFailedLookup");
			});
		});
	});

	// Add the track's image into the image cache.
	caches.open(IMG_CACHE).then(function preFetchImage(cache) {
		var imgRequest = new Request(trackData.metadata.img, {mode: 'no-cors'});
		cache.match(imgRequest).catch(function fetchImage() {
			fetch(imgRequest).then(function cacheImage(imgResponse) {
				cache.put(imgRequest, imgResponse);
			}).catch(function imageError(error) {
				console.error("can't preload image", error);
			});
		});
	});
}

function poll(url, sendResponseFunction, handleDataFunction, additionalParamFunction) {
	if (!url) throw "no URL given to poll";
	if (sendResponseFunction && typeof sendResponseFunction != "function") throw "sendResponseFunction must be a function";
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
						if (sendResponseFunction) sendResponseFunction(response);
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
			statusChanged(statusResponse.clone());
			return "successful";
		});
	});
}

// Resolve any requests waiting for the new status response
function statusChanged(response) {
	var resolve;
	while (resolve = waitingPolls.shift()) {
		resolve(response);
	}
}

function preloadNowNext(polldata) {
	console.log('preloadNowNext');
	preLoadTrack(polldata.now);
	preLoadTrack(polldata.next);
}

function preloadPlaylist(data) {
	console.log('preloadPlaylist');
	if (!data.playlist) return;
	data.playlist.forEach(function (track) {
		preLoadTrack(track);
	});
}

poll("https://ceol.l42.eu/poll/playlist", null, preloadPlaylist);
poll("https://ceol.l42.eu/poll", statusChanged, preloadNowNext);
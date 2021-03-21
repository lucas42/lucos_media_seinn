const pubsub = require("../pubsub");
const manager = require("../manager");
const TRACK_CACHE = 'tracks-v1';
const IMG_CACHE = 'images-v1';
const fetchingTracks = {};
const erroringTracks = {};
const fetchingImages = {};
function preloadTracks(tracks) {

	// TODO: consider prioritising now & next ahead of loading all tracks
	tracks.forEach(async track => {
		// Attempt to load the track itself into the track cache
		const trackCache = await caches.open(TRACK_CACHE);
		const trackRequest = new Request(track.url);
		const fromTrackCache = await trackCache.match(trackRequest);
		if (!fromTrackCache && !(trackRequest.url in fetchingTracks)) {
			fetchingTracks[trackRequest.url] = fetchTrack(trackCache, trackRequest);
			pubsub.send('trackStateChange', {url: trackRequest.url});
		}

		// Add the track's image into the image cache.
		const imageCache = await caches.open(IMG_CACHE);
		const imageRequest = new Request(track.metadata.img);
		const fromImageCache = await imageCache.match(imageRequest);
		if (!fromImageCache && !(imageRequest.url in fetchingImages)) {
			fetchingImages[imageRequest.url] = fetchImage(imageCache, imageRequest);
		}
	});
}

async function fetchTrack (trackCache, trackRequest) {
	try {
		const trackResponse = fetch(trackRequest);
		if (trackResponse.status !== 200) throw "non-200 response";
		try {
			await trackCache.put(trackRequest, trackResponse)
		} catch (error) {
			console.error("Failed to cache track:", error.message);
			erroringTracks[trackRequest.url] = error.message;
		}

	// If the track wasn't reachable, tell the server, which should skip that one out
	} catch (error) {
		manager.post("done", {track: trackRequest.url, status: error.message});
		erroringTracks[trackRequest.url] = error.message;
	}
	delete fetchingTracks[trackRequest.url];
	pubsub.send('trackStateChange', {url: trackRequest.url});
}
async function fetchImage (cache, request) {
	try {
		const response = fetch(request);
		if (response.status !== 200) throw "non-200 response";
		try {
			await cache.put(request, response);
		} catch (error) {
			console.error("Failed to cache image:", error.message);
		}

	// If the track wasn't reachable, tell the server, which should skip that one out
	} catch (error) {
		console.error("Failed to fetch image:", error.message);
	}
	delete fetchingImages[request.url];
}

pubsub.listenExisting("managerData", data => {
	preloadTracks(data.tracks);
});

function getTrackState(trackUrl) {
	if (trackUrl in fetchingTracks) return "fetching";
	if (trackUrl in erroringTracks) return "errored";
	return "unloaded";
}

module.exports = { getTrackState };
import { send, listenExisting } from 'lucos_pubsub';
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
			send('trackStateChange', {url: trackRequest.url});
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
		const trackResponse = await fetch(trackRequest);
		if (trackResponse.status !== 200) throw new Error("non-200 response");
		try {
			await trackCache.put(trackRequest, trackResponse)
		} catch (error) {
			console.error("Failed to cache track:", error.message);
			erroringTracks[trackRequest.url] = error.message;
		}

	// If the track wasn't reachable, tell the server, which should skip that one out
	} catch (error) {
		console.error("Failed to preload track:", error.message)
		// TODO: skip track in any playlist it's currently queued in
		erroringTracks[trackRequest.url] = error.message;
	}
	delete fetchingTracks[trackRequest.url];
	send('trackStateChange', {url: trackRequest.url});
}
async function fetchImage (cache, request) {
	try {
		const response = await fetch(request);
		if (response.status > 499) new Error("Error status code");
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

listenExisting("managerData", data => {
	preloadTracks(data.tracks);
});

export async function getTrackState(trackUrl) {
	if (trackUrl in fetchingTracks) return "fetching";
	if (trackUrl in erroringTracks) return "failed";
	const trackCache = await caches.open(TRACK_CACHE);
	const trackRequest = new Request(trackUrl);
	const fromTrackCache = await trackCache.match(trackRequest);
	if (fromTrackCache) return "downloaded";
	return "unloaded";
}
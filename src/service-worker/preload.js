import { send, listenExisting } from 'lucos_pubsub';
const TRACK_CACHE = 'tracks-v1';
const TRACK_METADATA_CACHE = 'track-metadata-v1';
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
		if (!fromTrackCache && !(track.url in fetchingTracks)) {
			fetchingTracks[track.url] = fetchTrack(track.url, trackCache, trackRequest);
		}
		send('trackStateChange', {url: track.url});

		// Add metadata about the track into the metadata cache
		if (track.metadata.trackid) {
			const metadataCache = await caches.open(TRACK_METADATA_CACHE);
			const metadataRequest = new Request('/offline/track-data/'+track.metadata.trackid);
			const metadataResponse = new Response(JSON.stringify({
				url:track.url,
				metadata: track.metadata,
			}));
			// Always update the cache, even if an entry exists, as the track metadata may have changed
			metadataCache.put(metadataRequest, metadataResponse);
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

async function fetchTrack (trackUrl, trackCache, trackRequest) {
	try {
		const trackResponse = await fetch(trackRequest);
		if (trackResponse.status !== 200) throw new Error("non-200 response");
		try {
			await trackCache.put(trackRequest, trackResponse)
		} catch (error) {
			console.error("Failed to cache track:", error.message);
			erroringTracks[trackUrl] = error.message;
		}

	// If the track wasn't reachable, tell the server, which should skip that one out
	} catch (error) {
		console.error("Failed to preload track:", error.message, trackRequest.url);
		// TODO: skip track in any playlist it's currently queued in
		erroringTracks[trackUrl] = error.message;
	}
	delete fetchingTracks[trackUrl];
	send('trackStateChange', {url: trackUrl});
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
listenExisting("offlineTracksAdded", data => {
	preloadTracks(data.tracks);
})

export async function getTrackState(trackUrl) {
	if (trackUrl in fetchingTracks) return "fetching";
	if (trackUrl in erroringTracks) return "failed";
	const trackCache = await caches.open(TRACK_CACHE);
	const trackRequest = new Request(trackUrl);
	const fromTrackCache = await trackCache.match(trackRequest);
	if (fromTrackCache) return "downloaded";
	return "unloaded";
}
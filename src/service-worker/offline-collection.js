/**
 * Logic for playing music which has already been cached on the device, regardless of server-driven playlist.
 */
import { v4 as uuidv4 } from 'uuid';
const TRACK_METADATA_CACHE = 'track-metadata-v1';
const TRACK_CACHE = 'tracks-v1';


/**
 * Returns an array tracks in the same format as `tracks` field in the /v3/poll endpoint.
 * All tracks returned should already be playable on the current device without any further network connectivity.
 */
export async function getOfflineCollection() {
	const metadataCache = await caches.open(TRACK_METADATA_CACHE);
	const trackCache = await caches.open(TRACK_CACHE);

	// For now, hackily use the trackCache as the metadata cache won't be populated on most devices
	// TODO: once metadata cache is established, read from it.  (Might want to double check against the track cache too though)
	const availableTracks = await trackCache.keys();

	const tracks = [];
	while(tracks.length < 10) {
		const randomKey = Math.floor(Math.random() * availableTracks.length);
		const request  = availableTracks[randomKey];
		const title = decodeURIComponent(request.url.split("/").pop().split(".").shift());

		// TODO: When switching to metadata cache, can use the `url` and `metadata` fields direct from there
		tracks.push({
			url: request.url,
			metadata: {
				title,
				img: "https://staticmedia.l42.eu/music-pic.png",
				thumb: "https://staticmedia.l42.eu/music-pic.png",
			},
			currentTime: 0,
			uuid: uuidv4(),
		})
	}
	return tracks;
}

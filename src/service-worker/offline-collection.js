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
	const availableTracks = await metadataCache.keys();
	const tracks = [];

	// TODO: check that the track also appears in trackCache
	while(tracks.length < 10) {
		const randomKey = Math.floor(Math.random() * availableTracks.length);
		const request  = await metadataCache.match(availableTracks[randomKey]);
		const trackData = await request.json();
		const title = decodeURIComponent(request.url.split("/").pop().split(".").shift());

		tracks.push({
			url: trackData.url,
			metadata: trackData.metadata,
			currentTime: 0,
			uuid: uuidv4(),
		})
	}
	return tracks;
}

export async function topupTracks(pollData) {
	if (pollData.tracks.length < 10) {
		console.log("Adding tracks to playlist from offline collection")
		const extraTracks = await getOfflineCollection();

		// There's definitely a more concise way to write this, but I'm on a plane so can't look it up
		extraTracks.forEach(track => {
			pollData.tracks.push(track);
		});
	}
}
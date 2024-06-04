import { listenExisting } from 'lucos_pubsub';
import { post } from '../classes/manager.js';

/**
 * Handles actions triggered outside the browser, for example buttons on a bluetooth headset
 */
try {
	if (!('mediaSession' in navigator)) throw "Browser doesn't support mediaSession";

	navigator.mediaSession.setActionHandler('play', () => {
		post("play");
	});
	navigator.mediaSession.setActionHandler('pause', () => {
		post("pause");
	});
	navigator.mediaSession.setActionHandler('stop', () => {
		post("stop");
	});
	navigator.mediaSession.setActionHandler('nexttrack', () => {
		post("next");
	});

	listenExisting("managerData", data => {
		const metadata = data.tracks[0]?.metadata || {};
		navigator.mediaSession.playbackState = data.isPlaying ? "playing" : "paused";
		const artwork = metadata.img ? [{ src: metadata.img }] : [];
		navigator.mediaSession.metadata = new MediaMetadata({
			title: metadata.title,
			artist: metadata.artist,
			album: metadata.album,
			artwork,
		});
	});
} catch (error) {
	console.error('mediaSession loading failed: ' + error);
}
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
		const now = data.tracks[0];
		if (!now) return console.error("No currently playing track", data);
		navigator.mediaSession.playbackState = data.isPlaying ? "playing" : "paused";
		navigator.mediaSession.metadata = new MediaMetadata({
			title: now.metadata.title,
			artist: now.metadata.artist,
			album: now.metadata.album,
			artwork: [
				{ src: now.metadata.img },
			]
		});
	});
} catch (error) {
	console.error('mediaSession loading failed: ' + error);
}
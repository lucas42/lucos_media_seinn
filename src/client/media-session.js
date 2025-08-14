import { listenExisting, send } from 'lucos_pubsub';
import { put } from '../utils/manager.js';

/**
 * Handles actions triggered outside the browser, for example buttons on a bluetooth headset
 */
try {
	if (!('mediaSession' in navigator)) throw "Browser doesn't support mediaSession";

	navigator.mediaSession.setActionHandler('play', () => {
		send('playpause_changing');
		put("v3/is-playing", "true");
	});
	navigator.mediaSession.setActionHandler('pause', () => {
		send('playpause_changing');
		put("v3/is-playing", "false");
	});
	navigator.mediaSession.setActionHandler('stop', () => {
		send('playpause_changing');
		put("v3/is-playing", "false");
	});
	navigator.mediaSession.setActionHandler('nexttrack', () => {
		document.getElementById("next").requestSubmit();
	});
	navigator.mediaSession.setPositionState({
		duration: Infinity, // Mask the duration because we're using a looped silent track to trick the mediaSession API into thinking there's music playing (as it doesn't see the actual AudioContext)
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
	listenExisting("playbackInit", data => {
		const { duration, position } = data;
		navigator.mediaSession.setPositionState({ duration, position});
	});
} catch (error) {
	console.error('mediaSession loading failed: ' + error);
}
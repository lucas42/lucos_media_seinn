const pubsub = require("./pubsub");
const manager = require("./manager");

/**
 * Handles actions triggered outside the browser, for example buttons on a bluetooth headset
 */
try {
	if (!('mediaSession' in navigator)) throw "Browser doesn't support mediaSession";

	navigator.mediaSession.setActionHandler('play', () => {
		manager.post("play");
	});
	navigator.mediaSession.setActionHandler('pause', () => {
		manager.post("pause");
	});
	navigator.mediaSession.setActionHandler('stop', () => {
		manager.post("stop");
	});
	navigator.mediaSession.setActionHandler('nexttrack', () => {
		manager.post("next");
	});

	pubsub.listenExisting("managerData", data => {
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
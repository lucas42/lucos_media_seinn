const pubsub = require("./pubsub");
const manager = require("./manager");
const localDevice = require("./local-device");

let currentAudio;

async function updateCurrentAudio(data) {
	const now = data.tracks[0];
	const shouldPlay = data.isPlaying && localDevice.isCurrent();
	if (shouldPlay) {
		if (!currentAudio) {
			await playTrack(now);
		} else if (currentAudio.getAttribute("src") !== now.url) {
			stopCurrentTrack(3); // Fade out the current track
			await playTrack(now);
		}
		currentAudio.volume = data.volume;
	} else {
		if (currentAudio) {
			stopCurrentTrack(0); // For pausing, do a sudden stop
		}
	}
}
async function playTrack(track) {
	currentAudio = new Audio(track.url);
	currentAudio.currentTime = track.currentTime;
	currentAudio.addEventListener("ended", trackEndedHandler);
	await currentAudio.play();
}

function stopCurrentTrack(fadeTime) {
	if (!currentAudio) throw "trying to stop track when nothing is playing";
	currentAudio.pause();
	currentAudio = null;

	// TODO: fade out track's volume if fadeTime is non-zero
	// TODO: tell server timestamp of current track, so can resume later
}

function trackEndedHandler(event) {
	const url = event.currentTarget.getAttribute("src");
	manager.post("done", {track: url, status: "ended"});
}


pubsub.listenExisting("managerData", updateCurrentAudio, true);


/**
 * Calculates how far into the current track playback is
 * Returns the number of seconds into the current track
 */
function getTimeElapsed() {
	if (!currentAudio || !('currentTime' in currentAudio)) return undefined;
	return currentAudio.currentTime;
}

/**
 * Returns the URL of the currently playing track
 */
function getCurrentTrack() {
	if (!currentAudio) return undefined;
	return currentAudio.getAttribute("src");
}

/**
 * Returns true if the player is current playing media
 */
function isPlaying() {
	return !!currentAudio;
}

module.exports = { getTimeElapsed, getCurrentTrack, isPlaying };

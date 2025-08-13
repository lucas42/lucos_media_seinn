import { listenExisting } from 'lucos_pubsub';
import { del } from '../utils/manager.js';
import localDevice from '../utils/local-device.js';

let currentAudio;

async function updateCurrentAudio(data) {
	const now = data.tracks[0];
	const shouldPlay = now && data.isPlaying && localDevice.isCurrent();
	if (shouldPlay) {
		if (!currentAudio) {
			await playTrack(now);
		} else if (currentAudio.dataset.uuid !== now.uuid) {
			stopCurrentTrack(3); // Fade out the current track
			await playTrack(now);
		}
		if (currentAudio) currentAudio.volume = data.volume;
	} else {
		if (currentAudio) {
			stopCurrentTrack(0); // For pausing, do a sudden stop
		}
	}
}
async function playTrack(track) {
	try {
		currentAudio = new Audio(track.url);
		currentAudio.currentTime = track.currentTime;
		currentAudio.addEventListener("ended", trackEndedHandler);
		currentAudio.dataset.uuid = track.uuid;
		await currentAudio.play();
	} catch (error) {
		if (error.name === "NotAllowedError") {
			currentAudio = null;
		} else {
			console.error("Skipping track", error.message);
			const playlist = 'null'; // For now, the playlist slug isn't used (but needs to be part of the url).  Set it to null until there's an easier way to derive it.
			await del(`v3/playlist/${playlist}/${track.uuid}?action=error`, error.message);
		}
	}
}

function stopCurrentTrack(fadeTime) {
	if (!currentAudio) throw "trying to stop track when nothing is playing";
	currentAudio.pause();
	currentAudio = null;

	// TODO: fade out track's volume if fadeTime is non-zero
	// TODO: tell server timestamp of current track, so can resume later
}

function trackEndedHandler(event) {
	const playlist = 'null'; // For now, the playlist slug isn't used (but needs to be part of the url).  Set it to null until there's an easier way to derive it.
	const uuid = event.currentTarget.dataset.uuid;
	del(`v3/playlist/${playlist}/${uuid}?action=complete`);
}



/**
 * Calculates how far into the current track playback is
 * Returns the number of seconds into the current track
 */
function getTimeElapsed() {
	if (!currentAudio || !('currentTime' in currentAudio)) return undefined;
	return currentAudio.currentTime;
}

/**
 * Returns the Uuid of the currently playing track
 */
function getCurrentUuid() {
	if (!currentAudio) return undefined;
	return currentAudio.dataset.uuid
}

/**
 * Returns true if the player is current playing media
 */
function isPlaying() {
	return !!currentAudio;
}

function init() {
	listenExisting("managerData", updateCurrentAudio, true);
}

export default { getTimeElapsed, getCurrentUuid, isPlaying, init };

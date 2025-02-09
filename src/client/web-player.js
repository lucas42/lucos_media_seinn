import { listenExisting } from 'lucos_pubsub';
import { getBuffer, preBufferTracks } from './buffers.js';
import { del } from '../classes/manager.js';
import localDevice from '../classes/local-device.js';


const audioContext = new AudioContext();
let globalGain = audioContext.createGain();
globalGain.connect(audioContext.destination);
let currentAudio;

async function updateCurrentAudio(data) {
	preBufferTracks(data.tracks, 2);  // Pre-buffer the first 2 tracks, so they'll play quicker later when needed

	updateVolume(data.volume);
	const now = data.tracks[0];
	const shouldPlay = now && data.isPlaying && localDevice.isCurrent();
	if (shouldPlay) {
		if (!currentAudio) {
			await playTrack(now);
		} else if (currentAudio.source.trackUuid !== now.uuid) {
			stopCurrentTrack(3); // Fade out the current track
			await playTrack(now);
		}
	} else {
		if (currentAudio) {
			stopCurrentTrack(0); // For pausing, do a sudden stop
		}
	}
}

function updateVolume(volume, fadeTime=0) {
	globalGain.gain.linearRampToValueAtTime(volume, audioContext.currentTime + fadeTime);
}
async function playTrack(track, volume) {
	if (currentAudio) throw "trying to play track while another is playing";
	try {
		const source = audioContext.createBufferSource();
		source.addEventListener("ended", trackEndedHandler);

		// Create a gain for this particular audio track, so it can be faded separately
		const gainNode = audioContext.createGain();
		gainNode.connect(globalGain);
		source.connect(gainNode);
		source.trackUrl = track.url;
		source.trackUuid = track.uuid;

		currentAudio = {
			source,
			gain: gainNode.gain,
			url: track.url,
		}

		source.buffer = await getBuffer(track.url);
		source.start(0, track.currentTime);
		currentAudio.startTime = audioContext.currentTime - track.currentTime;
	} catch (error) {
		console.error("Skipping track", error.message);
		const playlist = 'null'; // For now, the playlist slug isn't used (but needs to be part of the url).  Set it to null until there's an easier way to derive it.
		await del(`v3/playlist/${playlist}/${track.uuid}?action=error`, error.message);
	}
}

function stopCurrentTrack(fadeTime) {
	if (!currentAudio) throw "trying to stop track when nothing is playing";
	currentAudio.source.removeEventListener("ended", trackEndedHandler);

	// Fade out the current track
	currentAudio.gain.linearRampToValueAtTime(0, audioContext.currentTime + fadeTime);
	currentAudio = undefined;

	// TODO: tell server timestamp of current track, so can resume later
}

function trackEndedHandler(event) {
	const playlist = 'null'; // For now, the playlist slug isn't used (but needs to be part of the url).  Set it to null until there's an easier way to derive it.
	const uuid = event.currentTarget.uuid;
	del(`v3/playlist/${playlist}/${uuid}?action=complete`);
}




/**
 * Calculates how far into the current track playback is
 * Returns the number of seconds into the current track
 */
function getTimeElapsed() {
	if (!currentAudio || !('startTime' in currentAudio)) return undefined;
	return audioContext.currentTime - currentAudio.startTime;
}

/**
 * Returns the Uuid of the currently playing track
 */
function getCurrentUuid() {
	if (!currentAudio) return undefined;
	return currentAudio.uuid;
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

const pubsub = require("./pubsub");
const {getBuffer, preBufferTracks} = require("./buffers");

function player(mediaManager) {
	const audioContext = new AudioContext();
	let globalGain = audioContext.createGain();
	globalGain.connect(audioContext.destination);
	let currentAudio;

	async function updateCurrentAudio(data) {
		preBufferTracks(data.tracks, 2);  // Pre-buffer the first 2 tracks, so they'll play quicker later when needed

		updateVolume(data.volume);
		const now = data.tracks[0];
		if (data.isPlaying) {
			if (!currentAudio) {
				await playTrack(now);
			} else if (currentAudio.url !== now.url) {
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
		const source = audioContext.createBufferSource();
		source.addEventListener("ended", trackEndedHandler);

		// Create a gain for this particular audio track, so it can be faded separately
		const gainNode = audioContext.createGain();
		gainNode.connect(globalGain);
		source.connect(gainNode);
		source.trackUrl = track.url;

		currentAudio = {
			source,
			gain: gainNode.gain,
			url: track.url,
		}

		source.buffer = await getBuffer(track.url);
		source.start(0, track.currentTime);
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
		const url = event.currentTarget.trackUrl;
		fetch(mediaManager+"done?track="+encodeURIComponent(url)+"&status=ended", {method: 'POST'});
	}



	pubsub.listenExisting("managerData", updateCurrentAudio, true);
}

module.exports = player;
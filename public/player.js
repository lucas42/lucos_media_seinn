function player() {
	var audioContext = new AudioContext();
	var current = null;

	function poll(hashcode) {
		var pollTime = new Date().getTime();
		var params = "?";
		params += "hashcode="+hashcode;
		params += "&_cb="+pollTime;
		if (current && current.start) {
			var timeLapsed = audioContext.currentTime - current.start;
			params += "&update_url="+current.trackURL;
			params += "&update_time="+timeLapsed;
			params += "&update_timeset="+pollTime;
		}
		fetch("https://ceol.l42.eu/poll"+params).then(function (res) {
			return res.json();
		}).catch(function(error){
			console.error(error);

			// Wait 5 second before trying again to prevent making things worse
			setTimeout(function () {
				poll(hashcode);
			}, 5000);
		}).then(function (data) {

			// If there's a hashcode, use the new one and evaluate new data.
			if (data.hashcode) {
				poll(data.hashcode);
				evaluateData(data);

			// Otherwise, assume data hasn't changed
			} else {
				poll(hashcode);
			}
		})
	}

	function evaluateData(data) {
		var trackURL;
		if (data.now && data.now.url) {
			trackURL = data.now.url;
		} else {
			console.error(data);
			return;
		}

		// If the track is already playing, don't interrupt, just make any appropriate changes
		if (current && current.trackURL == trackURL && current.isPlaying == data.isPlaying) {
			if (current.gainNode) {
				current.gainNode.gain.linearRampToValueAtTime(data.volume, audioContext.currentTime + 0.5);
			}
			return;
		}
		stopExisting();
		current = {
			trackURL: trackURL,
			isPlaying: data.isPlaying,
		};

		// If nothing should be playing, then don't proceed.
		if (!data.isPlaying) {
			updateDisplay("Paused", "indigo");
			return;
		}

		updateDisplay("Fetching", "chocolate");
		fetch(trackURL.replace("ceol srl", "import/black/ceol srl")).then(function (rawtrack) {
			updateDisplay("Buffering", "chocolate");
			return rawtrack.arrayBuffer();
		}).then(function (arrayBuffer) {
			updateDisplay("Decoding", "chocolate");
			return audioContext.decodeAudioData(arrayBuffer);
		}).then(function (buffer) {
			if (trackURL != current.trackURL || current.source) {
				console.log("Another track load has overtaken this one, ignoring");
				return;
			}
			updateDisplay("Preparing", "chocolate");
			var source = audioContext.createBufferSource();
			source.trackURL = trackURL;
			source.addEventListener("ended", trackEndedHandler);
			source.buffer = buffer;

			var gainNode = audioContext.createGain();
			gainNode.gain.linearRampToValueAtTime(data.volume, audioContext.currentTime);
			source.connect(gainNode);
			gainNode.connect(audioContext.destination);
			source.start(0, data.now.currentTime);
			updateDisplay("Playing", "green");
			current.gainNode = gainNode;
			current.source = source;
			current.start = audioContext.currentTime - data.now.currentTime;
		}).catch(function (error) {
			updateDisplay("Failure", "red");
			console.error("Failed to play track", error);

			// Tell server couldn't play
			trackDone(trackURL, error.message);
		});
	}

	function trackDone(trackURL, status) {
		fetch("https://ceol.l42.eu/done?track="+encodeURIComponent(trackURL)+"&status="+encodeURIComponent(status), {
		    method: "POST"
		}).then(function (){
			updateDisplay("Skipping", "chocolate");
			console.log("Next track");
		}).catch(function (error) {
			updateDisplay("Track Skip failed", "red");
			console.error("Can't tell server to advance to next track", error);
		});
	}
	function trackEndedHandler(event) {
		updateDisplay("Track Ended", "chocolate");
		trackDone(event.target.trackURL, event.type);
	}
	function stopExisting() {
		if (!current) return;
		if (current.source) {
			current.source.removeEventListener("ended", trackEndedHandler);

			// Fade out the current track
			if (!current.gainNode) {
				console.error("no gainNode, can't fade out");
				return;
			}
			current.gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 3);
		}
		current = null;
	}

	function updateDisplay(message, colour) {
		var statusNode = document.getElementById('status')
		statusNode.firstChild.nodeValue = message;
		statusNode.style.backgroundColor = colour;
	}

	updateDisplay("Connecting", "chocolate");
	poll(null);
}
document.addEventListener("DOMContentLoaded", player);
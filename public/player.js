function player() {
	var audioContext = new AudioContext();
	var current = null;

	// Returns a string of get params to include in requests so that server knows the current state of play
	function getUpdateParams() {
		var params = "";
		if (current && current.start) {
			var timeLapsed = audioContext.currentTime - current.start;
			params += "&update_url="+current.trackURL;
			params += "&update_time="+timeLapsed;
			params += "&update_timeset="+new Date().getTime();
		}
		return params;
	}
	function poll(hashcode) {
		var params = "?";
		params += "hashcode="+hashcode;
		params += "&_cb="+new Date().getTime();
		params += getUpdateParams();
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

		// If paused, stop audio immediately, otherwise fade out over 3 seconds.
		var fadeTime = data.isPlaying ? 3 : 0;
		stopExisting(fadeTime);
		current = {
			trackURL: trackURL,
			isPlaying: data.isPlaying,
		};
		document.getElementById("cover").style.backgroundImage = 'url('+data.now.metadata.img+')';
		document.getElementById("nexttrack").firstChild.nodeValue = data.next.metadata.title;

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
			updateDisplay("Failure", "crimson");
			console.error("Failed to play track", error);

			// Tell server couldn't play
			trackDone(trackURL, error.message);
		});
	}

	function trackDone(trackURL, status) {
		delete current.source;
		fetch("https://ceol.l42.eu/done?track="+encodeURIComponent(trackURL)+"&status="+encodeURIComponent(status), {
		    method: "POST"
		}).then(function (){
			updateDisplay("Skipping", "chocolate");
			console.log("Next track");
		}).catch(function (error) {
			updateDisplay("Track Skip failed", "crimson");
			console.error("Can't tell server to advance to next track", error);
		});
	}
	function trackEndedHandler(event) {
		updateDisplay("Track Ended", "chocolate");
		trackDone(event.target.trackURL, event.type);
	}
	function stopExisting(fadeTime) {
		if (!current) return;
		if (current.source) {
			current.source.removeEventListener("ended", trackEndedHandler);

			// Fade out the current track
			if (!current.gainNode) {
				console.error("no gainNode, can't fade out");
				return;
			}
			current.gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + fadeTime);
		}
		document.getElementById("cover").style.backgroundImage = null;
		current = null;
	}

	function updateDisplay(message, colour) {
		var statusNode = document.getElementById('status')
		statusNode.firstChild.nodeValue = message;
		statusNode.style.backgroundColor = colour;
	}

	updateDisplay("Connecting", "chocolate");
	document.getElementById("next").addEventListener('click', function () {
		fetch("https://ceol.l42.eu/next?"+getUpdateParams(), {method: "POST"}).then(function() {
			updateDisplay("Skipping", "chocolate");
		}).catch(function (error) {
			// If it didn't work, don't do anything for now.
		});
	});
	document.getElementById("cover").addEventListener('click', function () {
		if (current.source) {
			fetch("https://ceol.l42.eu/pause?"+getUpdateParams(), {method: "POST"}).then(function() {
				updateDisplay("Pausing", "chocolate");
			}).catch(function (error) {
				updateDisplay("Connection failed", "crimson");
			});
		} else {
			fetch("https://ceol.l42.eu/play?"+getUpdateParams(), {method: "POST"}).then(function() {
				updateDisplay("Resuming", "chocolate");
			}).catch(function (error) {
				updateDisplay("Connection failed", "crimson");
			});
		}
	});

	// Make sure footer clicks don't propagate into rest of page.
	document.querySelector("footer").addEventListener('click', function (event) {
		event.stopPropagation();
	});
	poll(null);
}
document.addEventListener("DOMContentLoaded", player);
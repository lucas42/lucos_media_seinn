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
		fetch("https://ceol.l42.eu/poll"+params).then(function decodePoll(res) {
			return res.json();
		}).then(function handlePoll(data) {

			// If there's a hashcode, use the new one and evaluate new data.
			if (data.hashcode) {
				poll(data.hashcode);
				evaluateData(data);

			// Otherwise, assume data hasn't changed
			} else {
				poll(hashcode);
			}
		}).catch(function pollError(error){
			console.error(error);

			// Wait 5 second before trying again to prevent making things worse
			setTimeout(function pollRetry() {
				poll(hashcode);
			}, 5000);
		});
	}

	function evaluateData(data) {
		var trackURL;
		if (data.now && data.now.url) {
			trackURL = data.now.url;
		} else {
			console.error("No now data provided", data);
			return;
		}
		document.getElementById("cover").style.backgroundImage = 'url('+data.now.metadata.img+')';
		document.getElementById("next").dataset.buffered = false;
		document.getElementById("nowtitle").firstChild.nodeValue = data.now.metadata.title;
		document.getElementById("nowartist").firstChild.nodeValue = data.now.metadata.artist;

		// Preload next track in the background
		if (data.next && data.next.url) {
			document.getElementById("nexttrack").firstChild.nodeValue = data.next.metadata.title;
			getBuffer(data.next.url).then(function nextBuffered() {
				document.getElementById("next").dataset.buffered = true;
			});
		} else {
			document.getElementById("nexttrack").firstChild.nodeValue = 'Unknown';
		}

		// If the track is already playing, don't interrupt, just make any appropriate changes
		if (current && current.trackURL == trackURL && current.isPlaying == data.isPlaying) {
			if (current.gainNode) {
				current.gainNode.gain.linearRampToValueAtTime(data.volume, audioContext.currentTime + 0.5);
			}
			current.latestData = data;
			return;
		}

		// If paused, stop audio immediately, otherwise fade out over 3 seconds.
		var fadeTime = data.isPlaying ? 3 : 0;
		stopExisting(fadeTime);
		current = {
			trackURL: trackURL,
			isPlaying: data.isPlaying,
			latestData: data,
		};

		// Preload the current track (even if it's paused)
		var buffer = getBuffer(trackURL);

		// If nothing should be playing, then don't proceed.
		if (!data.isPlaying) {
			buffer.then(function trackPaused(buffer) {
				updateDisplay("Paused", "indigo", trackURL);
			});
			return;
		}

		buffer.then(function createSource(buffer) {
			if (trackURL != current.trackURL || current.source) {
				console.log("Another track load has overtaken this one, ignoring");
				return;
			}
			playBuffer(trackURL, buffer, data.volume, data.now.currentTime);
		}).catch(function trackFailure(error) {
			updateDisplay("Failure", "crimson", trackURL);
			console.error("Failed to play track", error);

			// Tell server couldn't play
			trackDone(trackURL, error.message);
		});
	}

	var buffers = {};
	function getBuffer(trackURL) {
		if (!(trackURL in buffers)) {
			updateDisplay("Fetching", "chocolate", trackURL);
			buffers[trackURL] = fetch(trackURL.replace("ceol srl", "import/black/ceol srl")).then(function bufferTrack(rawtrack) {
				updateDisplay("Buffering", "chocolate", trackURL);
				return rawtrack.arrayBuffer();
			}).then(function decodeTrack(arrayBuffer) {
				updateDisplay("Decoding", "chocolate", trackURL);
				return audioContext.decodeAudioData(arrayBuffer);
			});
		}
		return buffers[trackURL];
	}

	function playBuffer(trackURL, buffer, volume, startTime) {
		current.trackURL = trackURL;
		updateDisplay("Preparing", "chocolate", trackURL);
		var source = audioContext.createBufferSource();
		source.trackURL = trackURL;
		source.addEventListener("ended", trackEndedHandler);
		source.buffer = buffer;

		var gainNode = audioContext.createGain();
		gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime);
		source.connect(gainNode);
		gainNode.connect(audioContext.destination);
		source.start(0, startTime);
		updateDisplay("Playing", "green", trackURL);
		current.gainNode = gainNode;
		current.source = source;
		current.start = audioContext.currentTime - startTime;
		current.isPlaying = true;
		current.volume = volume;
	}

	function trackDone(trackURL, status) {
		delete current.source;
		playNext();
		fetch("https://ceol.l42.eu/done?track="+encodeURIComponent(trackURL)+"&status="+encodeURIComponent(status), {
		    method: "POST"
		}).catch(function skipError(error) {
			console.error("Can't tell server to advance to next track", error);
		});
	}
	function trackEndedHandler(event) {
		updateDisplay("Track Ended", "chocolate", event.target.trackURL);
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

		// Tell server where the track was, before getting rid of it.
		if (current.start) fetch("https://ceol.l42.eu/update?"+getUpdateParams(), {method: "POST"});
		current = null;
	}

	function updateDisplay(message, colour, trackURL) {

		// If the update is about a specific track, only display it if that track is the one playing.
		if (trackURL) {
			if (!current || trackURL != current.trackURL) return;
		}
		var statusNode = document.getElementById('status')
		statusNode.firstChild.nodeValue = message;
		statusNode.style.backgroundColor = colour;
	}

	/**
	 * Function to fake it till you make it
	 * ie use the data from the next object
	 * until we get an update from the server
	 */
	function playNext() {
		updateDisplay("Skipping", "chocolate");
		var data = current.latestData;

		// If we've already exhausted all the next data,
		// then there's not a lot we can do.
		if (!data.next) {
			stopExisting();
			return;
		}
		data.now = data.next;
		delete data.next;
		evaluateData(data);
	}

	updateDisplay("Connecting", "chocolate");
	document.getElementById("next").addEventListener('click', function skipTrack() {
		playNext();
		fetch("https://ceol.l42.eu/next?"+getUpdateParams(), {method: "POST"}).catch(function skipError(error) {
			console.error("Failed to tell server of next skip", error);
		});
	});
	document.getElementById("cover").addEventListener('click', function playpauseTrack() {
		if (current.source) {

			// Pause is easy, do it immediately and then tell server.
			updateDisplay("Pausing", "chocolate");
			stopExisting(0);
			fetch("https://ceol.l42.eu/pause?"+getUpdateParams(), {method: "POST"}).catch(function pauseError(error) {
				console.error("Failed to tell server of pause");
			});
		} else {

			// Play is slightly harder.  For now, tell server and wait for poll to return the update.
			fetch("https://ceol.l42.eu/play?"+getUpdateParams(), {method: "POST"}).then(function resumeTrack() {
				updateDisplay("Resuming", "chocolate");
			}).catch(function resumeError(error) {
				updateDisplay("Connection failed", "crimson");
			});
		}
	});

	// Make sure footer clicks don't propagate into rest of page.
	document.querySelector("footer").addEventListener('click', function stopFooterProp(event) {
		event.stopPropagation();
	});
	poll(null);
}
document.addEventListener("DOMContentLoaded", player);


if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/serviceworker.js').then(function swRegistered(registration) {
		console.log('ServiceWorker registration successful with scope: ' + registration.scope);
	}).catch(function swError(error) {
		console.error('ServiceWorker registration failed: ' + error);
	});
}
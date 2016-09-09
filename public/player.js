function player() {
	var audioContext = new AudioContext();
	var current = {};

	// Returns a string of get params to include in requests so that server knows the current state of play
	function getUpdateParams() {
		var params = "";
		if (current.start) {
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
		if (current.trackURL == trackURL && current.isPlaying == data.isPlaying) {
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
		if (!data.isPlaying) return;

		buffer.then(function createSource(buffer) {
			if (trackURL != current.trackURL || current.source) {

				//Another track load has overtaken this one so ignore this one
				return;
			}
			playBuffer(trackURL, buffer, data.volume, data.now.currentTime);
		});
	}

	var buffers = {};
	function getBuffer(trackURL) {
		if (!(trackURL in buffers)) {
			buffers[trackURL] = fetch(trackURL.replace("ceol srl", "import/black/ceol srl")).then(function bufferTrack(rawtrack) {
				buffers[trackURL].state = "buffering";
				updateDisplay();
				return rawtrack.arrayBuffer();
			}).then(function decodeTrack(arrayBuffer) {
				buffers[trackURL].state = "decoding";
				updateDisplay();
				return audioContext.decodeAudioData(arrayBuffer);
			}).then(function doneDecoding(buffer) {
				buffers[trackURL].state = "ready";
				updateDisplay();
				return buffer;
			}).catch(function trackFailure(error) {
				buffers[trackURL].state = "failed";
				updateDisplay();

				// Tell server couldn't play
				trackDone(trackURL, error.message);
			});
			buffers[trackURL].state = "fetching";
			updateDisplay();
		}
		return buffers[trackURL];
	}
	function getState(trackURL) {
		if (!trackURL) return "preparing";
		var bufferpromise = buffers[trackURL];
		if (!bufferpromise) return "unloaded";
		if (bufferpromise.state == "ready" && current.trackURL == trackURL) {
			return current.isPlaying ? "playing" : "paused";
		}
		return bufferpromise.state;
	}

	function playBuffer(trackURL, buffer, volume, startTime) {
		current.trackURL = trackURL;
		var source = audioContext.createBufferSource();
		source.trackURL = trackURL;
		source.addEventListener("ended", trackEndedHandler);
		source.buffer = buffer;

		var gainNode = audioContext.createGain();
		gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime);
		source.connect(gainNode);
		gainNode.connect(audioContext.destination);
		source.start(0, startTime);
		current.gainNode = gainNode;
		current.source = source;
		current.start = audioContext.currentTime - startTime;
		current.isPlaying = true;
		current.volume = volume;
		updateDisplay();
	}

	function trackDone(trackURL, status) {
		fetch("https://ceol.l42.eu/done?track="+encodeURIComponent(trackURL)+"&status="+encodeURIComponent(status), {method: 'POST'});
		if (current.trackURL == trackURL) playNext();
	}
	function trackEndedHandler(event) {
		buffers[event.target.trackURL].state = "finished";
		updateDisplay();
		trackDone(event.target.trackURL, event.type);
	}
	function stopExisting(fadeTime) {
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
		if (current.start) fetch("https://ceol.l42.eu/update?"+getUpdateParams(), {method: 'POST'});
		current = {};
	}

	function updateDisplay(message) {
		var statusNode = document.getElementById('status');
		var state = message ? message : getState(current.trackURL);
		statusNode.firstChild.nodeValue = state;
		statusNode.dataset.state = state;
	}

	/**
	 * Function to fake it till you make it
	 * ie use the data from the next object
	 * until we get an update from the server
	 */
	function playNext() {
		updateDisplay("skipping");
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

	updateDisplay("connecting");
	document.getElementById("next").addEventListener('click', function skipTrack() {
		trackDone(current.trackURL, "manual skip");
	});
	document.getElementById("cover").addEventListener('click', function playpauseTrack() {
		var data = current.latestData;
		var command;
		if (current.source) {
			updateDisplay("pausing");
			command = "pause";
			data.isPlaying = false;
		} else {
			updateDisplay("unpausing");
			command = "play";
			data.isPlaying = true;
		}
		fetch("https://ceol.l42.eu/"+command+"?"+getUpdateParams(), {method: 'POST'});
		evaluateData(data);
	});
	document.getElementById("playlisticon").addEventListener('click', function togglePlaylist(event) {
		var playlistdiv = document.getElementById("playlist");
		if (playlistdiv.dataset.visible) {
			delete playlistdiv.dataset.visible;
		} else {
			while (playlistdiv.firstChild) {
				playlistdiv.removeChild(playlistdiv.firstChild);
			}
			playlistdiv.dataset.visible = true;
			var loadingdiv = document.createElement("div");
			loadingdiv.id = 'playlistloading'
			loadingdiv.appendChild(document.createTextNode("Loading Playlist..."));
			playlistdiv.appendChild(loadingdiv);
			fetch("https://ceol.l42.eu/poll/playlist?_cb="+new Date().getTime()).then(function (response){
				return response.json();
			}).then(function (playlistdata){
				if (!playlistdata.playlist.length) throw "No tracks in playlist";
				var listdiv = document.createElement("ol");
				playlistdata.playlist.forEach(function (trackdata){
					var state = getState(trackdata.url);
					var listitem = document.createElement("li");
					var statenode = document.createElement("span");
					statenode.appendChild(document.createTextNode(state));
					statenode.className = 'state';
					statenode.dataset.state = state;
					listitem.appendChild(statenode);
					var title = "";
					if (trackdata.metadata.title) title += trackdata.metadata.title;
					else title += trackdata.url;
					if (trackdata.metadata.artist) title += " - " + trackdata.metadata.artist;

					listitem.appendChild(document.createTextNode(title));
					listdiv.appendChild(listitem);
				})
				playlistdiv.removeChild(loadingdiv);
				playlistdiv.appendChild(listdiv);
			}).catch(function () {
				loadingdiv.dataset.error = true;
				loadingdiv.firstChild.nodeValue = "Error loading playlist."
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

(function swHelperInit() {
	var registration;
	if ('serviceWorker' in navigator) {
		registration = navigator.serviceWorker.register('/serviceworker.js');
	} else {
		registration = new Promise(function(resolve, reject) {
			throw "no service worker support";
		});
	}
	registration.then(function swRegistered(registration) {
		console.log('ServiceWorker registration successful with scope: ' + registration.scope);
	}).catch(function swError(error) {
		console.error('ServiceWorker registration failed: ' + error);
	});
})();
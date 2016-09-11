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

	function poll(url, handleDataFunction, additionalParamFunction, cache) {
		if (!url) throw "no URL given to poll";
		if (handleDataFunction && typeof handleDataFunction != 'function') throw "handleDataFunction must be a function";
		if (additionalParamFunction && typeof additionalParamFunction != 'function') throw "additionalParamFunction must be a function";
		function actuallyPoll(hashcode) {
			var params = "?";
			params += "hashcode="+hashcode;
			params += "&_cb="+new Date().getTime();
			if (additionalParamFunction) params += additionalParamFunction();
			var response;
			fetch(url+params).then(function decodePoll(response) {
				return response.clone().json().then(function handlePoll(data) {

					// Create a request object which ignores all the params to cache against
					var request = new Request(url);

					// If there's a hashcode, use the new one and evaluate new data.
					if (data.hashcode) {
						hashcode = data.hashcode;
						if (cache) cache.put(request, response.clone());
						if (handleDataFunction) handleDataFunction(data);
						statusChanged(request.pathname, response);
					}
					actuallyPoll(hashcode);
				});
			}).catch(function pollError(error){

				// Wait 5 second before trying again to prevent making things worse
				setTimeout(function pollRetry() {
					actuallyPoll(hashcode);
				}, 5000);
			});
		}
		actuallyPoll(null);
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
		playlistViewer.refresh();
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


	var playlistViewer = (function playlistViewer() {
		var playlistdiv = document.getElementById("playlist");
		var playlistdata = null;
		document.getElementById("playlisticon").addEventListener('click', function togglePlaylist(event) {
			if (playlistdiv.dataset.visible) {
				delete playlistdiv.dataset.visible;
			} else {
				playlistdiv.dataset.visible = true;
				renderPlaylist();
			}
		});

		function setPlaylistDiv(node) {
			while (playlistdiv.firstChild) {
				playlistdiv.removeChild(playlistdiv.firstChild);
			}
			playlistdiv.appendChild(node);
		}
		function renderPlaylist() {
			if (!playlistdiv.dataset.visible) return;
			try {
				if (!playlistdata) throw "Playlist not ready";
				if (!playlistdata.playlist.length) throw "No tracks in playlist";
				var listdiv = document.createElement("ol");
				if (current.latestData && current.latestData.now.url) {
					renderPlaylistTrack(current.latestData.now);
				}
				playlistdata.playlist.forEach(renderPlaylistTrack);
				setPlaylistDiv(listdiv);
			} catch (error) {
				var playlisterror = document.createElement("div");
				playlisterror.id = 'playlisterror';
				playlisterror.dataset.error = true;
				playlisterror.appendChild(document.createTextNode("Error loading playlist.  " + error));
				setPlaylistDiv(playlisterror);
			}
			function renderPlaylistTrack(trackdata){
				var state = getState(trackdata.url);
				var listitem = document.createElement("li");
				var statenode = document.createElement("span");
				if (state == "unloaded") {
					if (trackdata.cached) {
						state = "downloaded";
					} else if (trackdata.caching) {
						state = "caching";
					} else if (trackdata.erroring) {
						state = "failed";
					}
				}
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
			}
		}
		function playlistUpdate(newplaylistdata) {
			playlistdata = newplaylistdata;
			renderPlaylist();
		}
		poll("https://ceol.l42.eu/poll/playlist", playlistUpdate);
		return {
			refresh: renderPlaylist,
		}
	})();

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

	// Make sure footer clicks don't propagate into rest of page.
	document.querySelector("footer").addEventListener('click', function stopFooterProp(event) {
		event.stopPropagation();
	});
	poll("https://ceol.l42.eu/poll", evaluateData, getUpdateParams);
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
		registration.update();
	}).catch(function swError(error) {
		console.error('ServiceWorker registration failed: ' + error);
	});
})();
window.performance.mark('run_js');
function player() {
	window.performance.mark('dom_loaded');
	var audioContext = new AudioContext();
	var current = {};
	const dataOrigin = "https://ceol.l42.eu/";

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
		if (!data.tracks.length) {
			stopExisting(0);
			console.error("No tracks provided", data);
			return;
		}
		data.now = data.tracks[0];
		if (data.tracks.length > 1) data.next = data.tracks[1];
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
			playlistViewer.refresh();
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
			updateDisplay();
			playlistViewer.refresh();
			return;
		}

		buffer.then(function createSource(buffer) {
			if (trackURL != current.trackURL || current.source) {

				//Another track load has overtaken this one so ignore this one
				return;
			}
			playBuffer(trackURL, buffer, data.volume, data.now.currentTime);
		});
		playlistViewer.refresh();
	}

	var buffers = {};
	function getBuffer(trackURL) {
		if (!(trackURL in buffers)) {
			window.performance.mark('buffers_fetching');
			buffers[trackURL] = fetch(trackURL.replace("ceol srl", "import/black/ceol srl")).then(function bufferTrack(rawtrack) {
				window.performance.mark('buffers_buffering');
				buffers[trackURL].state = "buffering";
				updateDisplay();
				return rawtrack.arrayBuffer();
			}).then(function decodeTrack(arrayBuffer) {
				window.performance.mark('buffers_decoding');
				buffers[trackURL].state = "decoding";
				updateDisplay();
				return audioContext.decodeAudioData(arrayBuffer);
			}).then(function doneDecoding(buffer) {
				window.performance.mark('buffers_ready');
				buffers[trackURL].state = "ready";
				updateDisplay();
				return buffer;
			}).catch(function trackFailure(error) {
				window.performance.mark('buffers_failed');
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

		// If it's the current track, then update the status
		if (current.trackURL == trackURL) updateDisplay("skipping");

		var data = current.latestData;
		if (!data) {
			console.warn("No current data found.  Can't skip track");
			return;
		}
		
		// Keep all tracks which aren't the done one
		data.tracks = data.tracks.filter(function (track) {
			return (track.url != trackURL);
		});
		evaluateData(data);

		fetch(dataOrigin+"done?track="+encodeURIComponent(trackURL)+"&status="+encodeURIComponent(status), {method: 'POST'});
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
		if (current.start) fetch(dataOrigin+"update?"+getUpdateParams(), {method: 'POST'});
		current = {};
	}

	function updateDisplay(message) {
		var statusNode = document.getElementById('status');
		var state = message ? message : getState(current.trackURL);
		statusNode.firstChild.nodeValue = state;
		statusNode.dataset.state = state;
		playlistViewer.refresh();
	}

	window.performance.mark('start_eventhandlers');

	var playlistViewer = (function playlistViewer() {
		var playlistdiv = document.getElementById("playlist");
		document.getElementById("playlisticon").addEventListener('click', function togglePlaylist(event) {
			if (playlistdiv.dataset.visible) {
				delete playlistdiv.dataset.visible;
			} else {
				window.performance.mark('start_playlist_display');
				playlistdiv.dataset.visible = true;
				renderPlaylist();
				window.performance.mark('end_playlist_display');
				window.performance.measure('measure_playlist_display', 'start_playlist_display', 'end_playlist_display');
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
			window.performance.mark('start_playlist_render');
			try {
				if (!current.latestData) throw "Playlist data not ready";
				if (!current.latestData.tracks.length) throw "No tracks in playlist";
				var listdiv = document.createElement("ol");
				current.latestData.tracks.forEach(renderPlaylistTrack);
				setPlaylistDiv(listdiv);
			} catch (error) {
				var playlisterror = document.createElement("div");
				playlisterror.id = 'playlisterror';
				playlisterror.dataset.error = true;
				playlisterror.appendChild(document.createTextNode("Error loading playlist.  " + error));
				setPlaylistDiv(playlisterror);
			}
			window.performance.mark('end_playlist_render');
			window.performance.measure('measure_playlist_render', 'start_playlist_render', 'end_playlist_render');
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
						if (trackdata.erroring.match(/quota/i)) {
							state = "disk quota full";
						} else {
							state = "failed";
						}
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

				var closenode = document.createElement("span");
				closenode.setAttribute("class", "remove");
				closenode.setAttribute("title", "Remove From Playlist");
				closenode.appendChild(document.createTextNode("✘"));
				closenode.addEventListener("click", function removeTrack() {
					trackDone(trackdata.url, "manual skip");
					listitem.setAttribute("class", "skipped");
				})
				listitem.appendChild(closenode);

				listdiv.appendChild(listitem);
			}
		}
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
		fetch(dataOrigin+command+"?"+getUpdateParams(), {method: 'POST'});
		evaluateData(data);
	});

	// Make sure footer clicks don't propagate into rest of page.
	document.querySelector("footer").addEventListener('click', function stopFooterProp(event) {
		event.stopPropagation();
	});
	window.performance.mark('end_eventhandlers');
	window.performance.measure('measure_eventhandlers', 'start_eventhandlers', 'end_eventhandlers');
	poll(dataOrigin+"poll/summary", evaluateData, getUpdateParams);
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
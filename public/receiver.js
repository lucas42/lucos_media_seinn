
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

function setupCastReceiver() {
	document.body.appendChild(document.createElement('cast-media-player'));
	const receiverContext = cast.framework.CastReceiverContext.getInstance();
	const playerManager = receiverContext.getPlayerManager();

	// Ideally MEDIA_FINISHED would provide info about the track which has finished
	// But instead, we track the current media and hope there's no race conditions
	var currentMedia;
	playerManager.addEventListener(cast.framework.events.EventType.MEDIA_STATUS, event => {
		if (!('media' in event.mediaStatus)) return;
		currentMedia = event.mediaStatus.media;
	});
	playerManager.addEventListener(cast.framework.events.EventType.REQUEST_QUEUE_UPDATE, event => {
		// TODO: look at event.requestData.jump to decide how many tracks to skip
		// For now, I've only ever seen a value of 1
		playerManager.pause();
		fetch(dataOrigin+"next", {method: 'POST'});
	});
	playerManager.addEventListener(cast.framework.events.EventType.MEDIA_FINISHED, event => {

		// Interrupted means the track was actively changed, so no need to update the server
		if (event.endedReason == 'INTERRUPTED') return;
		// If there's no current track, the server won't know which to skip
		if (!currentMedia) return;
		fetch(dataOrigin+"done?track="+encodeURIComponent(currentMedia.contentId)+"&status="+encodeURIComponent(event.endedReason), {method: 'POST'});
	});
	receiverContext.start();
	poll(dataOrigin+"poll/summary", data => {
		const now = data.tracks[0];
		if (!now) return console.error("No currently playing track", data);
		const mediaInfo = playerManager.getMediaInformation();
		if (mediaInfo && now.url == mediaInfo.contentId) return;

		loadData = new cast.framework.messages.LoadRequestData();
		loadData.currentTime = now.currentTime;
		loadData.autoplay = data.isPlaying;
		loadData.media = new cast.framework.messages.MediaInformation();
		loadData.media.contentId = now.url;
		loadData.media.metadata = new cast.framework.messages.MusicTrackMediaMetadata();
		loadData.media.metadata.title = now.metadata.title;
		loadData.media.metadata.albumName = now.metadata.album;
		loadData.media.metadata.artist = now.metadata.artist;
		loadData.media.metadata.contentRating = now.metadata.rating;
		loadData.media.metadata.releaseDate = now.metadata.year;
		loadData.media.metadata.images = [
				{url: now.metadata.img}
			];
		playerManager.load(loadData)
			.then(() => {
				if (data.isPlaying) {
					playerManager.play();
				} else {
					playerManager.pause();
				}
			})
			.catch(err => console.error("Can't load track", err));
	});
}

// TODO: detect whether the page has been opened on a Google Cast device
setupCastReceiver();

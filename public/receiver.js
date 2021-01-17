
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

function newPollInfo(data) {
	const manager = cast.framework.CastReceiverContext.getInstance().getPlayerManager();
	const now = data.tracks[0];
	if (!now) return console.log("No currently playing track", data);
	const mediaInfo = manager.getMediaInformation();
	if (now.url == mediaInfo.contentId) return;

	loadData = new cast.framework.messages.LoadRequestData();
	loadData.currentTime = now.currentTime;
	loadData.autoplay = true;
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
	manager.load(loadData)
		.then(() => console.log("New track loaded"))
		.catch(err => console.error("Can't load track", error));
}

cast.framework.CastReceiverContext.getInstance().start();
poll(dataOrigin+"poll/summary", newPollInfo);
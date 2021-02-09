const pubsub = require("./pubsub");

/**
 * Attempts to loads a google cast receiver
 * @param {string} mediaManager the origin of a lucos_media_manager server (including trailing slash)
 * @returns {boolean} Whether or not the recevier was successfully loaded
 */
function loadReceiver(mediaManager) {

	// Don't even bother trying to create a cast recevier with the relevant libraries
	if (!('cast' in window)) return false;
	const receiverContext = cast.framework.CastReceiverContext.getInstance();
	const capabilities = receiverContext.getDeviceCapabilities();

	// If capabalities is null, then the device isn't set up for receiving casts;
	if (capabilities == null) return false;

	document.body.firstChild.replaceWith(document.createElement('cast-media-player'));
	document.body.classList.add("cast-receiver");
	document.querySelectorAll("lucos-navbar").forEach(navbar => {navbar.setAttribute("device", "cast-receiver")});
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
		fetch(mediaManager+"next", {method: 'POST'});
	});
	playerManager.addEventListener(cast.framework.events.EventType.MEDIA_FINISHED, event => {

		// Interrupted means the track was actively changed, so no need to update the server
		if (event.endedReason == 'INTERRUPTED') return;
		// If there's no current track, the server won't know which to skip
		if (!currentMedia) return;
		fetch(mediaManager+"done?track="+encodeURIComponent(currentMedia.contentId)+"&status="+encodeURIComponent(event.endedReason), {method: 'POST'});
	});
	receiverContext.start();
	pubsub.listen("managerData", data => {
		const now = data.tracks[0];
		if (!now) return console.error("No currently playing track", data);
		const mediaInfo = playerManager.getMediaInformation();
		if (mediaInfo && now.url == mediaInfo.contentId) {
			if (playerManager.getPlayerState() == cast.framework.messages.PlayerState.PLAYING) {
				if (!data.isPlaying) playerManager.pause();
			} else {
				if (data.isPlaying) playerManager.play();
			}
			return;
		}

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
	return true;
}
module.exports = loadReceiver;
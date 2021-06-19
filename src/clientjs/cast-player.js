const pubsub = require("./pubsub");
const manager = require("./manager");
const localDevice = require("./local-device");

const receiverContext = cast.framework.CastReceiverContext.getInstance();
const mediaPlayer = document.createElement('cast-media-player');
const playerStyleOverrides = document.createElement('style');
playerStyleOverrides.textContent = `
	.metadata .metadataPlaceHolder .playback-logo {
		display: none;
	}
	#castMetadataTitle {
		font-size: 4.5vw;
	}
	#castMetadataSubtitle, #castMetadataSubtitle2 {
		font-size: 2.5vw;
		line-height: 1;
		text-transform: none;
	}
`;
mediaPlayer.shadowRoot.append(playerStyleOverrides);
document.body.prepend(mediaPlayer);

document.querySelectorAll("lucos-navbar").forEach(navbar => {
	navbar.setAttribute("device", "cast-receiver");
	navbar.style.borderBottomWidth = "7px";
});
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
	manager.post("next");
});
playerManager.addEventListener(cast.framework.events.EventType.REQUEST_PLAY, event => {
	manager.post("play");
});
playerManager.addEventListener(cast.framework.events.EventType.REQUEST_PAUSE, event => {
	manager.post("pause");
});
playerManager.addEventListener(cast.framework.events.EventType.MEDIA_FINISHED, event => {

	// Interrupted means the track was actively changed, so no need to update the server
	if (event.endedReason == 'INTERRUPTED') return;
	// If there's no current track, the server won't know which to skip
	if (!currentMedia) return;
	manager.post("done", {track: currentMedia.contentId, status: event.endedReason});
});
handleVolumes(receiverContext);
receiverContext.start();
pubsub.listen("managerData", data => {
	const now = data.tracks[0];
	const shouldPlay = data.isPlaying && localDevice.isCurrent();
	if (!now) return console.error("No currently playing track", data);
	const mediaInfo = playerManager.getMediaInformation();

	if (mediaInfo && now.url == mediaInfo.contentId) {
		if (playerManager.getPlayerState() == cast.framework.messages.PlayerState.PLAYING) {
			if (!shouldPlay) playerManager.pause();
		} else {
			if (shouldPlay) playerManager.play();
		}
		if (now.currentTime > playerManager.getCurrentTimeSec()) {
			playerManager.seek(now.currentTime);
		}
		return;
	}

	loadData = new cast.framework.messages.LoadRequestData();
	loadData.currentTime = now.currentTime;
	loadData.autoplay = shouldPlay;
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
			if (shouldPlay) {
				playerManager.play();
			} else {
				playerManager.pause();
			}
		})
		.catch(err => console.error("Can't load track", err));
});

/**
 * Covers logic for volume changes, both initiated from the server or the device
 */
function handleVolumes(receiverContext) {
	let desiredVolume;

	// Check for changes in volume coming from server
	pubsub.listen("managerData", data => {
		desiredVolume = data.volume;
		receiverContext.setSystemVolumeLevel(desiredVolume);  // This doesn't appear in the docs, but I found it mentioned on stackoverflow...
	});

	// Check for changes in volume on the cast device (eg from a physical button)
	receiverContext.addEventListener(cast.framework.system.EventType.SYSTEM_VOLUME_CHANGED, event => {
		const newVolume = event.data.muted ? 0 : event.data.level;

		// If the volumes match, this event was likely fired in response to a server update
		// Therefore, no need to tell the server about the new volume
		if (newVolume === desiredVolume) return;
		manager.post("volume", {volume: newVolume});
	});

}

function getTimeElapsed() {
	return playerManager.getCurrentTimeSec();
}

function getCurrentTrack() {
	const mediaInfo = playerManager.getMediaInformation();
	if (!mediaInfo) return undefined;
	return mediaInfo.contentId;
}

function isPlaying() {
	return (playerManager.getPlayerState() === cast.framework.messages.PlayerState.PLAYING);
}

module.exports = { getTimeElapsed, getCurrentTrack, isPlaying };
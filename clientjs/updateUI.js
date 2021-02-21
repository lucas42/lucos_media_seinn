const pubsub = require("./pubsub");
require("./page-loaded");

function updateNow(data) {
	const now = data.tracks[0];
	const metadata = now.metadata || {};
	document.getElementById("now_title").firstChild.nodeValue = metadata.title;
	document.getElementById("now_artist").firstChild.nodeValue = metadata.artist;
	document.getElementById("now_thumb").src = metadata.thumb;
	document.getElementById("edit").action = metadata.editurl;
}

function updatePlayPauseButton(data) {
	const playpauseSubmit = document.getElementById('playpause-submit');
	if (data.isPlaying) {
		playpauseSubmit.value = "Pause"
	} else {
		playpauseSubmit.value = "Play"
	}
}

pubsub.listen("ready", () => {
	pubsub.listenExisting("managerData", updateNow, true);
	pubsub.listenExisting("managerData", updatePlayPauseButton, true);
});
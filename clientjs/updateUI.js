const pubsub = require("./pubsub");
require("./page-loaded");

function updateEditButton(data) {
	const now = data.tracks[0];
	const metadata = now.metadata || {};
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
	pubsub.listenExisting("managerData", updateEditButton, true);
	pubsub.listenExisting("managerData", updatePlayPauseButton, true);
});
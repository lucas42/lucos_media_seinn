const pubsub = require("./pubsub");
require("./page-loaded");


function updatePlayPauseButton(data) {
	const playpauseSubmit = document.getElementById('playpause-submit');
	if (data.isPlaying) {
		playpauseSubmit.value = "Pause"
	} else {
		playpauseSubmit.value = "Play"
	}
}

pubsub.listen("ready", () => {
	pubsub.listenExisting("managerData", updatePlayPauseButton, true);
});
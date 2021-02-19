const pubsub = require("./pubsub");
const manager = require("./manager");
require("./page-loaded");

function setupPlaypause() {
	const playpause = document.getElementById('playpause');
	const playpauseSubmit = document.getElementById('playpause-submit');
	playpause.addEventListener('submit', async event => {
		event.preventDefault();
		if (playpauseSubmit.value == "Play") {
			await manager.post("play");
		} else {
			await manager.post("pause");
		}
	});
}
function setupNext() {
	const form = document.getElementById('next');
	form.addEventListener('submit', async event => {
		event.preventDefault();
		await manager.post("next");
	});
}
function setupVolume() {
	document.querySelectorAll("volume-control")
		.forEach(volControl => volControl.addEventListener("volumeUpdated", async event => {
			event.preventDefault();
			await manager.post("volume", {volume: event.detail});
		}));
}

/**
 * The refresh button isn't needed if JS is running as we poll for changes constantly
 */
function removeRefresh() {
	const refresh = document.getElementById('refresh');
	const controls = document.getElementById('controls');

	// Remove refresh's list-item for tidyness
	controls.removeChild(refresh.parentNode);
}
function setupControls() {
	setupPlaypause();
	setupNext();
	setupVolume();
	removeRefresh();
}

pubsub.waitFor('ready', setupControls);

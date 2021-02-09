const pubsub = require("./pubsub");
require("./page-loaded");

function controls(mediaManager) {
	function setupPlaypause() {
		const playpause = document.getElementById('playpause');
		const playpauseSubmit = document.getElementById('playpause-submit');
		playpause.addEventListener('submit', async event => {
			event.preventDefault();
			if (playpauseSubmit.value == "Play") {
				await fetch(mediaManager+"play", {method: 'POST'});
				playpauseSubmit.value = "Pause"
			} else {
				await fetch(mediaManager+"pause", {method: 'POST'});
				playpauseSubmit.value = "Play"
			}
		});
	}
	function setupNext() {
		const form = document.getElementById('next');
		form.addEventListener('submit', async event => {
			event.preventDefault();
			await fetch(mediaManager+"next", {method: 'POST'});
		});
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
		removeRefresh();
	}

	pubsub.waitFor('ready', setupControls);
}
module.exports = controls;
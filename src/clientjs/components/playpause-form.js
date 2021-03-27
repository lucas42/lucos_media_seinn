const pubsub = require("../pubsub");
const manager = require("../manager");

class PlayPauseForm extends HTMLFormElement {
	constructor() {
		super();

		const submit = this.querySelector("input[type=submit]");
		if (!submit) throw "PlayPause form missing submit button";

		pubsub.listenExisting("managerData", data => {
			if (data.isPlaying) {
				submit.value = "Pause"
			} else {
				submit.value = "Play"
			}
		}, true);

		this.addEventListener('submit', async event => {
			event.preventDefault();
			if (submit.value == "Play") {
				await manager.post("play");
			} else {
				await manager.post("pause");
			}
		});
	}
}


customElements.define('playpause-form', PlayPauseForm, { extends: "form" });
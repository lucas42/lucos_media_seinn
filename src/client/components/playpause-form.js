import { listenExisting } from 'lucos_pubsub';
import { post } from '../../classes/manager.js';

class PlayPauseForm extends HTMLFormElement {
	constructor() {
		super();

		const submit = this.querySelector("input[type=submit]");
		if (!submit) throw "PlayPause form missing submit button";

		listenExisting("managerData", data => {
			if (data.isPlaying) {
				submit.value = "Pause"
			} else {
				submit.value = "Play"
			}
		}, true);

		this.addEventListener('submit', async event => {
			event.preventDefault();
			if (submit.value == "Play") {
				await post("play");
			} else {
				await post("pause");
			}
		});
	}
}


customElements.define('playpause-form', PlayPauseForm, { extends: "form" });
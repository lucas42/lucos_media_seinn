import { listenExisting } from 'lucos_pubsub';
import { updateTrackStatus } from '../player.js';
import { put } from '../../classes/manager.js';

class PlayPauseForm extends HTMLFormElement {
	constructor() {
		super();

		const submit = this.querySelector("input[type=submit]");
		if (!submit) throw "PlayPause form missing submit button";

		listenExisting("managerData", data => {
			if (data.isPlaying) {
				submit.value = "⏸ Pause"
			} else {
				submit.value = "⏵ Play"
			}
		}, true);

		this.addEventListener('submit', async event => {
			event.preventDefault();
			updateTrackStatus();
			if (submit.value == "⏵ Play") {
				await put("v3/is-playing", "true");
			} else {
				await put("v3/is-playing", "false");
			}
		});
	}
}


customElements.define('playpause-form', PlayPauseForm, { extends: "form" });
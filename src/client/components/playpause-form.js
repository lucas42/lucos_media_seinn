import { listenExisting, send } from 'lucos_pubsub';
import { put } from '../../classes/manager.js';

class PlayPauseForm extends HTMLFormElement {
	constructor() {
		super();

		const submit = this.querySelector("input[type=submit]");
		if (!submit) throw new Error("PlayPause form missing submit button");

		listenExisting("managerData", data => {
			if (data.isPlaying) {
				submit.value = "⏸ Pause"
			} else {
				submit.value = "⏵ Play"
			}
		}, true);

		this.addEventListener('submit', async event => {
			event.preventDefault();
			this.classList.add('loading');
			send('playpause_changing');
			if (submit.value == "⏵ Play") {
				await put("v3/is-playing", "true");
			} else {
				await put("v3/is-playing", "false");
			}
			this.classList.remove('loading');
		});
	}
}


customElements.define('playpause-form', PlayPauseForm, { extends: "form" });
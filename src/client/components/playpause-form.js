import { listenExisting, unlisten, send } from 'lucos_pubsub';
import { put } from '../../classes/manager.js';

class PlayPauseForm extends HTMLFormElement {
	constructor() {
		super();

		if (!this.querySelector("input[type=submit]")) {
			const submit = document.createElement('input');
			submit.type = 'submit';
			this.appendChild(submit);
		}

		this.addEventListener('submit', async event => {
			event.preventDefault();
			const submit = this.querySelector("input[type=submit]");
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
	connectedCallback() {
		const playPause = data => {
			const submit = this.querySelector("input[type=submit]");
			if (data.isPlaying) {
				submit.value = "⏸ Pause"
			} else {
				submit.value = "⏵ Play"
			}
		}
		listenExisting("managerData", playPause);
		this.disconnectedCallback = () => {
			unlisten("managerData", playPause);
		}
	}
}


customElements.define('playpause-form', PlayPauseForm, { extends: "form" });
/**
 * Web Component to shortcut playing on the current device
 *
 * The functionality here is equivalent to selecting the current device from the device overlay and also pressing play (if currently paused)
 * But this button does it in a single click without the cognative overload of thinking about which device this is or the current state
 * 
 * Clicking the button is idempotent, though it hides itself the local device is already the current one
 **/

import { listenExisting } from 'lucos_pubsub';
import { put } from '../../classes/manager.js';
import localDevice from '../../classes/local-device.js';

class PlayHereForm extends HTMLFormElement {
	constructor() {
		super();
		const submit = document.createElement("input");
		submit.type = "submit";
		submit.value = "Play All Here";
		this.append(submit);
		this.addEventListener('submit', async event => {
			event.preventDefault();
			await put("v3/current-device", localDevice.getUuid());
			await put("v3/current-collection", "all");
			await put("v3/is-playing", "true");
		});
		listenExisting("managerData", data => {
			if (localDevice.isCurrent()) {
				submit.classList.add("hide");
			} else {
				submit.classList.remove("hide");
			}
		});
		const style = document.createElement('style');
		style.textContent = `
			.hide {
				display:none;
			}
		`;
		this.prepend(style);
	}
}

customElements.define('playhere-form', PlayHereForm, { extends: "form" });

function addToControls() {
	const controls = document.getElementById('controls');
	const li = document.createElement("li");
	const form = new PlayHereForm();
	li.append(form);

	// Should be the 2nd control (straight after playpause)
	controls.firstElementChild.after(li);
}
addToControls();
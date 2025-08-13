/**
 * Web Component to shortcut playing on the current device
 *
 * The functionality here is equivalent to selecting the current device from the device overlay and also pressing play (if currently paused)
 * But this button does it in a single click without the cognative overload of thinking about which device this is or the current state
 * 
 * Clicking the button is idempotent, though it hides itself when the local device is already the current one
 **/

import { listenExisting, unlisten } from 'lucos_pubsub';
import { put } from '../../utils/manager.js';
import localDevice from '../../utils/local-device.js';

export default class PlayHereForm extends HTMLFormElement {
	constructor() {
		super();
		const group = document.createElement("div");
		group.classList.add("control-group");

		const extracontrols = document.createElement("div");
		extracontrols.classList.add("extra-controls");
		group.append(extracontrols);

		const playhere = document.createElement("input");
		playhere.type = "submit";
		playhere.value = "Play Here";
		playhere.classList.add("primary-control");
		group.append(playhere);
		this.addEventListener('submit', async event => {
			event.preventDefault();
			await put("v3/current-device", localDevice.getUuid());
			await put("v3/is-playing", "true");
		});
		const playallhere = document.createElement("input");
		playallhere.type = "button";
		playallhere.value = "Play All Here";
		extracontrols.append(playallhere);
		playallhere.addEventListener('click', async event => {
			event.preventDefault();
			await put("v3/current-device", localDevice.getUuid());
			await put("v3/current-collection", "all");
			await put("v3/is-playing", "true");
		});
		const showmore = document.createElement("input");
		showmore.type = "button";
		showmore.value = "↓";
		showmore.classList.add("show-more");
		showmore.addEventListener("click", event => {
			const showmore = event.currentTarget;
			const group = showmore.parentNode;
			if (group.dataset.expanded == "true") {
				delete group.dataset.expanded;
				showmore.value = "↓";
			} else {
				group.dataset.expanded = "true";
				showmore.value = "ꜛ";
			}
		})
		group.append(showmore);
		const style = document.createElement('style');
		style.textContent = `
		`;
		this.append(style);
		this.append(group);
		this.showHide = data => {
			if (localDevice.isCurrent()) {
				group.classList.add("hide");
			} else {
				group.classList.remove("hide");
			}
		}
	}

	connectedCallback() {
		listenExisting("managerData", this.showHide);
	}
	disconnectedCallback() {
		unlisten("managerData", this.showHide);
	}
}

customElements.define('playhere-form', PlayHereForm, { extends: "form" });
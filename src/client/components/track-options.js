import { del } from '../../classes/manager.js';
class TrackOptions extends HTMLElement {
	static get observedAttributes() {
		return ['url', 'uuid', 'editurl'];
	}
	constructor() {
		super();

		const component = this;
		const shadow = component.attachShadow({mode: 'closed'});
		const style = document.createElement('style');
		style.textContent = `
			:host {
				display: block;
				padding-left: 110px;
			}
			form {
				display: inline-block;
				padding: 5px;
			}
			input[type=submit] {
				background: white;
				color: black;
			}
		`;
		shadow.append(style);

		component.editForm = document.createElement("form");
		component.editForm.target = "_blank";
		component.editForm.method = "get";
		const editSubmit = document.createElement("input");
		editSubmit.type = "submit";
		editSubmit.value = "Edit Metadata";
		editSubmit.addEventListener("touchstart", event => event.stopPropagation(), false);
		component.editForm.append(editSubmit);
		shadow.append(component.editForm);

		component.skipForm = document.createElement("form");
		component.skipForm.dataset.uuid = component.getAttribute("uuid");
		component.skipForm.addEventListener("submit", event => {
			event.preventDefault();
			const playlist = 'null'; // For now, the playlist slug isn't used (but needs to be part of the url).  Set it to null until there's an easier way to derive it.
			const uuid = event.currentTarget.dataset.uuid;
			del(`v3/playlist/${playlist}/${uuid}?action=skip`);
		});
		const skipSubmit = document.createElement("input");
		skipSubmit.type = "submit";
		skipSubmit.value = "Skip";
		skipSubmit.addEventListener("touchstart", event => event.stopPropagation(), false);
		component.skipForm.append(skipSubmit);
		shadow.append(component.skipForm);
	}
	attributeChangedCallback(name, oldValue, newValue) {
		switch (name) {
			case "editurl":
				this.editForm.action = newValue;
				break;	
			case "uuid":
				this.skipForm.dataset.uuid = newValue;
				break;
		}
	}
}


customElements.define('track-options', TrackOptions);
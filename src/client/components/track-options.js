import { post } from '../../classes/manager.js';
class TrackOptions extends HTMLElement {
	static get observedAttributes() {
		return ['url','editurl'];
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
		component.skipForm.addEventListener("submit", event => {
			event.preventDefault();
			post("done", {
				track: component.getAttribute("url"),
				status: "manual skip",
			});
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
		}
	}
}


customElements.define('track-options', TrackOptions);
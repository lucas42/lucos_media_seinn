import { del, put } from '../../utils/manager.js';
import { getPlaylistSlug } from '../../utils/playlist-slug.js';
class TrackOptions extends HTMLElement {
	static get observedAttributes() {
		return ['url', 'uuid', 'editurl', 'position', 'total-tracks'];
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
			const playlist = getPlaylistSlug();
			const uuid = event.currentTarget.dataset.uuid;
			del(`v3/playlist/${playlist}/${uuid}?action=skip`);
		});
		const skipSubmit = document.createElement("input");
		skipSubmit.type = "submit";
		skipSubmit.value = "Skip";
		skipSubmit.addEventListener("touchstart", event => event.stopPropagation(), false);
		component.skipForm.append(skipSubmit);
		shadow.append(component.skipForm);

		component.playNextForm = document.createElement("form");
		component.playNextForm.dataset.uuid = component.getAttribute("uuid");
		component.playNextForm.addEventListener("submit", event => {
			event.preventDefault();
			const playlist = getPlaylistSlug();
			const uuid = event.currentTarget.dataset.uuid;
			put(`v3/playlist/${playlist}/${uuid}/position`, '1');
		});
		const playNextSubmit = document.createElement("input");
		playNextSubmit.type = "submit";
		playNextSubmit.value = "Play next";
		playNextSubmit.addEventListener("touchstart", event => event.stopPropagation(), false);
		component.playNextForm.append(playNextSubmit);
		shadow.append(component.playNextForm);

		component.moveUpForm = document.createElement("form");
		component.moveUpForm.dataset.uuid = component.getAttribute("uuid");
		component.moveUpForm.dataset.position = component.getAttribute("position");
		component.moveUpForm.addEventListener("submit", event => {
			event.preventDefault();
			const playlist = getPlaylistSlug();
			const uuid = event.currentTarget.dataset.uuid;
			const position = parseInt(event.currentTarget.dataset.position);
			put(`v3/playlist/${playlist}/${uuid}/position`, String(position - 1));
		});
		component.moveUpSubmit = document.createElement("input");
		component.moveUpSubmit.type = "submit";
		component.moveUpSubmit.value = "▲";
		component.moveUpSubmit.addEventListener("touchstart", event => event.stopPropagation(), false);
		component.moveUpForm.append(component.moveUpSubmit);
		shadow.append(component.moveUpForm);

		component.moveDownForm = document.createElement("form");
		component.moveDownForm.dataset.uuid = component.getAttribute("uuid");
		component.moveDownForm.dataset.position = component.getAttribute("position");
		component.moveDownForm.addEventListener("submit", event => {
			event.preventDefault();
			const playlist = getPlaylistSlug();
			const uuid = event.currentTarget.dataset.uuid;
			const position = parseInt(event.currentTarget.dataset.position);
			put(`v3/playlist/${playlist}/${uuid}/position`, String(position + 1));
		});
		component.moveDownSubmit = document.createElement("input");
		component.moveDownSubmit.type = "submit";
		component.moveDownSubmit.value = "▼";
		component.moveDownSubmit.addEventListener("touchstart", event => event.stopPropagation(), false);
		component.moveDownForm.append(component.moveDownSubmit);
		shadow.append(component.moveDownForm);
	}
	attributeChangedCallback(name, oldValue, newValue) {
		switch (name) {
			case "editurl":
				this.editForm.action = newValue;
				break;
			case "uuid":
				this.skipForm.dataset.uuid = newValue;
				this.playNextForm.dataset.uuid = newValue;
				this.moveUpForm.dataset.uuid = newValue;
				this.moveDownForm.dataset.uuid = newValue;
				break;
			case "position":
				this.moveUpForm.dataset.position = newValue;
				this.moveDownForm.dataset.position = newValue;
				this.moveUpSubmit.disabled = (parseInt(newValue) <= 1);
				this._updateDownDisabled();
				break;
			case "total-tracks":
				this._updateDownDisabled();
				break;
		}
	}
	_updateDownDisabled() {
		const position = parseInt(this.getAttribute("position"));
		const total = parseInt(this.getAttribute("total-tracks"));
		this.moveDownSubmit.disabled = (position >= total - 1);
	}
}


customElements.define('track-options', TrackOptions);

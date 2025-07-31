import { listenExisting, unlisten } from 'lucos_pubsub';

class EditForm extends HTMLFormElement {
	constructor() {
		super();
		const component = this;
		this.updateAction = data => {
			component.action = data.tracks[0]?.metadata?.editurl;
		}
	}
	connectedCallback() {
		listenExisting("managerData", this.updateAction);
	}
	disconnectedCallback() {
		unlisten("managerData", this.updateAction);
	}
}

customElements.define('edit-form', EditForm, { extends: "form" });
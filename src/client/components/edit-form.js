import { listenExisting } from 'lucos_pubsub';

class EditForm extends HTMLFormElement {
	constructor() {
		super();
		const form = this;
		listenExisting("managerData", data => {
			form.action = data.tracks[0]?.metadata?.editurl;
		}, true);
	}
}


customElements.define('edit-form', EditForm, { extends: "form" });
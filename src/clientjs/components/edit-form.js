const pubsub = require("../pubsub");

class EditForm extends HTMLFormElement {
	constructor() {
		super();
		const form = this;
		pubsub.listenExisting("managerData", data => {
			const now = data.tracks[0];
			const metadata = now.metadata || {};
			form.action = metadata.editurl;
		}, true);
	}
}


customElements.define('edit-form', EditForm, { extends: "form" });
import { listenExisting, unlisten } from 'lucos_pubsub';

class EditForm extends HTMLFormElement {
	connectedCallback() {
		const component = this;
		const updateAction = data => {
			component.action = data.tracks[0]?.metadata?.editurl;
		}
		listenExisting("managerData", updateAction);
		this.disconnectedCallback = () => {
			unlisten("managerData", updateAction);
		}
	}
}

customElements.define('edit-form', EditForm, { extends: "form" });
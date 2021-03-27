const manager = require("../manager");

class NextForm extends HTMLFormElement {
	constructor() {
		super();

		this.addEventListener('submit', async event => {
			event.preventDefault();
			await manager.post("next");
		});
	}
}


customElements.define('next-form', NextForm, { extends: "form" });
const manager = require("../manager");

class NextForm extends HTMLFormElement {
	constructor() {
		super();

		this.addEventListener('submit', async event => {
			event.preventDefault();
			const currentTrack = document.querySelector("now-playing").getAttribute("url");
			await manager.post("done", {
				track: currentTrack,
				status: "skipped",
			});
		});
	}
}


customElements.define('next-form', NextForm, { extends: "form" });
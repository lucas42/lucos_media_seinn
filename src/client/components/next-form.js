import { del } from '../../classes/manager.js';

class NextForm extends HTMLFormElement {
	constructor() {
		super();

		this.addEventListener('submit', async event => {
			event.preventDefault();
			const currentTrack = document.querySelector("now-playing").getAttribute("uuid");
			const playlist = 'null'; // For now, the playlist slug isn't used (but needs to be part of the url).  Set it to null until there's an easier way to derive it.
			await del(`v3/playlist/${playlist}/${currentTrack}?action=skip`);
		});
	}
}


customElements.define('next-form', NextForm, { extends: "form" });
import { del } from '../../utils/manager.js';
import { getPlaylistSlug } from '../../utils/playlist-slug.js';

class NextForm extends HTMLFormElement {
	constructor() {
		super();

		this.addEventListener('submit', async event => {
			event.preventDefault();
			this.classList.add('loading');
			const currentTrack = document.querySelector("now-playing").getAttribute("uuid");
			const playlist = getPlaylistSlug();
			await del(`v3/playlist/${playlist}/${currentTrack}?action=skip`);
			this.classList.remove('loading');
		});
	}
}


customElements.define('next-form', NextForm, { extends: "form" });
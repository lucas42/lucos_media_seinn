/**
 * Banner displayed when the service worker cache enters a thrash state —
 * more evictions per unit time than normal play cadence can explain.
 *
 * The banner prompts the user to reload so the SW re-registers with a clean
 * CacheStorage state.  The "Reload" button unregisters all SW registrations
 * before reloading, ensuring stale cached data is cleared.
 *
 * Accessibility: the inner container carries role="alert" so screen readers
 * announce the notification immediately on insertion.  Focus is moved to the
 * Reload button in connectedCallback so keyboard users can act right away.
 */
class CacheThrashBanner extends HTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({ mode: 'closed' });

		const style = document.createElement('style');
		style.textContent = `
			:host {
				display: block;
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				z-index: 9999;
				background: #8a0000;
				color: #fff;
				padding: 0.75em 1em;
				text-align: center;
				font-family: Geneva, Arial, sans-serif;
				box-shadow: 0 2px 8px rgba(0,0,0,0.5);
			}
			p {
				margin: 0 0 0.5em;
				font-weight: bold;
			}
			.actions {
				display: flex;
				gap: 0.5em;
				justify-content: center;
			}
			button {
				padding: 0.4em 1em;
				border: 2px solid #fff;
				background: transparent;
				color: #fff;
				cursor: pointer;
				font-size: 1em;
				border-radius: 3px;
			}
			button:hover,
			button:focus {
				background: rgba(255,255,255,0.15);
				outline: 2px solid #fff;
				outline-offset: 2px;
			}
		`;
		shadow.append(style);

		const container = document.createElement('div');
		container.setAttribute('role', 'alert');

		const message = document.createElement('p');
		message.textContent = "Music isn't playing — reload to fix it";
		container.append(message);

		const actions = document.createElement('div');
		actions.className = 'actions';

		const reloadButton = document.createElement('button');
		reloadButton.textContent = 'Reload';
		reloadButton.addEventListener('click', async () => {
			if ('serviceWorker' in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				for (const reg of registrations) {
					await reg.unregister();
				}
			}
			window.location.reload();
		});
		actions.append(reloadButton);

		const dismissButton = document.createElement('button');
		dismissButton.textContent = 'Dismiss';
		dismissButton.setAttribute('aria-label', 'Dismiss this notification');
		dismissButton.addEventListener('click', () => this.remove());
		actions.append(dismissButton);

		container.append(actions);
		shadow.append(container);

		this._reloadButton = reloadButton;
	}

	connectedCallback() {
		// Move focus to the Reload button so keyboard users can act immediately.
		this._reloadButton.focus();
	}
}

customElements.define('cache-thrash-banner', CacheThrashBanner);

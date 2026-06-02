/**
 * Banner displayed when the service worker cache enters a thrash state, or
 * when the client-side playback circuit breaker halts the auto-advance loop
 * after repeated errors.
 *
 * The banner prompts the user to either:
 *   - "Resume" — clears the circuit breaker and signals the manager to advance
 *     past the stalled track so playback can restart.
 *   - "Reload" — unregisters all SW registrations before reloading, ensuring
 *     stale cached data is cleared.
 *
 * Accessibility notes:
 * - role="alert" is on a <div> inside a closed shadow root.  Chrome's
 *   accessibility tree correctly pierces shadow boundaries for live regions,
 *   so this works in Chrome (the primary runtime).  NVDA + Firefox has a
 *   known issue with ARIA live regions inside shadow roots; aria-live on the
 *   host element is belt-and-suspenders coverage for other ATs (set in
 *   connectedCallback, not the constructor, per Custom Elements V1).
 * - Focus is moved to the Resume button in connectedCallback so keyboard
 *   users can act immediately.
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
				top: 30px;
				left: 0;
				right: 0;
				z-index: 9999;
				background: #c46000;
				color: #fff;
				padding: 0.75em 1em;
				text-align: center;
				font-family: inherit;
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
		message.textContent = "Music stopped due to repeated errors — resume to try again or reload to reset";
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

		const resumeButton = document.createElement('button');
		resumeButton.textContent = 'Resume';
		resumeButton.setAttribute('aria-label', 'Resume playback');
		resumeButton.addEventListener('click', () => {
			const channel = new BroadcastChannel('lucos_status');
			channel.postMessage('playback-resume');
			channel.close();
			this.remove();
		});
		actions.append(resumeButton);

		container.append(actions);
		shadow.append(container);

		this._resumeButton = resumeButton;
	}

	connectedCallback() {
		// Belt-and-suspenders: expose the live region at the host level so
		// assistive technologies that don't pierce shadow DOM pick it up too.
		// Must be set here (not in the constructor) — Custom Elements V1 forbids
		// setAttribute in the constructor (it would throw when the element is
		// created via document.createElement).
		this.setAttribute('aria-live', 'assertive');
		this.setAttribute('aria-atomic', 'true');
		// Move focus to the Resume button so keyboard users can act immediately.
		this._resumeButton.focus();
	}
}

customElements.define('cache-thrash-banner', CacheThrashBanner);

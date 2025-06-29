class LyricViewer extends HTMLElement {
	static get observedAttributes() {
		return ['lyrics'];
	}
	constructor() {
		super();

		const component = this;
		const shadow = component.attachShadow({mode: 'closed'});
		const style = document.createElement('style');
		style.textContent = `
			:host {
				position: absolute;
				top: 34px;
				bottom: 10px;
				right: 10px;
				left: 10px;
				border: solid black;
				border-radius: 20px;
				background-color: rgba(255,255,255,0.97);
				color: black;
				display: flex;
				flex-flow: column;
			}
			.hideButton {
				margin: 2px;
				background: #900;
				color: #fff;
				padding: 6px 15px;
				border-radius: 15px 0 0;
				position: absolute;
				left: 0;
			}
			h3 {
				margin: 6px;
			}
			.lyrics {
				white-space: pre-line;
				overflow: auto;
			}
		`;
		shadow.append(style);

		const topBar = document.createElement("div");

		const hideButton = document.createElement("button");
		hideButton.classList.add("hideButton");
		hideButton.addEventListener("click", event => {
			event.stopPropagation();
			component.hidden = true;
		});
		hideButton.append(document.createTextNode("Hide"));
		topBar.append(hideButton);

		const title = document.createElement("h3");
		title.append(document.createTextNode("Lyrics"));
		topBar.append(title);

		shadow.append(topBar);

		const lyricText = document.createTextNode(component.getAttribute("lyrics"));
		const lyricNode = document.createElement("span");
		lyricNode.classList.add("lyrics");
		lyricNode.append(lyricText);
		shadow.append(lyricNode);

		component.setLyrics = lyrics => {
			if (lyrics) {
				lyricText.nodeValue = lyrics;
			} else {
				lyricText.nodeValue = "No lyrics available for this track";
				component.hidden = true;
			}

			// Replace the lyricNode in the DOM to reset scroll position (even works when node is hidden, unlike setting .scrollTop)
			shadow.replaceChild(lyricNode, lyricNode);
		}

		// Close the component when escape button is pressed
		document.addEventListener('keyup', e => {
			if (e.key === "Escape") component.hidden = true;
			if (e.key === "l") component.hidden = !component.hidden;
		}, false);
	}
	attributeChangedCallback(name, oldValue, newValue) {
		switch (name) {
			case "lyrics":
				if (oldValue != newValue) this.setLyrics(newValue);
				break;
		}
	}
}

customElements.define('lyric-viewer', LyricViewer);
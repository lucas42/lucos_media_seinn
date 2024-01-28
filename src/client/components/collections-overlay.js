import { listenExisting } from 'lucos_pubsub';
import { post } from '../../classes/manager.js';

class CollectionsOverlay extends HTMLElement {
	constructor() {
		super();
		const component = this;
		const shadow = component.attachShadow({mode: 'open'});
		const overlay = document.createElement("div");
		overlay.id = "overlay";
		const container = document.createElement("div");
		overlay.append(container);
		overlay.addEventListener("click", event => {
			component.style.display = "none";
		});
		container.addEventListener("click", event => event.stopPropagation());
		container.addEventListener("keyup", event => event.stopPropagation());
		shadow.append(overlay);
		const collectionList = document.createElement("ul");
		container.append(collectionList);
		listenExisting("managerData", data => {
			while (collectionList.firstChild) {
				collectionList.removeChild(collectionList.lastChild);
			}

			data.collections.forEach(collection => {
				const item = document.createElement("li");
				item.dataset.slug = collection.slug;
				item.dataset.isCurrent = collection.isCurrent;
				const nameSpan = document.createElement("span");
				nameSpan.append(document.createTextNode(collection.name));
				item.append(nameSpan);
				const trackCount = document.createElement("span");
				trackCount.append(document.createTextNode("["+collection.totalTracks+" tracks]"));
				trackCount.classList.add("track-count");
				item.append(trackCount);

				const editForm = document.createElement("form");
				editForm.setAttribute("target", "_blank");
				editForm.setAttribute("method", "get");
				editForm.setAttribute("action", collection.editurl);
				const editSubmit = document.createElement("input");
				editSubmit.type = "submit";
				editSubmit.value = "✎";
				editSubmit.title = "Edit collection "+collection.name;
				editForm.append(editSubmit);
				item.append(editForm);

				const play = document.createElement("input");
				play.type = "button";
				play.value = "▶";
				play.title = "Play tracks from "+collection.name;
				play.addEventListener("click", event => {
					post("collection",{ slug: collection.slug });
				});
				item.append(play);

				collectionList.append(item);
			});
			const clearItem = document.createElement("li");
			clearItem.classList.add("clear-collection");
			const nameSpan = document.createElement("span");
			nameSpan.append(document.createTextNode("Clear Collection"));
			clearItem.append(nameSpan);

			const clearButton = document.createElement("input");
			clearButton.type = "button";
			clearButton.value = "⏹";
			clearButton.title = "Clear current collection and play tracks from whole library";
			clearButton.addEventListener("click", event => {
				post("collection",{ slug: "" });
			});
			clearItem.append(clearButton);

			collectionList.append(clearItem);
		});
		const style = document.createElement('style');
		style.textContent = `

		#overlay {
			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			right: 0;
			background: rgba(100, 100, 100, 0.7);
			color: #000;
			z-index: 5000;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		#overlay > div {
			padding: 2em;
			background: rgba(255,255,255,0.9);
			border: solid #502;
			border-top-width: 10px;
			border-radius: 10px;
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		li {
			display: flex;
		}
		li > span {
			align-self: center;
		}
		li.clear-collection > span {
			font-weight: bold;
			flex-grow: 1;
		}
		li.clear-collection > input {
			font-size: 19px;
			color: #502;
			border-color: #502;
		}
		.track-count{
			font-size: 10px;
			flex-grow: 1;
			padding: 0 10px 0 6px;
			align-self: center;
			font-style: italic;
		}
		li > form >input {
			height: 100%; // Only makes a difference if there's any multi-line items showing
		}
		li[data-is-current=true] {
			border: solid #502 3px;
			margin: 0 -4px 0 -6px;
			padding: 0 0 0 3px;
		}
		`;
		shadow.prepend(style);
	}
}

customElements.define('collections-overlay', CollectionsOverlay);

const overlay = document.createElement("collections-overlay");
overlay.style.display = "none";
const showOverlay = document.createElement("input");
showOverlay.type = "button";
showOverlay.value = "Collections";
showOverlay.addEventListener("click", event => {
	event.stopPropagation();
	overlay.style.display = "block";
});
const control = document.createElement("li");
control.appendChild(showOverlay);
document.getElementById('controls').appendChild(control);
document.body.append(overlay);
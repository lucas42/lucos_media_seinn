import { listenExisting } from 'lucos_pubsub';
import { put } from '../../classes/manager.js';

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

		const title = document.createElement("h3");
		title.append(document.createTextNode("Collections"));
		container.append(title);

		const editLink = document.createElement("a");
		editLink.append(document.createTextNode("✎"));
		editLink.title = "Edit Collections";
		editLink.target = "_blank";
		editLink.href = "https://media-metadata.l42.eu/collections";
		title.append(editLink);

		const collectionList = document.createElement("ul");
		container.append(collectionList);
		listenExisting("managerData", data => {
			while (collectionList.firstChild) {
				collectionList.removeChild(collectionList.lastChild);
			}

			const clearItem = document.createElement("li");
			clearItem.classList.add("clear-collection");
			clearItem.dataset.isCurrent = (data.currentCollectionSlug === "all");
			const nameSpan = document.createElement("span");
			nameSpan.append(document.createTextNode("🌐 All Tracks"));
			clearItem.append(nameSpan);

			clearItem.title = "Play tracks from whole library";
			if (data.currentCollectionSlug !== "all") {
				clearItem.addEventListener("click", async event => {
					clearItem.dataset.loading = "true";
					await put("v3/current-collection", "all");
				});
			}
			collectionList.append(clearItem);

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

				item.title = "Play tracks from "+collection.name;
				if (!collection.isCurrent) {
					item.addEventListener("click", async event => {
						item.dataset.loading = "true";
						await put("v3/current-collection", collection.slug);
					});
				}
				collectionList.append(item);
			});
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
			padding: 1.5em;
			background: rgba(255,255,255,0.9);
			border: solid #502;
			border-top-width: 10px;
			border-radius: 10px;
			overflow: auto;
			max-width: 350px;
			max-height:88%;
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		li {
			display: flex;
			border: solid transparent 3px;
			cursor: pointer;
			padding: 0 0 0 3px;
		}
		li > span {
			align-self: center;
		}
		li.clear-collection > span {
			font-weight: bold;
			flex-grow: 1;
			line-height: 2em;
		}
		.track-count{
			font-size: 10px;
			flex-grow: 1;
			padding: 0 10px 0 6px;
			align-self: center;
			font-style: italic;
		}
		li:hover {
			border-color: #328cff;
		}
		li[data-is-current=true] {
			border-color: #502;
			cursor: default;
		}
		li[data-loading=true] {
			background: #328cff;
		}
		h3 {
			margin-top: 0;
		}
		h3 a {
			font-size: smaller;
			margin-left: 0.3em;
			vertical-align: super;
			text-decoration: none;
			color: #502;
		}
		h3 a:hover {
			color: #328cff;
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
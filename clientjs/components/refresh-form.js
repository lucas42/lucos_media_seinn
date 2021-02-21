class RefreshForm extends HTMLFormElement {
	/** 
	 * If the browser has got as far as loading web-components,
	 * then there's no need for this button any more,
	 * as other components will update automatically
	 **/
	constructor() {
		super();
		const li = this.parentNode;
		li.parentNode.removeChild(li);
	}
}


customElements.define('refresh-form', RefreshForm, { extends: "form" });
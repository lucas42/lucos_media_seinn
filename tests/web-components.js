import { JSDOM } from 'jsdom';
import assert from 'assert';
import { describe, it } from 'mocha';
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

// Required for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only works in Node >= v14.6.0 with --expose-gc
if (typeof global.gc !== 'function') {
	throw new Error('Run the test with --expose-gc flag: node --expose-gc ./node_modules/mocha/bin/mocha');
}

// Load tag names from file names in ../src/client/components
const componentsDir = path.join(__dirname, "../src/client/components");

const componentTags = fs.readdirSync(componentsDir)
	.filter(f => f.endsWith(".js"))
	.map(f => f.replace(/\.js$/, ""));

// Shared JSDOM instance for component registration
const bootstrapDOM = new JSDOM(``, {
	url: "http://localhost/",
	runScripts: "dangerously",
	resources: "usable",
});

// Inject DOM globals into Node.js (HTMLElement, HTMLFormElement, etc.)
global.window = bootstrapDOM.window;
global.document = bootstrapDOM.window.document;
global.HTMLElement = bootstrapDOM.window.HTMLElement;
global.HTMLFormElement = bootstrapDOM.window.HTMLFormElement;
global.customElements = bootstrapDOM.window.customElements;
global.Node = bootstrapDOM.window.Node;
global.Event = bootstrapDOM.window.Event;

/**
 * Hacky workaround for components which call `querySelector`
 * JSDom's implementation of `querySelector` persists various references under the hood, so replace it with a no-op function
 **/
global.window.Element.prototype.querySelector = () => null;
global.window.Document.prototype.querySelector = () => null;

// Stub AudioContext to prevent ReferenceError
global.AudioContext = class {
	constructor() {
		this.sampleRate = 44100;
	}
	close() {}
	resume() {}
	createGain() {
		return { 
			gain: { value: 1 },
			connect: destination => {return null},
		};
	}
};

describe("Web Component Garbage Collection Test", function () {
	const gcLimitInSeconds = 3;
	this.timeout((1 + gcLimitInSeconds)*1000); // Allow enough time for module import and Garbage Collection

	for (const tag of componentTags) {
		it(`Should allow <${tag}> to be garbage collected`, done => {
			let timeoutId;
			(async () => {
				let resolveDone;
				const waitUntilDone = new Promise(r => resolveDone = r); // Use of a promise here, rather than relying on timeouts keeps node in an idle state, so garbage collection has a better chance to run

				const modulePath = path.resolve(componentsDir, `${tag}.js`);
				await import(pathToFileURL(modulePath).href);

				const registry = new FinalizationRegistry(() => {
						clearTimeout(timeoutId);
						resolveDone();
						done();
				});
				const constructor = customElements.get(tag);
				if (!constructor) throw new Error(`Can't get constructor for element <${tag}>`);
				let element = new constructor();
				document.body.appendChild(element);
				document.body.removeChild(element);

				registry.register(element, tag);
	
				timeoutId = setTimeout(() => {
						done(new Error(`<${tag}> element was not garbage collected in ${gcLimitInSeconds} seconds`));
				}, gcLimitInSeconds*1000);

				// Remove reference
				element = null;

				setTimeout(() => {
					global.gc();
				}, 0);
				await waitUntilDone;
			})().catch(error => {
				if (timeoutId) clearTimeout(timeoutId);
				done(error);
			});
		});
	};
});

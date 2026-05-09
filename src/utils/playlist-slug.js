import { listenExisting } from 'lucos_pubsub';

let currentPlaylistSlug = null;

listenExisting('managerData', data => {
	currentPlaylistSlug = data.currentCollectionSlug;
});

/**
 * Returns the slug of the current playlist fetcher, as last received from the manager.
 * Used to build /v3/playlist/{slug}/... API paths.
 */
export function getPlaylistSlug() {
	return currentPlaylistSlug;
}

export default { getPlaylistSlug };

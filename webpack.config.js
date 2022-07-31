import { URL } from 'url';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import { hashElement } from 'folder-hash';
export default async () => {
	return {
		entry: {
			'v3': './src/client/index.js',
			'serviceworker-v3': './src/service-worker/index.js',
		},
		output: {
			filename: '[name].js',
			path: new URL('./src/public/', import.meta.url).pathname,
		},
		plugins: [
			// Get the hashes of all the resources & templates to embed in a comment in service worker
			new webpack.BannerPlugin({
				banner: `Resource Hash: ${(await hashElement("./src/public")).hash}`,
				include: 'serviceworker',
			}),
		],
		optimization: {
			// Stop the terser plugin messing with the banner plugin
			minimizer: [new TerserPlugin({
				extractComments: false,
			})],
		},
		mode: 'production',
	};
};
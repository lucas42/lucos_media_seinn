import { URL } from 'url';
import webpack from 'webpack';
import MinimizerPlugin from 'minimizer-webpack-plugin';
import { hashElement } from 'folder-hash';
export default async () => {
	return {
		entry: {
			'v3': './src/client/index.js',
			'serviceworker-v3': './src/service-worker/index.js',
		},
		output: {
			filename: '[name].js',
			path: new URL('./src/resources/', import.meta.url).pathname,
		},
		plugins: [
			// Get the hashes of all the resources & templates to embed in a comment in service worker
			new webpack.BannerPlugin({
				banner: `Resource Hash: ${(await hashElement("./src/resources")).hash}\nClient JS Hash: ${(await hashElement("./src/client")).hash}`,
				include: 'serviceworker',
			}),
		],
		optimization: {
			// Stop the minimizer plugin messing with the banner plugin
			// extractComments defaults to true in minimizer-webpack-plugin — keep false to avoid
			// stripping banner comments that the service worker depends on for resource hashes
			minimizer: [new MinimizerPlugin({
				extractComments: false,
			})],
		},
		devtool: 'source-map',
		mode: 'production',
	};
};
const GoogleFontsPlugin = require('@beyonk/google-fonts-webpack-plugin');

module.exports = {
	chainWebpack: config => config.resolve.symlinks(false),
	// transpileDependencies: [
	//   // 'node_modules/quill'
	//   /\/node_modules\/quill\//
	// ]
	pluginOptions: {
		webpackBundleAnalyzer: {
			openAnalyzer: false,
		},
	},
	configureWebpack: {
		plugins: [
			new GoogleFontsPlugin({
				fonts: [
					{ family: 'Open Sans', variants: ['300', '400', '600', '700'] },
				],
			}),
		],
	},
	css: {
		loaderOptions: {
			sass: {
				data: `
					@import "@/n8n-theme-variables.scss";
				`,
			},
		},
	},
};

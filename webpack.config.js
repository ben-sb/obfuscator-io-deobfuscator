const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    entry: './src/webpackEntry.ts',
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    output: {
        filename: 'deobfuscator.js',
        path: path.resolve(__dirname, 'webpack'),
        library: 'deobfuscator'
    },
    plugins: [
        /* Fixes dependencies using process.env.X */
        new webpack.DefinePlugin({
            process: {
                env: {}
            }
        })
    ],
    /** This fixes special characters in dependencies getting broken */
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: { output: { ascii_only: true } }
            })
        ]
    },
    ignoreWarnings: [/Can't resolve 'coffee-script'/]
};

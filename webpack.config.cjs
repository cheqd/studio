const path = require('path')
const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'worker.js',
    path: path.join(__dirname, 'dist'),
  },
  devtool: 'cheap-module-source-map',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
            allowTsInNodeModules: true
          // transpileOnly is useful to skip typescript checks occasionally:
          // transpileOnly: true,
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
        Buffer: [ 'buffer', 'Buffer' ],
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        path: 'path-browserify',
        fs: 'browserify-fs',
        process: 'process/browser.js'
    }),
  ],
  resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      fallback: {
          buffer: require.resolve('buffer'),
          crypto: require.resolve('crypto-browserify'),
          stream: require.resolve('stream-browserify'),
          path: require.resolve('path-browserify'),
          fs: require.resolve('browserify-fs'),
          process: require.resolve('process/browser.js')
      },
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          compress: true
        }
      })
    ]
  }
}

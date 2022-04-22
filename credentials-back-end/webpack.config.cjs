const path = require('path')
const webpack = require('webpack')

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'worker.js',
    path: path.join(__dirname, 'dist'),
  },
  devtool: 'cheap-module-source-map',
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
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
    }),
  ],
  resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      fallback: {
          buffer: require.resolve('buffer'),
          crypto: require.resolve('crypto-browserify'),
          stream: require.resolve('stream-browserify'),
          path: require.resolve('path-browserify'),
      },
  },
}

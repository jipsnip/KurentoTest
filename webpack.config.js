var HTMLWebpackPlugin = require('html-webpack-plugin');
var path = require('path');
var HTMLWebpackPluginConfig = new HTMLWebpackPlugin({
  template: path.resolve(__dirname + '/app/index.html'),
  filename: 'index.html',
  inject: 'body'
});

module.exports = {
  mode: 'development',
  performance: {
    hints: false
  },
  entry: [
    path.resolve(__dirname + '/app/index.js')],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        loaders: ["babel-loader"],
      }
    ]
  },
  output: {
    filename: 'transformed.js',
    publicPath: '/',
    path: path.resolve(__dirname + '/build')
  },
  plugins: [
    HTMLWebpackPluginConfig],
  devServer: {
    contentBase: path.join(__dirname, '/build'),
    compress: true,
    port: 3000,
    historyApiFallback: true,
    quiet: false
  }
};
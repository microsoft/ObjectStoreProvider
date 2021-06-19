var path = require("path");
var webpack = require("webpack");
var NodePolyfillPlugin = require("node-polyfill-webpack-plugin")

var webpackConfig = {
  entry: "./src/tests/ObjectStoreProvider.spec.ts",

  output: {
    filename: "./ObjectStoreProvider.spec.js",
  },

  externals: ["fs"],
  resolve: {
    modules: [path.resolve("./src"), path.resolve("./node_modules")],
    extensions: [".ts", ".tsx", ".js"],
  },

  module: {
    rules: [
      {
        // Compile TS.
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: "ts-loader",
      },
    ]
  },
  plugins: [
    new NodePolyfillPlugin()
  ],
  mode: "development",
};

module.exports = webpackConfig;

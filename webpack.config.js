var path = require("path");
var webpack = require("webpack");
var NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

var webpackConfig = {
  entry: {
    ObjectStoreProvider: "./src/tests/ObjectStoreProvider.spec.ts",
    SortedBTree: "./src/tests/SortedBTree.spec.ts",
    LogWriter: "./src/tests/LogWriter.spec.ts",
  },

  output: {
    filename: "[name].spec.js",
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
    ],
  },
  plugins: [new NodePolyfillPlugin()],
  mode: "development",
};

module.exports = webpackConfig;

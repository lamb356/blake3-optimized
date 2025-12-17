const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = [
  // Full bundle (blake3 + bao)
  {
    entry: './index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'blake3-bao.min.js',
      library: {
        name: 'blake3Bao',
        type: 'umd'
      },
      globalObject: 'this'
    },
    mode: 'production',
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            passes: 2
          },
          mangle: true,
          output: {
            comments: false
          }
        },
        extractComments: false
      })]
    },
    resolve: {
      fallback: {
        "crypto": false,
        "buffer": false
      }
    }
  },
  // BLAKE3 only bundle
  {
    entry: './blake3.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'blake3.min.js',
      library: {
        name: 'blake3',
        type: 'umd'
      },
      globalObject: 'this'
    },
    mode: 'production',
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({
        terserOptions: {
          compress: { drop_console: true, passes: 2 },
          mangle: true,
          output: { comments: false }
        },
        extractComments: false
      })]
    }
  },
  // Bao only bundle
  {
    entry: './bao.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bao.min.js',
      library: {
        name: 'bao',
        type: 'umd'
      },
      globalObject: 'this'
    },
    mode: 'production',
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({
        terserOptions: {
          compress: { drop_console: true, passes: 2 },
          mangle: true,
          output: { comments: false }
        },
        extractComments: false
      })]
    }
  }
];

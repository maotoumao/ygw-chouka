const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');


module.exports = {
    mode: 'development',
    entry: path.join(__dirname, '/src/index.ts'),
    output: {
        filename: 'bundle.js',
        path: path.join(__dirname, 'dist')
    },

    module: {
        rules: [
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"]
            },
            {
                test: /\.ts$/,
                use: ['ts-loader'],
                exclude: /node_modules/
            },
            {
                test: /\.(png|jpg)$/,
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            name: 'assets/imgs/[name].[hash:8].[ext]',
                            publicPath: '/'
                        }
                    }
                ]
            }
        ]
    },

    plugins: [
        new HtmlWebpackPlugin({
            template: path.join(__dirname, 'src', 'index.html'),
            filename: 'index.html'
        })
    ],
    devServer: {
        port: '6688',
        contentBase: path.join(__dirname, 'dist')
    },
    resolve: {
        extensions: ['.ts', '.js']
    }


}
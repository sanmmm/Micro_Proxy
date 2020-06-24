import express, { urlencoded, json } from 'express';
import http from 'http'
import compression from 'compression'
import color from 'colors/safe'
import reactViews from 'express-react-views'
import morgan from 'morgan'
import path from 'path'

import injectedConfigs, { EditableConfigs } from 'getSettings'
import { session } from 'controller/middlewares'
import registerAppRoute from 'controller/api'
import schedule from 'controller/schedule'
import { init as ModelInit } from 'models/model'

const app = express()
app.use(morgan('tiny'))
app.use(compression())
app.use(urlencoded())
app.use(json())
app.use(session)

const viewDir = path.join(__dirname, './frontend/views')
app.set('views', viewDir);
if (!injectedConfigs.IS_PRODUCTION_MODE) {
    app.set('view engine', 'tsx')
    app.engine('tsx', reactViews.createEngine({
        beautify: true,
        babel: {
            presets: ['@babel/preset-env',
                '@babel/preset-react',
                ['@babel/preset-typescript', {
                    isTSX: true,
                    allExtensions: true,
                }],
            ],
            plugins: [
                ["module-resolver", {
                    "root": [viewDir],
                    "alias": {
                      "@": __dirname,
                    }
                }]
            ],
            extensions: ['.tsx', '.ts'],
        },
        transformViews: true,
    }))
} else {
    // app.set('view engine', 'js')
    // app.engine('js', reactViews.createEngine({
    //     beautify: true,
    //     // babel: { presets: ['@babel/preset-env', '@babel/preset-typescript', '@babel/preset-react'] }
    //     // transformViews: false,
    // }));
}

registerAppRoute(app)

const server = http.createServer(app)

async function start() {
    await ModelInit()
    server.listen(injectedConfigs.CRAWL_POOL_ADMIN_CLIENT_PORT, () => {
        console.log(color.green(`the server is running on: ${injectedConfigs.CRAWL_POOL_ADMIN_CLIENT_PORT}`))
    })

    const isOnlyAdminClient = !!injectedConfigs.CRAWL_POOL_ADMIN_SERVER_URL
    if (!isOnlyAdminClient) {
        const { SERVER_RUNNING } = EditableConfigs.getConfig('proxyPoolServer')
        if (SERVER_RUNNING) {
            schedule.start()
        }
    }
}

start()
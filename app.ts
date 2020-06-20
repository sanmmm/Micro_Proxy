import express, {urlencoded, json} from 'express';
import http from 'http'
import compression from 'compression'
import color from 'colors/safe'
import reactViews from 'express-react-views'
import path from 'path'

import injectedConfigs from 'getSettings'
import {session} from 'controller/middlewares'
import registerApiRoute from 'controller/api'
import {init as ModelInit} from 'models/model'

const app = express()
app.use(compression())
app.use(urlencoded())
app.use(json())
app.use(session)

app.set('views', path.join(__dirname, './frontend/views'));
if (!injectedConfigs.IS_PRODUCTION_MODE) {
    app.set('view engine', 'tsx')
    app.engine('tsx', reactViews.createEngine({
        transformViews: false,
    }));
} else {
    app.set('view engine', 'js')
    app.engine('js', reactViews.createEngine({
        transformViews: false,
    }));
}

registerApiRoute(app)

app.get('/proxylist', (req, res) => {
    res.render('index')
})

const server = http.createServer(app)

async function start () {
    await ModelInit()
    server.listen(injectedConfigs.CRAWL_POOL_SERVER_PORT, () => {
        console.log(color.green(`the server is running on: ${injectedConfigs.CRAWL_POOL_SERVER_PORT}`))
    })
}

start()



import express from 'express'
import expressSesion from 'express-session'
import {EventEmitter} from 'events'

import {catchError, generateRedisKey} from 'utils'
import * as store from 'lib/store'
import injectedConfigs from 'getSettings';


const SessionStoreCatchError = catchError('sessionStore', (e, cb, ...args) => {
    const callBack = args.pop()
    if (callBack) {
        callBack(e)
    }
})

const getSessionStoreKey = (sid: string) => generateRedisKey(`session-${sid}`)

class SessionStoreExtendFuns {
    @SessionStoreCatchError
    static async destroy (sid: string, cb: (e?: Error) => any) {
        await store.Store.DEL(getSessionStoreKey(sid))
        cb()
    }

    @SessionStoreCatchError
    static async set (sid: string, session: any, cb: (e?: Error) => any) {
        await store.Store.SET(getSessionStoreKey(sid), session)
        cb()
    }

    @SessionStoreCatchError
    static async get (sid: string, cb: (e: Error, session: any) => any) {
        const data = await store.Store.GET(getSessionStoreKey(sid))
        cb(null, data)
    }
}

class SessionStore extends expressSesion.Store {
    constructor (options) {
        super(options)
    }
    destroy = SessionStoreExtendFuns.destroy;
    set = SessionStoreExtendFuns.set;
    get = SessionStoreExtendFuns.get;
}


export function session (req: express.Request, res: express.Response, next: express.NextFunction) {
    expressSesion({
        secret: injectedConfigs.CRAWL_POOL_ADMIN_SESSION_SECRET,
        store: new SessionStore({}),
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 30,
            httpOnly: true,
        }
    })(req, res, next)
}

export function isAdmin (req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.session.isAdmin) {
        next()
    } else {
        res.json({
            code: 1,
            msg: 'unauthorized'
        })
    }
}
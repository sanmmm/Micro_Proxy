import Redis from 'ioredis'

import { SortedMap, SortedSet, generateRedisKey } from 'utils';
import settings from 'getSettings'

let redisCli = settings.REDIS_SERVER && new Redis(settings.REDIS_SERVER)

if (redisCli) {
    redisCli.select(1)
}

const isRedisMode = !!redisCli

const storage = new Map<string, any>()

function getKeyValue<T = any>(key: string, initialValue?: T) {
    const value = storage.get(key)
    if (!value) {
        storage.set(key, initialValue)
    }
    return (value || initialValue) as T
}

class StoreModel {
    async SET(key: string, value: any, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async SET(key: string, value: any): Promise<any>;
    async SET(key: string, value: any, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            const args = [key, JSON.stringify(value)]
            if (pipeline) {
                return pipeline.set.apply(pipeline, args)
            } else {
                await redisCli.set.apply(redisCli, args)
            }
        } else {
            storage.set(key, value)
        }
    }
    async GET(key: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async GET(key: string): Promise<any>;
    async GET(key: string, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            const args = [key]
            if (pipeline) {
                return pipeline.get.apply(pipeline, args)
            } else {
                const resStr = await redisCli.get.apply(redisCli, args)
                return JSON.parse(resStr)
            }
        } else {
            return storage.get(key)
        }
    }
    async DEL(key: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async DEL(key: string): Promise<any>;
    async DEL(key: string, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.del(key)
            }
            await redisCli.del(key)
        } else {
            storage.delete(key)
        }
    }
    async SADD<T = any>(key: string, value: T, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async SADD<T = any>(key: string, value: T): Promise<any>;
    async SADD<T = any>(key: string, value: T, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.sadd(key, JSON.stringify(value))
            }
            await redisCli.sadd(key, JSON.stringify(value))
        } else {
            const set = getKeyValue(key, new Set<T>())
            set.add(value)
        }
    }
    async SREM<T = any>(key: string, value: T, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async SREM<T = any>(key: string, value: T): Promise<any>;
    async SREM<T = any>(key: string, value: T, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.srem(key, JSON.stringify(value))
            }
            await redisCli.srem(key, JSON.stringify(value))
        } else {
            const set = getKeyValue(key, new Set())
            set.delete(value)
        }
    }
    async SMEMBERS<T = any>(key: string): Promise<T[]> {
        if (isRedisMode) {
            let cursor = 0
            const itemSet = new Set<T>()
            do {
                const [nextCursor, strItems] = await redisCli.sscan(key, cursor, 'count', 500)
                cursor = Number(nextCursor)
                strItems.forEach(str => itemSet.add(JSON.parse(str)))
            } while (!isNaN(cursor) && cursor !== 0)
            return Array.from(itemSet)
        } else {
            return Array.from(getKeyValue(key, new Set()))
        }
    }
    async HSET<T = any>(key: string, feildName: string, feildValue: T, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>
    async HSET<T = any>(key: string, feildName: string, feildValue: T): Promise<any>;
    async HSET<T = any>(key: string, feildName: string, feildValue: T, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            const res = (pipeline || redisCli).hset(key, feildName, JSON.stringify(feildValue))
            if (pipeline) {
                return res
            }
            await res
        } else {
            const map = getKeyValue(key, new Map())
            map.set(feildName, feildValue)
        }
    }
    async HDEL(key: string, feildName: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async HDEL(key: string, feildName: string): Promise<any>;
    async HDEL(key: string, feildName: string, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            const res = (pipeline || redisCli).hdel(key, feildName)
            if (pipeline) {
                return res
            }
            await res
        } else {
            const map = getKeyValue(key, new Map())
            map.delete(feildName)
        }
    }
    async HGETALL<T = any>(key: string): Promise<{key: string, value: T}[]> {
        if (isRedisMode) {
            const items: {key: string, value: T}[] = []
            const map = new Map<string, T>()
            let cursor = 0
            do {
                const [nextCursor, strItems] = await redisCli.hscan(key, cursor, 'count', 500)
                cursor = Number(nextCursor)
                for (let i = 0; i < strItems.length; i += 2) {
                    const [key, valueStr] = strItems.slice(i, i + 2)
                    items.push({
                        key,
                        value: JSON.parse(valueStr),
                    })
                }
            } while (!isNaN(cursor) && cursor !== 0)
            return items
        } else {
            const map = getKeyValue(key, new Map())
            const items = []
            map.forEach((value, key) => items.push({
                key,
                value
            }))
            return items
        }
    }    
    async HGET<T = any>(key: string, feildName: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>
    async HGET<T = any>(key: string, feildName: string): Promise<T>;
    async HGET<T = any>(key: string, feildName: string, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            const res = (pipeline || redisCli).hget(key, feildName)
            if (pipeline) {
                return res
            }
            const value = await res
            return JSON.parse(value as string) as T
        } else {
            const map = getKeyValue(key, new Map<string, T>())
            return map.get(feildName)
        }
    }
    async HLEN(key: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>
    async HLEN(key: string): Promise<number>;
    async HLEN(key: string, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.hlen(key)
            } else {
                return redisCli.hlen(key)
            }
        } else {
            const map = getKeyValue(key, new Map())
            return map.size
        }
    }
    async HEXISTS(key: string, feildName: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>
    async HEXISTS(key: string, feildName: string): Promise<number>;
    async HEXISTS(key: string, feildName: string, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.hexists(key, feildName)
            } else {
                return redisCli.hexists(key, feildName)
            }
        } else {
            const map = getKeyValue(key, new Map())
            return Number(map.has(feildName))
        }
    }
    async ZADD<T = any>(key: string, score: number, member: T, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZADD<T = any>(key: string, score: number, member: T): Promise<any>;
    async ZADD<T = any>(key: string, score: number, member: T, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.zadd(key, score as any, JSON.stringify(member))
            }
            await redisCli.zadd(key, score, JSON.stringify(member))
        } else {
            const sortedSet = getKeyValue(key, new SortedSet())
            sortedSet.sadd(member, score)
        }
    }
    async ZREM<T = any>(key: string, member: T, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZREM<T = any>(key: string, member: T): Promise<any>;
    async ZREM<T = any>(key: string, member: T, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.zrem(key, JSON.stringify(member))
            }
            await redisCli.zrem(key, JSON.stringify(member))
        } else {
            const sortedSet: SortedSet<T> = getKeyValue(key, new SortedSet())
            sortedSet.sremove(member)
        }
    }
    async ZINCRBY(key: string, increment: number, member, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZINCRBY(key: string, increment: number, member): Promise<number>;
    async ZINCRBY(key: string, increment: number, member, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.zincrby(key, increment, JSON.stringify(member))
            }
            return JSON.parse(await redisCli.zincrby(key, increment, JSON.stringify(member)))
        } else {
            const sortedSet = getKeyValue(key, new SortedSet())
            // TODO member 序列化
            const nowScore = sortedSet.sscore(member)
            const newScore = nowScore + increment
            sortedSet.sadd(member, newScore)
            return newScore
        }
    }
     // range by rank
     async ZRANGE<T = any>(key: string, min: number, max: number, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
     async ZRANGE<T = any>(key: string, min: number, max: number): Promise<T[]>;
     async ZRANGE<T = any>(key: string, min: number, max: number, pipeline?: Redis.Pipeline) {
         if (!isRedisMode) {
             const sortedSet = getKeyValue(key, new SortedSet<T>())
             return sortedSet.srange(min, max)
         }
         if (pipeline) {
             return pipeline.zrange(key, min, max)
         } else {
             return await redisCli.zrange(key, min, max)
         }
     }
    async ZRANGEBYSCORE<T = any>(key: string, min: number, max: number, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZRANGEBYSCORE<T = any>(key: string, min: number, max: number): Promise<T[]>;
    async ZRANGEBYSCORE<T = any>(key: string, min: number, max: number, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.zrangebyscore(key, min, max)
            }
            const arr = await redisCli.zrangebyscore(key, min, max)
            return arr.map(str => JSON.parse(str))
        } else {
            const sortedSet: SortedSet<T> = getKeyValue(key, new SortedSet())
            return sortedSet.srangeByScore(min, max)
        }
    }
    async ZREMOVEBYSCORE<T = any>(key: string, min: number, max: number, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZREMOVEBYSCORE<T = any>(key: string, min: number, max: number): Promise<any>;
    async ZREMOVEBYSCORE<T = any>(key: string, min: number, max: number, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.zremrangebyscore(key, min, max)
            }
            await redisCli.zremrangebyscore(key, min, max)
        } else {
            const sortedSet: SortedSet<T> = getKeyValue(key, new SortedSet())
            sortedSet.sremoveByScore(min, max)
        }
    }
    async ZSCORE (key: string, member: any, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZSCORE (key: string, member: any): Promise<number>;
    async ZSCORE (key: string, member: any, pipeline?: Redis.Pipeline) {
        if (!isRedisMode) {
            const sortedSet = getKeyValue(key, new SortedSet())
            return sortedSet.sscore(member)
        }

        if (pipeline) {
            return pipeline.zscore(key, JSON.stringify(member))
        } else {
            const scoreStr = await redisCli.zscore(key, JSON.stringify(member))
            return Number(scoreStr)
        }
    }
    async ZCOUNT (key: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZCOUNT (key: string ): Promise<number>
    async ZCOUNT (key: string, pipeline?: Redis.Pipeline) {
        if (!isRedisMode) {
            const sortedSet = getKeyValue(key, new SortedSet())
            return sortedSet.scount()
        }
        if (pipeline) {
            return pipeline.zcard(key)
        } else {
            return await redisCli.zcard(key)
        }
    }
    // count by score
    async ZCOUNTBYSCORE(key: string, min: number, max: number, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZCOUNTBYSCORE(key: string, min: number, max: number): Promise<number>;
    async ZCOUNTBYSCORE(key: string, min: number, max: number, pipeline?: Redis.Pipeline) {
        if (!isRedisMode) {
            const sortedSet = getKeyValue(key, new SortedSet())
            return sortedSet.scountByScore(min, max)
        }
        if (pipeline) {
            return pipeline.zcount(key, min, max)
        } else {
            return await redisCli.zcount(key, min, max)
        }
    }
    async ZSCAN<T = any>(key: string): Promise<{member: T, score: number}[]> {
        if (isRedisMode) {
            let cursor = 0
            const items: {member: T, score: number}[] = []
            do {
                const [nextCursor, strItems] = await redisCli.zscan(key, cursor, 'count', 500)
                cursor = Number(nextCursor)
                for (let i = 0; i < strItems.length; i += 2) {
                    const [memberStr, score] = strItems.slice(i, i + 2)
                    items.push({
                        member: JSON.parse(memberStr),
                        score: JSON.parse(score),
                    })
                }
            } while (!isNaN(cursor) && cursor !== 0)
            return items
        } else {
            const sortedSet = getKeyValue(key, new SortedSet<T>())
            return sortedSet.sscan()
        }
    }
   
}

const Store = new StoreModel()

type GetParams<T> = T extends (...args: infer P) => any ? P : any;

type PipelineInstance = {
    [key in keyof Omit<StoreModel, 'HGETALL' | 'ZSCAN' | 'SMEMBERS'>]: (...args: GetParams<StoreModel[key]>) => PipelineInstance
} & {
    exec: () => Promise<any[]>
}

function pipeline() {
    const toExecFunArr = []
    const pipeline = redisCli && redisCli.pipeline()
    return new Proxy<PipelineInstance>({} as any, {
        get(target, p, receiver) {
            if (p === 'exec') {
                return async () => {
                    if (isRedisMode) {
                        const resArr = await pipeline.exec()
                        return resArr.map(([err, res]) => {
                            if (err) {
                                throw err
                            }
                            if (typeof res === 'string') {
                                return JSON.parse(res)
                            } 
                            if (Array.isArray(res)) {
                                // TODO  withscore
                                return res.map(res => {
                                    return JSON.parse(res)
                                })
                            }
                            return res
                        })
                    } else {
                        return Promise.all(toExecFunArr.map(func => func()))
                    }
                }
            }

            const func = Reflect.get(Store, p).bind(Store)
            if (isRedisMode) {
                return (...args) => {
                    func(...args, pipeline)
                    return receiver
                }
            } else {
                return (...args) => {
                    toExecFunArr.push(func.bind(null, ...args))
                    return receiver
                }
            }
        }
    })
}

export {
    Store,
    pipeline,
    PipelineInstance,
}

async function test() {
    Store.SADD('test', 1)
    console.log(1)
    Store.SREM('test', 1)

    Store.DEL('test')

    Store.ZADD('test2', 1, 1)
    Store.ZADD('test2', 2, 2)
    // console.log(await Store.ZRENAGEBYSCORE('test2', 0, 1))
    // console.log(await Store.ZRENAGEBYSCORE('test2', 0, 2))
    // console.log(await Store.ZRENAGEBYSCORE('test2', 0, 3))
    Store.ZREM('test2', 1)
    // console.log(await Store.ZRENAGEBYSCORE('test2', 0, 3))

    Store.ZADD('testObj', 1, { v: 1 })
    Store.ZADD('testObj', 3, { v: 3 })
    Store.ZADD('testObj', 2, { v: 2 })
    console.log(await Store.ZRANGEBYSCORE('testObj', 1, 2))


}

// test()

async function testPipeline() {
    // redisCli = new Redis('redis://localhost')
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    const res = await pipeline().SADD('test', 1).SADD('test', 2).SADD('test', 3).SADD('test2', 1).exec()
    console.log(res)
    const res2 = await pipeline().HSET('hash', 'key', 'value').HSET('hash', 'key2', 'value2').exec()
    const res3 = await pipeline().HDEL('hash', 'key').HDEL('hash', 'key2').exec()

    const res4 = await pipeline().ZADD('zset', 1, 'one').ZADD('zset', 2, 2).exec()

    const res5 = await pipeline().ZADD('zset', 1, 'two').ZADD('zset', 2, 2).exec()

    const find = await Store.ZRANGEBYSCORE('zset', -1, 1)
    console.log(find)

}

// testPipeline()

async function testZadd() {
    await redisCli.pipeline().zadd('test123', 5 as any, '333').exec()
    console.log(await redisCli.zscore('test123', '333'))
}

// testZadd()

async function testZScan() {
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    const res5 = await pipeline().ZADD('zset2', 1, 'one').ZADD('zset2', 2, 'two').exec()
    const res = await Store.ZSCAN('zset2')
    console.log(res)
}

// testZScan()

async function testSmembers () {
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    await pipeline().SADD('sset', 1).SADD('sset', 23).exec()
    const res = await Store.SMEMBERS('sset')
    console.log(res)
}

// testSmembers()

async function testHashGetall () {
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    await pipeline().HSET('hash', 'one', 1).HSET('hash', 'two', 2).exec()
    const res = await Store.HGETALL('hash')
    const res2 = await pipeline().HLEN('hash').exec()
    let res4 = await pipeline().HEXISTS('hash', 'one').HEXISTS('hash', 'three').exec()

    console.log(res)
}

// testHashGetall()


async function testZscore () {
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    await pipeline().ZADD('zset22', 1, 'one').ZADD('zset22', 2, 'two').exec()
    const range = await Store.ZRANGEBYSCORE('zset22', -1, 2)
    const res = await Store.ZSCORE('zset22', 'one')
    const res2 = await pipeline().ZSCORE('zset22', 'one').exec()
    const res3 = await pipeline().ZSCORE('zset22', 'notfound').exec()
    
    console.log(res, typeof res)
    console.log(res2, typeof res2)
}

// testZscore()

async function testZRange () {
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    await pipeline().ZADD('zsetzrange', 1, 'one').ZADD('zsetzrange', 2, 'two').exec()
    const res = await Store.ZRANGE('zsetzrange', 0, 2)
    const res2 = await pipeline().ZRANGE('zsetzrange', 0, 2).exec()

    console.log(res, typeof res)
    console.log(res2, typeof res2)
}

// testZRange()

async function testZIncr () {
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    await pipeline().ZADD('zsetzrange', 1, 'one').ZADD('zsetzrange', 2, 'two').exec()
    let res: any = await pipeline().ZSCORE('zsetzrange', 'one').exec()
    res = await Store.ZINCRBY('zsetzrange', 1, 'one')
    res = await pipeline().ZINCRBY('zsetzrange', 1, 'one').exec()
    res = await pipeline().ZSCORE('zsetzrange', 'one').exec()
    console.log(res)
}

// testZIncr()

async function testsrem () {
    if (redisCli) {
        redisCli.select(1)
        redisCli.flushdb()
    }
    await pipeline().SADD('set', 'str').exec()
    await pipeline().SREM('set', 'str').exec()
}

// testsrem()
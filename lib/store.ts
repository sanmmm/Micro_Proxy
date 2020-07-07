import Redis from 'ioredis'

import { SortedMap, SortedSet, generateRedisKey } from 'utils';
import settings from 'getSettings'

let redisCli = settings.REDIS_SERVER_URL && new Redis(settings.REDIS_SERVER_URL)

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

function transformScoreValue (min: number, max: number) {
    return {
        min: min || (typeof min === 'number' ? min : '-inf'),
        max: max || (typeof max === 'number' ? max : '+inf'),
    }
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
    async INCR(key: string, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async INCR(key: string): Promise<number>;
    async INCR(key: string, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.incr(key)
            }
            return await redisCli.incr(key)
        } else {
            const oldValue = getKeyValue(key, 0)
            const newValue = oldValue + 1;
            storage.set(key, newValue)
            return newValue
        }
    }
    async INCRBY(key: string, increment: number, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async INCRBY(key: string, increment: number): Promise<number>;
    async INCRBY(key: string, increment: number, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.incrby(key, increment)
            }
            return await redisCli.incrby(key, increment)
        } else {
            const oldValue = getKeyValue(key, 0)
            const newValue = oldValue + increment;
            storage.set(key, newValue)
            return newValue
        }
    }
    async SADD<T = any>(key: string, member: T | T[], pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async SADD<T = any>(key: string, member: T | T[]): Promise<any>;
    async SADD<T = any>(key: string, member: T | T[], pipeline?: Redis.Pipeline) {
        const members = Array.isArray(member) ? member : [member]
        if (!members.length) {
            return
        }
        if (isRedisMode) {
            const memberStrArr = members.map(value => JSON.stringify(value))
            if (pipeline) {
                return pipeline.sadd(key, ...memberStrArr)
            }
            await redisCli.sadd(key, ...memberStrArr)
        } else {
            const set = getKeyValue(key, new Set<T>())
            members.forEach(v => {
                set.add(v)
            })
        }
    }
    async SREM<T = any>(key: string, member: T | T[], pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async SREM<T = any>(key: string, member: T | T[]): Promise<any>;
    async SREM<T = any>(key: string, member: T | T[], pipeline?: Redis.Pipeline) {
        const members = Array.isArray(member) ? member : [member]
        if (!members.length) {
            return
        }
        if (isRedisMode) {
            const memberStrArr = members.map(value => JSON.stringify(value))
            if (pipeline) {
                return pipeline.srem(key, ...memberStrArr)
            }
            await redisCli.srem(key, ...memberStrArr)
        } else {
            const set = getKeyValue(key, new Set())
            members.forEach(m => {
                set.delete(m)
            })
        }
    }
    async SHAS(key: string, member: any, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async SHAS(key: string, member: any): Promise<0 | 1>;
    async SHAS(key: string, member: any, pipeline?: Redis.Pipeline) {
        if (isRedisMode) {
            if (pipeline) {
                return pipeline.sismember(key, member)
            }
            return await redisCli.sismember(key, member)
        } else {
            const set = getKeyValue(key, new Set())
            return set.has(member) ? 1 : 0
        }
    }
    async SCAN<T = any>(key: string, count?: number): Promise<T[]> {
        if (isRedisMode) {
            let cursor = 0
            const itemSet = new Set<string>()
            do {
                const [nextCursor, strItems] = await redisCli.sscan(key, cursor, 'count', 500)
                cursor = Number(nextCursor)
                strItems.forEach(str => itemSet.add(str))
            } while (!isNaN(cursor) && cursor !== 0 && (typeof count !== 'number' || count > itemSet.size))
            return Array.from(itemSet).map(str => JSON.parse(str))
        } else {
            return Array.from(getKeyValue(key, new Set<T>())).slice(0, typeof count !== 'number' ? count : undefined)
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
            const resArr = await redisCli.zrange(key, min, max)
            return resArr.map(res => JSON.parse(res))
         }
     }
    async ZRANGEBYSCORE<T = any>(key: string, min: number, max: number, pipeline: Redis.Pipeline): Promise<Redis.Pipeline>;
    async ZRANGEBYSCORE<T = any>(key: string, min: number, max: number): Promise<T[]>;
    async ZRANGEBYSCORE<T = any>(key: string, min: number, max: number, pipeline?: Redis.Pipeline) {
        const redisValueObj = transformScoreValue(min, max)
        if (isRedisMode) {
            const {min, max} = redisValueObj
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
        const redisValueObj = transformScoreValue(min, max)
        if (isRedisMode) {
            const {min, max} = redisValueObj
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
        const redisValueObj = transformScoreValue(min, max)
        if (pipeline) {
            return pipeline.zcount(key, redisValueObj.min, redisValueObj.max)
        } else {
            return await redisCli.zcount(key, redisValueObj.min, redisValueObj.max)
        }
    }
    async ZSCAN<T = any>(key: string, count?: number): Promise<{member: T, score: number}[]> {
        if (isRedisMode) {
            let cursor = 0
            const items: {member: T, score: number}[] = []
            do {
                const [nextCursor, strItems] = await redisCli.zscan(key, cursor, 'count', 1000)
                cursor = Number(nextCursor)
                for (let i = 0; i < strItems.length; i += 2) {
                    const [memberStr, score] = strItems.slice(i, i + 2)
                    items.push({
                        member: JSON.parse(memberStr),
                        score: JSON.parse(score),
                    })
                }
            } while ((!isNaN(cursor) && cursor !== 0) && (typeof count !== 'number' || count > items.length))
            return items
        } else {
            const sortedSet = getKeyValue(key, new SortedSet<T>())
            return sortedSet.sscan().slice(0, typeof count !== 'number' ? count : undefined)
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

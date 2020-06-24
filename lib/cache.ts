const cache = new Map<string, any>()
const cacheExpireMap = new Map<string, number>()

function isValidExpireTime (expire: number) {
    return typeof expire === 'number' && !isNaN(expire)
}

function getCacheAndValidate (cacheKey: string) {
    const expireTime = cacheExpireMap.get(cacheKey)
    if (isValidExpireTime(expireTime)) {
        const isExpired = expireTime <= Date.now()
        if (isExpired) {
            cache.delete(cacheKey)
            cacheExpireMap.delete(cacheKey)
            return null
        }
    }
    return cache.get(cacheKey)
}

export function getCache<T = any> (cacheKey: string, initialValue?: T, expire?: number): T {
    let value = getCacheAndValidate(cacheKey)
    if (!value && initialValue !== undefined) {
        value = initialValue
        setCache(cacheKey, initialValue, expire)
    }
    return value
}

export function setCache (cacheKey: string, value: any, expire?: number) {
    cache.set(cacheKey, value)
    if (isValidExpireTime(expire)) {
        cacheExpireMap.set(cacheKey, Date.now() + expire)
    }
}

export function deleteCache (cacheKey: string) {
    cache.delete(cacheKey)
    cacheExpireMap.delete(cacheKey)
}

export async function tryGetCache<T = any> (cacheKey: string, getter: () => Promise<T> | T, expire?: number): Promise<T> {
    let value = getCache(cacheKey)
    if (!value) {
        value = await getter()
        setCache(cacheKey, value, expire)
    }
    return value
}

export function setMapCache (cacheKey: string, mapKey: string, value: any) {
    const mapCache = getCache(cacheKey, new Map())
    mapCache.set(mapKey, value)
}

export function getMapCache (cacheKey: string, mapKey: string) {
    const mapCache = getCache(cacheKey, new Map())
    return mapCache.get(mapKey)
}

export function deleteMapCache (cacheKey: string, mapKey: string) {
    const mapCache = getCache(cacheKey, new Map())
    return mapCache.delete(mapKey)
}


function test () {
    let res: any = isValidExpireTime(null)
    res = isValidExpireTime(1)
    res = isValidExpireTime(NaN)
    setCache('testexpire', 1)
    res = getCache('testexpire')
    setCache('testexpire', 2, -1)
    res = getCache('testexpire')
    res = getCache('testexpire', 3)
    console.log(res)
}

// test()
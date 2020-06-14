const cache = new Map<string, any>()

export function getCache<T = any> (cacheKey: string, defaultValue?: T): T {
    let value = cache.get(cacheKey)
    if (!value && defaultValue !== undefined) {
        value = defaultValue
        cache.set(cacheKey, defaultValue)
    }
    return value
}

export function setCache (cacheKey: string, value: any) {
    cache.set(cacheKey, value)
}

export function deleteCache (cacheKey: string) {
    cache.delete(cacheKey)
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
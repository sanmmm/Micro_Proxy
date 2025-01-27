export function generateRedisKey(key: string) {
    return `crwl-pool-${key}`
}

type HandlerError = (e: Error, cb: (returnValue) => void, ...funcArgs: any[]) => any;

type GetErrorNameSpace = string | (<T = any>(...args: T[]) => string)

export function catchError(namespace: GetErrorNameSpace = '', handleError?: HandlerError) {
    return (target, propertyValue, descriptor: PropertyDescriptor) => {
        const func = descriptor.value.bind(target)
        descriptor.value = async function (...args) {
            let returnValue = undefined
            try {
                returnValue = await func(...args)
            } catch (e) {
                const namespaceStr = namespace instanceof Function ? namespace(...args) : namespace
                console.error(`${namespaceStr} Error:`, e)
                !!handleError && await handleError(e, (v) => {
                    returnValue = v
                }, ...args)
            }
            return returnValue
        } as PropertyDescriptor

        return descriptor
    }
}

export function FuncTimeout<T = any> (exec: {func: () => T; cancel?: () => any}, timeout: number, retry = 0) {
    return new Promise<T>(async (resolve, reject) => {
        let timer = null, error: Error = null, funRes = null
        timer = setTimeout(() => {
            if (retry) {
                timer = null
                resolve(FuncTimeout(exec, timeout, retry - 1))
            } else if (exec.cancel) {
                exec.cancel()
            } else {
                timer = null
                reject('timeout error')
            }
        }, timeout)

        try {
           funRes = await exec.func()
        } catch (e) {
            error = e
        }
        
        if (timer) {
            clearTimeout(timer)
            if (error) {
                return reject(error)
            }
            resolve(funRes)
        }
    })
}

export function toJson (obj: any) {
    let type = typeof obj
    if (type === 'function') {
        return {
            type,
            isLeafNode: true,
            value: obj.toString(),
        }
    }
    if (type !== 'object' || Array.isArray(obj)) {
        return {
            type,
            isLeafNode: true,
            value: obj
        }
    }
    
    let jsonObj: any = {}
    Object.keys(obj).forEach(key => {
        const value = Reflect.get(obj, key)
        Reflect.set(jsonObj, key, toJson(value))
    })
    return jsonObj
}

export function fromJson (jsonObj: any) {
    if (jsonObj.isLeafNode) {
        if (jsonObj.type === 'function') {
            const evalFuncBodyStr = `return ${jsonObj.value}`
            return new Function(evalFuncBodyStr)()
        }
        return jsonObj.value
    }
    let originObj: any = {}
    Object.keys(jsonObj).forEach(key => {
        const descriptor = Reflect.get(jsonObj, key)
        Reflect.set(originObj, key, fromJson(descriptor))
    })
    return originObj
}

export function getMapValue <T = any> (map: Map<any, any>, key: any, defaultValue?: T): T {
    let value = map.get(key)
    if (!value && defaultValue !== undefined) {
        value = defaultValue
        map.set(key, defaultValue)
    }
    return value
}

type CompareFn<T = any> = (item: T) => number

function binaraySearch<T = any>(arr: T[], compareFn: CompareFn<T>, isGreedyMode = true) {
    let low = 0, high = arr.length
    while (low < high) {
        const minIndex = (low + high) >> 1
        const midItem = arr[minIndex]
        const compareValue = compareFn(midItem)
        if (isGreedyMode) {
            compareValue < 0 ? high = minIndex : low = minIndex + 1
        } else {
            compareValue > 0 ? low = minIndex + 1 : high = minIndex
        }
    }
    return --low
}

class RefObj<T = any> {
    current: T = null;
    constructor(initValue) {
        this.current = initValue
    }
}

class SortedStructure<T = any> {
    private itemArr: T[] = [];
    private _getScore: (item: T) => number;

    constructor(getSocre: (item: T) => number) {
        this._getScore = getSocre
    }   

    private _indexOfItem(item: T) {
        const score = this._getScore(item)
        const findIndex = binaraySearch(this.itemArr, (otherItem) => score - this._getScore(otherItem), false)
        let index = -1
        for (let i = findIndex; i < this.itemArr.length; i++) {
            const arrItem = this.itemArr[i]
            const arrItemScore = this._getScore(arrItem)
            if (arrItemScore !== score) {
                break
            }
            if (arrItem === item) {
                index = i
            }
        }
        return index
    }

    private _getMatchedIndexRange (item: T) {
        const score = this._getScore(item)
        const findIndex = binaraySearch(this.itemArr, (otherItem) => score - this._getScore(otherItem), false)
        const isMatched = this.itemArr[findIndex + 1] === item
        if (isMatched) {
            let startIndex = findIndex + 1, endIndex = findIndex + 1
            for (let i = findIndex + 1; i < this.itemArr.length; i++) {
                const arrItem = this.itemArr[i]
                if (arrItem !== item) {
                    break
                }
                endIndex ++
            }
            return {
                startIndex,
                endIndex
            }
        } else {
            return {
                startIndex: 0,
                endIndex: 0
            }
        }
    }

    protected insert(item: T, score: number) {
        const insertIndex = binaraySearch(this.itemArr, (otherItem) => score - this._getScore(otherItem)) + 1
        this.itemArr.splice(insertIndex, 0, item)
    }

    protected remove(item: T) {
        let removeIndexRange = this._getMatchedIndexRange(item)

        this.itemArr.splice(removeIndexRange.startIndex, removeIndexRange.endIndex - removeIndexRange.startIndex)
    }

    protected range (startIndex: number, endIndex:  number): T[] {
        startIndex = startIndex || 0
        endIndex = typeof endIndex === 'number' ? endIndex : this.itemArr.length - 1
        return this.itemArr.slice(startIndex, endIndex + 1)
    }

    protected rangeByScore(startScore: number, endScore: number): T[] {
        const startIndex = startScore ? binaraySearch(this.itemArr, (item) => startScore - this._getScore(item), false) + 1 : 0
        const endIndex = endScore ? binaraySearch(this.itemArr, (item) => endScore - this._getScore(item)) : this.itemArr.length - 1
        return this.itemArr.slice(startIndex, endIndex + 1)
    }

    protected removeByScore (startScore: number, endScore: number) {
        const startIndex = startScore ? binaraySearch(this.itemArr, (item) => startScore - this._getScore(item), false) + 1 : 0
        const endIndex = endScore ? binaraySearch(this.itemArr, (item) => endScore - this._getScore(item)) + 1 : this.itemArr.length
        return this.itemArr.splice(startIndex, endIndex - startIndex)
    }

    protected countByScore (startScore: number, endScore: number) {
        return this.rangeByScore(startScore, endScore).length
    }


}


type SortedKeyType = any

type SortedMapValue<T = any> = RefObj<{ key: SortedKeyType, value: T, score: number }>
export class SortedMap<T = any> extends SortedStructure<SortedMapValue<T>> {
    keyValueRefObjMap: Map<SortedKeyType, SortedMapValue<T>> = new Map();
    constructor() {
        super((item) => item.current.score)
    }

    mset(key: SortedKeyType, score: number, value: T) {
        let valueRefObj = this.keyValueRefObjMap.get(key), hasExisted = !!valueRefObj
        if (hasExisted) {
            super.remove(valueRefObj)
        }

        if (!hasExisted) {
            valueRefObj = new RefObj({})
        }
        valueRefObj.current = {
            key,
            value,
            score,
        }
         
        this.keyValueRefObjMap.set(key, valueRefObj)
        super.insert(valueRefObj, score)
    }

    mget(key: SortedKeyType) {
        let hasExisted = this.keyValueRefObjMap.has(key)
        if (!hasExisted) {
            return null
        }
        return this.keyValueRefObjMap.get(key).current.value
    }

    mscore (key: SortedKeyType) {
        const valueRef = this.keyValueRefObjMap.get(key)
        if (!valueRef) {
            return null
        }
        return valueRef.current.score
    }

    mdelete(key: SortedKeyType) {
        let hasExisted = this.keyValueRefObjMap.has(key)
        if (!hasExisted) {
            return null
        }
        const deleteItem = this.keyValueRefObjMap.get(key)
        this.keyValueRefObjMap.delete(key)
        super.remove(deleteItem)
        return deleteItem.current
    }

    mdeleteByScore (startScore: number, endScore: number) {
        const deletedItems = super.removeByScore(startScore, endScore)
        deletedItems.forEach(refItem => {
            this.keyValueRefObjMap.delete(refItem.current.key)
        })
    }

    mcount () {
        return this.keyValueRefObjMap.size
    }

    mcountByScore (startScore, endScore) {
        return super.countByScore(startScore, endScore)
    }

    mrange(startRank: number, endRank: number): { key: SortedKeyType, value: T }[];
    mrange(startRank: number, endRank: number, withScore: boolean): { score: number, key: SortedKeyType, value: T }[];
    mrange(startRank: number, endRank: number, withScore?: boolean) {
        const matchedRefItems = super.range(startRank, endRank)
        if (withScore) {
            return matchedRefItems.map(item => item.current)
        } else {
            return matchedRefItems.map(({current: {key, value}}) => ({
                key,
                value,
            }))
        }
    }

    mrangeByScore(startScore: number, endScore: number): { key: SortedKeyType, value: T }[];
    mrangeByScore(startScore: number, endScore: number, withScore: boolean): { score: number, key: SortedKeyType, value: T }[];
    mrangeByScore(startScore: number, endScore: number, withScore?: boolean) {
        const matchedRefItems = super.rangeByScore(startScore, endScore)
        if (withScore) {
            return matchedRefItems.map(item => item.current)
        } else {
            return matchedRefItems.map(({current: {key, value}}) => ({
                key,
                value,
            }))
        }
    }
}

export class SortedSet<T extends any> extends SortedMap<null> {
    sadd(member: T, score: number) {
        super.mset(member, score, null)
    }

    sremove(member: T) {
        super.mdelete(member)
        return member
    }

    sremoveByScore (startScore: number, endScore: number) {
        super.mdeleteByScore(startScore, endScore)
    }

    shas(member: T) {
        return super.mget(member) !== undefined
    }

    sscore (member: T) {
        return super.mscore(member)
    }

    srangeByScore(startScore: number, endScore: number): T[];
    srangeByScore(startScore: number, endScore: number, withScore: boolean): { score: number, member: T }[];
    srangeByScore(startScore: number, endScore: number, withScore?: boolean) {
        return withScore ? super.mrangeByScore(startScore, endScore, withScore).map(obj => ({
            score: obj.score,
            member: obj.key,
        })) : super.mrangeByScore(startScore, endScore).map(obj => obj.key)
    }

    scountByScore (startScore: number, endScore: number) {
        return super.mcountByScore(startScore, endScore)
    }

    srange(startRank: number, endRank: number): T[];
    srange(startRank: number, endRank: number, withScore: boolean): { score: number, member: T }[];
    srange (startRank: number, endRank: number, withScore?: boolean) {
        return withScore ? super.mrange(startRank, endRank, withScore).map(obj => ({
            score: obj.score,
            member: obj.key,
        })) : super.mrange(startRank, endRank).map(obj => obj.key)
    }

    scount () {
        return super.mcount()
    }

    sscan() {
        return this.srangeByScore(null, null, true)
    }

}

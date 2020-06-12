export function generateRedisKey(key: string) {
    return `crwl-pool-${key}`
}

type HandlerError = (e: Error, cb: (returnValue) => void) => any;

export function catchError(namespace?: string, handleError?: HandlerError) {
    return (target, propertyValue, descriptor: PropertyDescriptor) => {
        const func = descriptor.value.bind(target)
        descriptor.value = async function (...args) {
            let returnValue = undefined
            try {
                returnValue = await func(...args)
            } catch (e) {
                console.error(`${namespace} Error:`, e)
                !!handleError && await handleError(e, (v) => {
                    returnValue = v
                })
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
    // private itemScoreMap: Map<T, number> = new Map();
    private _getScore: (item: T) => number;

    constructor(getSocre: (item: T) => number) {
        this._getScore = getSocre
    }   

    // private _getScore(item: SortedStructureItem) {
    //     // return this.itemScoreMap.get(item)
    //     return item.score
    // }

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
        // this.itemScoreMap.set(item, score)
    }

    protected remove(item: T) {
        // let removeIndex = this._indexOfItem(item),
        //     removeItem = null

        // if (removeIndex > -1) {
        //     this.itemArr.splice(removeIndex, 1)
        //     this.itemScoreMap.delete(item)
        //     removeItem = item
        // }
        // return removeItem

        let removeIndexRange = this._getMatchedIndexRange(item)
        // removeItem = null

        this.itemArr.splice(removeIndexRange.startIndex, removeIndexRange.endIndex - removeIndexRange.startIndex)
        // if (removeIndexRange > -1) {
        //     this.itemArr.splice(removeIndexRange, 1)
        //     this.itemScoreMap.delete(item)
        //     removeItem = item
        // }
        // return removeItem
    }

    // protected updateItemScore(item: T, score: number) {
    //     const nowScore = this._getScore(item)
    //     if (nowScore === score) {
    //         return
    //     }
    //     const prevItemIndex = this._indexOfItem(item)
    //     const latestItemIndex = binaraySearch(this.itemArr, (otherItem) => score - this._getScore(otherItem))
    //     //TODO
    //     this.itemArr.splice(prevItemIndex, 1)
    //     this.itemArr.splice(latestItemIndex, 0, item)
    //     this.itemScoreMap.set(item, score)
    // }

    // protected incItemScore(item: T) {
    //     const prevScore = this._getScore(item)
    //     const newScore = prevScore + 1
    //     this.updateItemScore(item, newScore)
    //     return newScore
    // }

    protected range (startIndex: number, endIndex:  number): T[] {
        startIndex = startIndex || 0
        endIndex = typeof endIndex === 'number' ? endIndex : this.itemArr.length - 1
        return this.itemArr.slice(startIndex, endIndex + 1)
    }

    // protected range(startScore, endScore): T[];
    // protected range(startScore, endScore, withScore: boolean): { score: number, member: T }[];
    // protected range(startScore, endScore, withScore?: boolean) {
    protected rangeByScore(startScore: number, endScore: number): T[] {
        const startIndex = startScore ? binaraySearch(this.itemArr, (item) => startScore - this._getScore(item), false) + 1 : 0
        const endIndex = endScore ? binaraySearch(this.itemArr, (item) => endScore - this._getScore(item)) : this.itemArr.length - 1
        // const endIndexItemExisted = endScore ? this._getScore(this.itemArr[endIndex]) <= endScore : true
        // const matchedItemArr = this.itemArr.slice(startIndex, endIndexItemExisted ? endIndex + 1 : endIndex)
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
        // let hasExisted = this.keyValueRefObjMap.has(key)
        // if (hasExisted) {
        //     const refObj = this.keyValueRefObjMap.get(key)
        //     refObj.current.value = value
        //     super.updateItemScore(refObj, score)
        // } else {
        //     const newValueRefObj = new RefObj({
        //         key,
        //         value,
        //     })
        //     super.insert(newValueRefObj, score)
        //     this.keyValueRefObjMap.set(key, newValueRefObj)
        // }

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

    // minc(key: SortedKeyType) {
    //     let hasExisted = this.keyValueRefObjMap.has(key)
    //     if (!hasExisted) {
    //         throw new Error(`[key]:${key} not existed!!`)
    //     }
    //     const refObjItem = this.keyValueRefObjMap.get(key)
    //     return super.incItemScore(refObjItem)
    // }
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

    // sinc(member: T) {
    //     return super.minc(member)
    // }

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

function testSortedMap () {
    const m = new SortedMap()
    m.mset('one', 1, 'one')
    m.mset('two', 2, 'two')
    console.log(m.mcount())
    console.log(m.mcountByScore(2, null))
    console.log(m.mrange(0, null))
    // const res = m.mrange(1, 2)
    // m.mset('two', -1, 'two2')
    // const res2 = m.mrange(1, 2)
    // console.log(m.mget('one'))
    // m.mdelete('one')
    // console.log(m.mget('one'))
    console.log(m.mrangeByScore(1, 2))
    m.mdeleteByScore(1, 1)
    console.log(m.mrangeByScore(1, 2))
}

// testSortedMap()

function testSortedSet() {
    const t = new SortedSet()

    t.sadd({ v: 1 }, 1)
    t.sadd({ v: 2 }, 2)
    t.sadd(2, 3)

    console.log(t.srange(0, null))
    console.log(t.scountByScore(0, null))
    console.log(t.scount())

    console.log(t.srangeByScore(1, 2))
    console.log(1)
    console.log(t.sscore(2))
}

// testSortedSet()


// function testBinarySearch() {
//     const arr = [1, 3, 4, 4, 5, 6]
//     console.log(binaraySearch(arr, (v) => 4 - v, false),)
// }

// testBinarySearch()

function testStructure () {
    const arr = [1, 3, 4, 4, 5, 6]
    const sorted = new SortedStructure((i) => i)
    // @ts-ignore
    arr.forEach(i => sorted.insert(i))
    // @ts-ignore
    console.log(sorted._getMatchedIndexRange(3)) 
        // @ts-ignore
        console.log(sorted.countByScore(null, null)) 
    // @ts-ignore
    console.log(sorted.range(2, 2)) 
    // @ts-ignore
    let range = sorted.rangeByScore(3, 3)
    // @ts-ignore
    range = sorted.rangeByScore(-1)
    // @ts-ignore
    const range0 = sorted.removeByScore(3, 10)
    // @ts-ignore
    range = sorted.rangeByScore(3, 3)
    // @ts-ignore
    range = sorted.rangeByScore(-1)
    // @ts-ignore
    const range1 = sorted.rangeByScore(4, 6)

    // @ts-ignore
    sorted.remove(3)
    // @ts-ignore
    sorted.remove(7)
    // @ts-ignore
    sorted.remove(4)

    // @ts-ignore
    console.log(sorted._getMatchedIndexRange(3)) 

}

// testStructure()
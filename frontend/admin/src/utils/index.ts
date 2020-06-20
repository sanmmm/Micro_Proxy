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

export function toPureJson (obj: any) {
    let type = typeof obj
    if (type === 'function') {
        return obj.toString()
    }
    if (type !== 'object' || Array.isArray(obj)) {
        return obj
    }
    
    let jsonObj: any = {}
    Object.keys(obj).forEach(key => {
        const value = Reflect.get(obj, key)
        Reflect.set(jsonObj, key, toPureJson(value))
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
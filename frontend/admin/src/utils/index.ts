export function toJson(obj: any) {
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

export function toPureJson(obj: any) {
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

export function fromJson(jsonObj: any) {
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

export namespace JsonSchema {

    export interface SchemaObjValue {
        value: SchemaValue;
        helper?: string | string[];
        required?: boolean;
    }

    type SchemaStringValue = 'number' | 'string' | 'boolean' | 'array' | 'null' | 'object'

    export type SchemaValue = SchemaObjValue | SchemaStringValue | SchemaStringValue[] | SchemaConfig

    export interface SchemaConfig {
        [key: string]: SchemaValue
    }

    
    const isSchemaObjValue = (value: SchemaValue): value is SchemaObjValue => {
        return typeof value === 'object' && !isSchemaArrValue(value) && !!value.value
    }

    const isSchemaArrValue = (value: SchemaValue): value is SchemaStringValue[] => {
        return Array.isArray(value)
    }

    const isSchemaStringValue = (value: SchemaValue): value is SchemaStringValue => {
        return typeof value === 'string'
    }

    const isSchemaConfigValue = (value: SchemaValue): value is SchemaConfig => {
        return typeof value === 'object' && !isSchemaArrValue(value) && !isSchemaObjValue(value)
    }


    export const getJsonSchema = (schemaConfig: SchemaConfig) => {
        const properties: object = {}, info: object = {}, requiredFeilds: string[] = []
        Object.entries(schemaConfig).forEach(([feildName, feildValue]) => {
            let typeValue: any = feildValue, transfromValue = null, helper: string | string[] = null, required = true,
                types: SchemaStringValue[] | SchemaStringValue = [], extra = null
            if (isSchemaObjValue(feildValue)) {
                typeValue = feildValue.value
                required = feildValue.required
                helper = feildValue.helper
            }

            if (isSchemaConfigValue(typeValue)) {
                const res = getJsonSchema(typeValue)
                transfromValue = res.jsonSchema
                extra = res.info
                types = 'object'
            } else if (isSchemaArrValue(typeValue)) {
                transfromValue = {
                    anyof: typeValue.map(type => ({
                        type
                    }))
                }
                types = typeValue
            } else if (isSchemaStringValue(typeValue)) {
                transfromValue = {
                    type: typeValue
                }
                types = [typeValue]
            }

            const infoItem = {
                '类型': types,
                '说明': helper || '无',
                '必须项': required ? '是' : '否'
            }
            const isObjectValue = typeof types === 'string' && types === 'object'
            if (isObjectValue) {
                infoItem['属性'] = extra
            }
            Reflect.set(info, feildName, infoItem)
            Reflect.set(properties, feildName, transfromValue)
            if (required) {
                requiredFeilds.push(feildName)
            }
        })
        return {
            info,
            jsonSchema: {
                type: 'object',
                properties,
                required: requiredFeilds,
            }
        }
    }

}
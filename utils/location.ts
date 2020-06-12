import codeToLocationMap from 'config/locationCode'
import { config } from 'getSettings';

const locationNameToCodeMap = Object.entries(codeToLocationMap).reduce((obj, entry) => {
    const [code, location] = entry
    if (Array.isArray(location)) {
        location.forEach(locationName => Reflect.set(obj, locationName, code))
    } else {
        Reflect.set(obj, location, code)
    }
    return obj
}, {})


export function getLocationNameByCode (code: string) {
    code = code.toUpperCase()
    const location = codeToLocationMap[code]
    // array
    if (Array.isArray(location)) {
        return location[0]
    }
    // string
    return location || config.UNKNOWN_LOCATION_CODE
}

export function parseLocation (str: string) {
    str = str.trim()
    let matchedName
    if (locationNameToCodeMap[str]) {
        matchedName = str
    } else {
        matchedName = Object.keys(locationNameToCodeMap).find(name => name.startsWith(str))
    }
    
    const code = locationNameToCodeMap[matchedName]
    return matchedName ? {
        name: getLocationNameByCode(code),
        code,
    } : {
        name: '',
        code: config.UNKNOWN_LOCATION_CODE,
    }
}

function test () {
    let res = getLocationNameByCode('hk')
    res = getLocationNameByCode('HK')
    res = getLocationNameByCode('CN')
    res = parseLocation('香港')
    res = parseLocation('中国香港')
    res = parseLocation('中国')
    res = parseLocation('文莱')
    res = parseLocation('test')
    console.log(res)
}

// test()
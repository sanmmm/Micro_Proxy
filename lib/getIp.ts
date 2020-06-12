import got from 'got'
import $ from 'cheerio'
import colors from 'colors'
import { CrawlRule, FreshIpData, BaseIpData, IpDataAnonymities, IpDataHttpTypes, FuncSelector } from '../type'


export async function crawl (rule: CrawlRule) {
    const utils = rule.pagination ? {
        getUrl: (pn: number) => rule.pagination.formatUrl(pn),
        maxPn: rule.pagination.maxPn,
    } : {
        getUrl: (pn: number) => rule.url,
        maxPn: 1
    }

    let parsedItems: FreshIpData[] = []
    for (let i = 1; i <= utils.maxPn; i ++) {
        const reqUrl = utils.getUrl(i)
        try {
            const res = await got(reqUrl)
            if (!res.headers['content-type'].includes('text/html')) {
                throw new Error('不支持该类型网页')
            }
            let freshIpDataArr: FreshIpData[] = ParseHtml.parse(res.body, rule)
            if (rule.interceptor) {
                freshIpDataArr = rule.interceptor(freshIpDataArr)
            }
            parsedItems = parsedItems.concat(freshIpDataArr)
            console.log(parsedItems.length)
        } catch (e) {
            console.log(colors.red(`[${rule.name}]:请求${reqUrl}失败`))
            console.error(e.message)
        }
        
    }
    return parsedItems
}


namespace ParseHtml {
    const UtilFuns = {
        getEnumTypeTransformer (enumObj) {
            const valueRange = Object.values(enumObj)
            return function (enumValue) {
                if (!valueRange.includes(enumValue)) {
                    throw new Error(`${enumValue} not in enum type: ${enumObj}`)
                }
                return enumValue
            }
        },
        getPriority (tagName: string) {
            return tagPriorityObj[tagName] || tagPriorityObj.other
        },
        resolveIpDataFeildValue (feildName: string, value: any) {
            const ValueTransformer = IpDataFeildTransformer[feildName] 
            if (!ValueTransformer) {
                return value
            }
            if ([null, undefined, ''].includes(value)) {
                throw new Error(`${feildName}字段 值为: ${value}(空)`)
            }
            if (Object.getPrototypeOf(value) === ValueTransformer) {
                return value
            }
            if (typeof value === 'string') {
                value = value.trim()
            }
            return ValueTransformer(value)
        }
    }

    const IpDataFeildTransformer: {
        [key in keyof BaseIpData]: any;
    } = {
        ip: String,
        port: Number,
        location: String,
        anonymity: UtilFuns.getEnumTypeTransformer(IpDataAnonymities),
        httpType: UtilFuns.getEnumTypeTransformer(IpDataHttpTypes),
        rtt: Number,
    } 
    const ipDataFeildCount = 5
    const tagPriorityObj = {
        'td': 0,
        'div': 1,
        'span': 2,
        other: 10000
    }
    

    function getHtmlLineEleAnalysis (ele: CheerioStatic) {
        const childs =  ele.root().children().children()
        const tagToEleArrMap: Map<string, CheerioElement[]> = new Map()
        childs.each((index, ele) => {
            if (ele.type !== 'tag') {
                return
            }
            const tagName = ele.name
            let eleArr = tagToEleArrMap.get(tagName)
            if (!eleArr) {
                eleArr = []
                tagToEleArrMap.set(tagName, eleArr)
            }
            eleArr.push(ele)
        })
        
        const selected = {
            tagName: null as string,
            eleArr: [] as CheerioElement[]
        }
        tagToEleArrMap.forEach((eleArr, tagName) => {
            if (eleArr.length < ipDataFeildCount) {
                return
            }
            if (!selected.tagName) {
                selected.tagName = tagName
                selected.eleArr= eleArr
                return
            }
            const prevTagName = selected.tagName
            if (UtilFuns.getPriority(prevTagName) < UtilFuns.getPriority(tagName)) {
                selected.tagName = tagName
                selected.eleArr = eleArr
            }
        })

        return selected
    }
    
    export function parse (htmlStr: string, rule: CrawlRule) { 
        const $html = $.load(htmlStr)
        const itemEles = $html(rule.itemSelector).toArray()
        const {itemStartIndex: startIndex = 0} = rule
        return itemEles.slice(startIndex).map((ele, index) => {
            const $ele = $.load(ele)
            const indexToFeildNameMap = new Map<number, string>()
            try {
                const ipDataObj =  Object.entries(rule.itemInfoSelectors).reduce((ipDataObj, [feildName, selector]) => {
                    if (selector instanceof Function) {
                        ipDataObj[feildName] = UtilFuns.resolveIpDataFeildValue(feildName, (selector as FuncSelector)($ele, {IpDataHttpTypes: IpDataHttpTypes, IpDataAnonymities: IpDataAnonymities}))
                    } else if (typeof selector === 'string') {
                        ipDataObj[feildName] = UtilFuns.resolveIpDataFeildValue(feildName, ($ele(selector)).text())
                    } else if (typeof selector === 'number') {
                        indexToFeildNameMap.set(selector, feildName)
                    } else {
                        throw new Error(`invalid selector type: ${selector}`)
                    }
                    return ipDataObj
    
                }, {} as Partial<FreshIpData>)
    
                if (!!indexToFeildNameMap.size) {
                    const analysis = getHtmlLineEleAnalysis($ele)
                    analysis.eleArr.forEach((ele, index) => {
                        if (indexToFeildNameMap.has(index)) {
                            const feildName = indexToFeildNameMap.get(index)
                            ipDataObj[feildName] = UtilFuns.resolveIpDataFeildValue(feildName, $html(ele).text())
                            indexToFeildNameMap.delete(index)
                        }
                    })
                    if (!!indexToFeildNameMap.size) {
                        throw new Error(`[字段不匹配]: ${Array.from(indexToFeildNameMap.values()).join(',')}`)
                    }
                }
                return ipDataObj as FreshIpData
            } catch (e) {
                console.error(e)
            }
            return null
        }).filter(info => !!info)
    }
}


// crawl({
//     name: 'test',
//     itemSelector: '#ip_list > tbody > tr',
//     pagination: {
//         formatUrl: (pn) => `https://www.xicidaili.com/wn/${pn}`,
//         maxPn: 3,
//     },
//     itemStartIndex: 2,
//     itemInfoSelectors: {
//         ip: 1,
//         port: 2,
//         location: 3,
//         anonymity: (ele) => {
//             if (ele.root().text().includes('高匿')) {
//                 return IpDataAnonymities.high
//             }
//             return IpDataAnonymities.no
//         },
//         rtt: () => -1,
//         type: (ele) => {
//             const text = ele.root().text().toLowerCase()
//             if (text.includes('https')) {
//                 return IpDataTypes.https
//             }
//             if (text.includes('http')) {
//                 return IpDataTypes.http
//             }
//             return null
//         }
//     },
// })

// crawl({
//     name: 'test',
//     itemSelector: '#list > table > tbody > tr',
//     pagination: {
//         formatUrl: (pn) => `https://www.kuaidaili.com/free/inha/${pn}/`,
//         maxPn: 3,
//     },
//     itemStartIndex: 1,
//     itemInfoSelectors: {
//         ip: 0,
//         port: 1,
//         location: 4,
//         anonymity: (ele) => {
//             if (ele.root().text().includes('高匿')) {
//                 return IpDataAnonymities.high
//             }
//             return IpDataAnonymities.no
//         },
//         rtt: (ele) => {
//             return ele('td:nth-child(6)').text().trim().replace('秒', '')
//         },
//         httpType: (ele) => {
//             const text = ele.root().text().toLowerCase()
//             if (text.includes('https')) {
//                 return IpDataHttpTypes.https
//             }
//             if (text.includes('http')) {
//                 return IpDataHttpTypes.http
//             }
//             return null
//         }
//     },
// })

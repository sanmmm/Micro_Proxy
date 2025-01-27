import got from 'got'
import $ from 'cheerio'
import iconv from 'iconv-lite'
import colors from 'colors'
import { CrawlRule, FreshIpData, BaseIpData, FuncSelector } from '../type'
import {IpDataAnonymities, IpDataHttpTypes} from 'enum_types'

type RealCrawlRule = CrawlRule<CheerioStatic>

export async function crawl (rule: RealCrawlRule) {
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
            const res = await got.get(reqUrl)
            if (!res.headers['content-type'].includes('text/html')) {
                throw new Error('不支持该类型网页')
            }
            let freshIpDataArr: FreshIpData[] = ParseHtml.parse(res.body, rule, res.rawBody)
            if (rule.interceptor) {
                freshIpDataArr = rule.interceptor(freshIpDataArr)
            }
            parsedItems = parsedItems.concat(freshIpDataArr)
            console.log(`rule: [${rule.name}]/ pn: ${i}/ ipCount: ${parsedItems.length}`)
        } catch (e) {
            console.log(colors.red(`[${rule.name}]:请求${reqUrl}失败`))
            console.error(e)
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
                    throw new Error(`${JSON.stringify(enumValue)} not in enum type: ${JSON.stringify(enumObj)}`)
                }
                return enumValue
            }
        },
        getPriority (tagName: string) {
            return tagPriorityObj[tagName] || tagPriorityObj.other
        },
        extractIpdataFeildValueByDefault<T extends keyof BaseIpData> (feildName: T, htmlText: string) {
            const extractor = IpDataFeildValueAutoExtractor[feildName]
            htmlText = htmlText.trim()
            return extractor(htmlText) as BaseIpData[T]
        },
        resolveIpDataFeildValue (feildName: string, value: any) {
            const ValueTransformer = IpDataFeildValueTypeTransformer[feildName] 
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

    const IpDataFeildValueTypeTransformer: {
        [key in keyof BaseIpData]: any;
    } = {
        ip: String,
        port: Number,
        location: String,
        anonymity: UtilFuns.getEnumTypeTransformer(IpDataAnonymities),
        httpType: UtilFuns.getEnumTypeTransformer(IpDataHttpTypes),
        rtt: Number,
    } 
    const IpDataFeildValueAutoExtractor: {
        [key in keyof BaseIpData]: (eleInnerText: string) => BaseIpData[key];
    } = {
        ip: (text) => {
            return text
        },
        port: (text) => {
            return Number(text)
        },
        rtt: (text) => {
            let timeUnit = 1
            if (text.includes('秒') || /[0-9]+(s|S)/.test(text)) {
                timeUnit = 1000
            }
            const matched = /([0-9]+\.[0-9]+|[0-9]+)/.exec(text)
            const number = Number(matched && matched[0])
            return number * timeUnit
        },
        location: (text) => text.replace(/\s+/g, ''),
        httpType: (text) => {
            text = text.toLowerCase()
            if (text.includes('https')) {
                return IpDataHttpTypes.https
            }
            if (text.includes('http')) {
                return IpDataHttpTypes.http
            }
            return IpDataHttpTypes.unknown
        },
        anonymity: (text) => {
            if (text.includes('高匿')) {
                return IpDataAnonymities.high
            }
            // TODO unknown
            return IpDataAnonymities.no
        },
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
    
    export function parse (htmlStr: string, rule: RealCrawlRule, rowHtmlData: Buffer) { 
        let $html = $.load(htmlStr)
        let charset = ''
        $html('meta').toArray().forEach(item => {
            const v = item.attribs['charset']
            if (v) {
                charset = v
            }
        })
        if (charset && charset.toLowerCase() !== 'utf-8') {
            const str = iconv.decode(rowHtmlData, charset)
            $html = $.load(str)
        }

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
                        const selectedText = ($ele(selector)).text()
                        const extractedValue = UtilFuns.extractIpdataFeildValueByDefault(feildName as keyof BaseIpData, selectedText)
                        ipDataObj[feildName] = UtilFuns.resolveIpDataFeildValue(feildName, extractedValue)
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
                            const eleText = $html(ele).text()
                            const extractedValue = UtilFuns.extractIpdataFeildValueByDefault(feildName as keyof BaseIpData, eleText)
                            ipDataObj[feildName] = UtilFuns.resolveIpDataFeildValue(feildName, extractedValue)
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

import { IpDataAnonymities, IpDataHttpTypes, CrawlRule } from "type"


export default [
    {
        name: '快代理',
        itemSelector: '#list > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `https://www.kuaidaili.com/free/inha/${pn}/`,
            maxPn: 5,
        },
        itemStartIndex: 1,
        itemInfoSelectors: {
            ip: 0,
            port: 1,
            location: 4,
            anonymity: (ele, {IpDataAnonymities}) => {
                if (ele.root().text().includes('高匿')) {
                    return IpDataAnonymities.high
                }
                return IpDataAnonymities.no
            },
            rtt: (ele) => {
                return Number(ele('td:nth-child(6)').text().trim().replace('秒', '')) * 1000
            },
            httpType: (ele, {IpDataHttpTypes}) => {
                const text = ele.root().text().toLowerCase()
                if (text.includes('https')) {
                    return IpDataHttpTypes.https
                }
                if (text.includes('http')) {
                    return IpDataHttpTypes.http
                }
                return null
            }
        },
    },
    {
        name: '西刺免费代理',
        itemSelector: '#ip_list > tbody > tr',
        pagination: {
            formatUrl: (pn) => `https://www.xicidaili.com/wn/${pn}`,
            maxPn: 3,
        },
        itemStartIndex: 2,
        itemInfoSelectors: {
            ip: 1,
            port: 2,
            location: 3,
            anonymity: (ele, {IpDataAnonymities}) => {
                if (ele.root().text().includes('高匿')) {
                    return IpDataAnonymities.high
                }
                return IpDataAnonymities.no
            },
            rtt: () => -1,
            httpType: (ele, {IpDataHttpTypes}) => {
                const text = ele.root().text().toLowerCase()
                if (text.includes('https')) {
                    return IpDataHttpTypes.https
                }
                if (text.includes('http')) {
                    return IpDataHttpTypes.http
                }
                return null
            }
        },
    }
] as CrawlRule[]
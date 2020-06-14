import { IpDataAnonymities, IpDataHttpTypes, CrawlRule } from "type"


const rules: CrawlRule[] = [
    {
        name: '快代理',
        itemSelector: '#list > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `https://www.kuaidaili.com/free/inha/${pn}/`,
            maxPn: 3,
        },
        itemStartIndex: 1,
        itemInfoSelectors: {
            ip: 0,
            port: 1,
            location: () => '中国',
            rtt: 'td:nth-child(6)',
            anonymity: 2,
            httpType: 3,
            // anonymity: (ele, { IpDataAnonymities }) => {
            //     if (ele.root().text().includes('高匿')) {
            //         return IpDataAnonymities.high
            //     }
            //     return IpDataAnonymities.no
            // },
            // rtt: (ele) => {
            //     return Number(ele('td:nth-child(6)').text().trim().replace('秒', '')) * 1000
            // },
            // httpType: (ele, { IpDataHttpTypes }) => {
            //     const text = ele.root().text().toLowerCase()
            //     if (text.includes('https')) {
            //         return IpDataHttpTypes.https
            //     }
            //     if (text.includes('http')) {
            //         return IpDataHttpTypes.http
            //     }
            //     return null
            // }
        },
    },
    {
        name: '西刺免费代理-国内高匿代理',
        itemSelector: '#ip_list > tbody > tr',
        pagination: {
            formatUrl: (pn) => `https://www.xicidaili.com/nn/${pn}`,
            maxPn: 2,
        },
        itemStartIndex: 2,
        itemInfoSelectors: {
            ip: 1,
            port: 2,
            location: 3,
            anonymity: 4,
            httpType: 5,
            rtt: () => -1,
        },
    },
    {
        name: '云代理',
        itemSelector: '#list > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `http://www.ip3366.net/?stype=1&page=${pn}`,
            maxPn: 7,
        },
        itemStartIndex: 2,
        itemInfoSelectors: {
            ip: 1,
            port: 2,
            location: 3,
            anonymity: 4,
            httpType: 5,
            rtt: () => -1,
        },
    }
]

export default rules
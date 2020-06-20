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
            location: () => '中国',
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
            ip: 0,
            port: 1,
            location: () => '中国',
            anonymity: 2,
            httpType: 3,
            rtt: 6,
        },
    },
    {
        name: '开心代理(高匿)',
        itemSelector: 'table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `http://www.kxdaili.com/dailiip/1/${pn}.html`,
            maxPn: 5,
        },
        itemStartIndex: 0,
        itemInfoSelectors: {
            ip: 0,
            port: 1,
            rtt: 4,
            location: () => '中国',
            httpType: 3,
            anonymity: 2,
        }
    },
    {
        name: '66免费代理',
        itemSelector: '#footer > div > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `http://www.66ip.cn/areaindex_1/${pn}.html`,
            maxPn: 32,
        },
        itemStartIndex: 1,
        itemInfoSelectors: {
            ip: 0,
            port: 1,
            rtt: () => -1,
            location: () => '中国',
            httpType: (_, types) => {
                return types.IpDataHttpTypes.http
            },
            anonymity: 3,
        }
    },
    {
        name: 'ip海（高匿）',
        itemSelector: 'body > div.container.main-container > div.table-responsive.module > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `http://www.iphai.com/free/ng`,
            maxPn: 1,
        },
        itemStartIndex: 1,
        itemInfoSelectors: {
            ip: 0,
            port: 1,
            rtt: 5,
            location: () => '中国',
            httpType: 3,
            anonymity:2,
        }
    },
    {
        name: '89免费代理',
        itemSelector: 'table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `http://www.89ip.cn/index_${pn}.html`,
            maxPn: 50,
        },
        itemStartIndex: 1,
        itemInfoSelectors: {
            ip: 0,
            port: 1,
            rtt: () => -1,
            location: () => '中国',
            httpType: (_, types) => types.IpDataHttpTypes.unknown,
            anonymity: (_, types) => types.IpDataAnonymities.unknown,
        }
    },
    {
        name: 'nima代理(高匿)',
        itemSelector: 'body > div > div:nth-child(2) > div > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `http://www.nimadaili.com/gaoni/${pn}/`,
            maxPn: 20,
        },
        itemStartIndex: 0,
        itemInfoSelectors: {
            ip: (ele) => ele('td:nth-child(1)').text().split(':')[0],
            port: (ele) => ele('td:nth-child(1)').text().split(':')[1],
            rtt: (ele) => Number(ele('td:nth-child(5)').text().trim()) * 1000,
            location: 3,
            httpType: 1,
            anonymity: 2,
        }
    },
    {
        name: 'nima代理(https)',
        itemSelector: 'body > div > div:nth-child(2) > div > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `http://www.nimadaili.com/https/${pn}/`,
            maxPn: 20,
        },
        itemStartIndex: 0,
        itemInfoSelectors: {
            ip: (ele) => ele('td:nth-child(1)').text().split(':')[0],
            port: (ele) => ele('td:nth-child(1)').text().split(':')[1],
            rtt: (ele) => Number(ele('td:nth-child(5)').text().trim()) * 1000,
            location: 3,
            httpType: 1,
            anonymity: 2,
        }
    }
]

export default rules
export enum IpDataHttpTypes {
    http = 1,
    https = 2,
}

export enum IpDataAnonymities {
    high = 1,
    no = 2,
}

export interface BaseIpData {
    ip: string;
    port: number;
    location: string;
    httpType: IpDataHttpTypes;
    anonymity: IpDataAnonymities;
    rtt: number; // 毫秒
} 

export interface FreshIpData extends BaseIpData {
    [extraAttr: string]: any;
}

export interface PureIpData extends BaseIpData {
    ttl: number; // 毫秒 生存时间
    weight: number;
    validateCount: number;
}

export type FuncSelector = (itemEle: CheerioStatic, types: {IpDataHttpTypes: typeof IpDataHttpTypes, IpDataAnonymities: typeof IpDataAnonymities}) => any

export type Selector = string | FuncSelector | number

export interface CrawlRule {
    name: string; // 规则名称
    url?: string;
    itemSelector: Selector;
    itemStartIndex?: number;
    itemInfoSelectors: {
        ip: Selector;
        port: Selector;
        location: Selector;
        httpType: Selector;
        anonymity: Selector;
        rtt: Selector;

        [extraAttr: string]: any;
    };
    pagination?: {
        formatUrl: (pn: number) => string;
        maxPn: number;
    };
    interceptor?: (ipDataArr: FreshIpData[]) => FreshIpData[];
}

export enum CronTaskTypes {
    test = 'test'
}
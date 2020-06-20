export enum IpDataHttpTypes { // 有序 可比对
    unknown = -1,
    http = 1,
    https = 2,
}

export enum IpDataAnonymities {
    unknown = -1,
    no = 1,
    high = 2,
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

export type FuncSelector = (itemEle: CheerioStatic, types: { IpDataHttpTypes: typeof IpDataHttpTypes, IpDataAnonymities: typeof IpDataAnonymities }) => any

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

export interface CrawlRuleDef extends CrawlRule {
    usedCount: number;
    isInRuleFile: boolean;
}

export enum IpPoolChannelStatus {
    paused = 1,
    normal = 2,
}

export interface IpPoolChannelDef {
    channelName: string;
    validateUrl: string;
    maxRtt: number; // 最大延迟 
    volume: number; // 容量
    itemBlockTime: number; // ip屏蔽时间
    itemLifeTime: number; // ip生存期
    httpValidateUrl?: string; // 供DEFAULT_CHANNEL 使用
    status?: IpPoolChannelStatus;
}

export interface ChannelIpDataDef {
    host: string;

    rtt: number;
    usedCount: number;
    validateCount: number;
    lastValidateTime: number;
    nextValidateTime: number;

    // default channel properties
    fromRule?: string;
    anonymity?: number;
    httpType?: number;

    location?: string;

}
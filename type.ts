import { IpDataHttpTypes, IpDataAnonymities } from "./enum_types"

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

export type FuncSelector<EleType = any> = (itemEle: EleType, types: { IpDataHttpTypes: typeof IpDataHttpTypes, IpDataAnonymities: typeof IpDataAnonymities }) => any

export type Selector<E = any> = string | FuncSelector<E> | number

export interface CrawlRule<E = any> {
    name: string; // 规则名称
    url?: string;
    itemSelector: Selector<E>;
    itemStartIndex?: number;
    itemInfoSelectors: {
        ip: Selector<E>;
        port: Selector<E>;
        location: Selector<E>;
        httpType: Selector<E>;
        anonymity: Selector<E>;
        rtt: Selector<E>;

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
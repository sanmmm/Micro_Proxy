declare module '*.css';
declare module '*.less';
declare module "*.png";
declare module '*.svg' {
  export function ReactComponent(props: React.SVGProps<SVGSVGElement>): React.ReactElement
  const url: string
  export default url
}


declare enum IpDataHttpTypes { // 有序 可比对
  unknown = -1,
  http = 1,
  https = 2,
}

declare enum IpDataAnonymities {
  unknown = -1,
  no = 1,
  high = 2,
}

declare interface BaseIpData {
  ip: string;
  port: number;
  location: string;
  httpType: IpDataHttpTypes;
  anonymity: IpDataAnonymities;
  rtt: number; // 毫秒
}

declare interface FreshIpData extends BaseIpData {
  [extraAttr: string]: any;
}

declare interface PureIpData extends BaseIpData {
  ttl: number; // 毫秒 生存时间
  weight: number;
  validateCount: number;
}

declare type FuncSelector = (itemEle: CheerioStatic, types: { IpDataHttpTypes: typeof IpDataHttpTypes, IpDataAnonymities: typeof IpDataAnonymities }) => any

declare type Selector = string | FuncSelector | number

declare interface CrawlRule {
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

declare interface CetIPRuleDef extends CrawlRule {
  usedCount: number;
  isInRuleFile: boolean;
}

declare enum IpPoolChannelStatus {
  paused = 1,
  normal = 2,
}

declare interface IpPoolChannelDef {
  channelName: string;
  validateUrl: string;
  maxRtt: number; // 最大延迟 
  volume: number; // 容量
  itemBlockTime: number; // ip屏蔽时间
  itemLifeTime: number; // ip生存期
  httpValidateUrl?: string; // 供DEFAULT_CHANNEL 使用
  status?: IpPoolChannelStatus;
}

declare interface ChannelIpDataDef {
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

declare interface GetIpRuleDef {
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

  usedCount: number;
  isInRuleFile: boolean;
}
import { URL, format as UrlFormat } from 'url'

import * as store from 'lib/store'
import {CrawlRuleDef, Selector, FreshIpData, IpPoolChannelStatus, IpPoolChannelDef, ChannelIpDataDef} from 'type'
import {IpDataHttpTypes, IpDataAnonymities} from 'enum_types'
import { generateRedisKey, fromJson, toJson} from 'utils';
import settings, { DefaultValueConfigs, configs } from 'getSettings'
import * as cache from 'lib/cache';

const CHANNEL_NAMES_SET_KEY = 'CHANNEL_NAME_SET'

interface ChannelCache {
    channels: IpPoolChannel[], 
    channelMap: Map<string, IpPoolChannel>, 
    runningChannels: IpPoolChannel[]
}

export class IpPoolChannel implements IpPoolChannelDef {
    private static getChannelInfoKey(channelName: string) {
        return generateRedisKey(`channels-data-${channelName}`)
    }

    private static getChannelRelatedRuleSetKey (channelName: string) {
        return generateRedisKey(`cn-${channelName}-related-rules`)
    }
    
    private static getChannelRelatedRuleIpCountKey (channelName: string, ruleName: string) {
        return generateRedisKey(`cn-${channelName}-rule-${ruleName}-ipcount`)
    } 

    static async findAllChannel(onlyName: true): Promise<string[]>
    static async findAllChannel(onlyName?: false): Promise<IpPoolChannel[]>
    static async findAllChannel(onlyName = false) {
        const allChannelNames = await store.Store.SCAN(CHANNEL_NAMES_SET_KEY)
        if (onlyName) {
            return allChannelNames
        }
        const pipeline = store.pipeline()
        allChannelNames.forEach(name => {
            pipeline.GET(this.getChannelInfoKey(name))
        })
        const channelObjs: any[] = await pipeline.exec()
        return channelObjs.map(obj => new this(obj))
    }

    static async findChannelByName(channelName: string) {
        const channelInfo = await store.Store.GET(this.getChannelInfoKey(channelName))
        return channelInfo && new this(channelInfo)
    }

    static getChannelCache (reload: true): Promise<ChannelCache>
    static getChannelCache (reload?: false): ChannelCache
    static getChannelCache (reload = false) {
        const queryFunc = async () => {
            const allChannels = await this.findAllChannel()
            const map = new Map<string, IpPoolChannel>()
            const runningChannels: IpPoolChannel[] = []
            allChannels.forEach(channel => {
                if (!channel.isPaused) {
                    runningChannels.push(channel)
                }
                map.set(channel.channelName, channel)
            })
            return {
                channels: allChannels,
                channelMap: map,
                runningChannels,
            }
        }

        if (reload) {
            cache.deleteCache(configs.CHANNEL_CACHE_KEY)
            return cache.tryGetCache(configs.CHANNEL_CACHE_KEY, queryFunc)
        } else {
            return cache.getCache(configs.CHANNEL_CACHE_KEY) as ChannelCache
        }
    }

    static async incrChannelRelatedRuleIpCount (channelName: string, ruleName: string) {
        const rulesKey = this.getChannelRelatedRuleSetKey(channelName)
        const countKey = this.getChannelRelatedRuleIpCountKey(channelName, ruleName)
        const pipeline = store.pipeline()
        await pipeline.INCR(countKey).SADD(rulesKey, ruleName).exec()
    }

    static async getChannelRulesIpCountRecord (channelName: string): Promise<{ruleName: string, usedIpCount: number}[]> {
        const rulesKey = this.getChannelRelatedRuleSetKey(channelName)
        const ruleNames = await store.Store.SCAN(rulesKey)
        const pipeline = store.pipeline()
        ruleNames.forEach(ruleName => pipeline.GET(this.getChannelRelatedRuleIpCountKey(channelName, ruleName)))
        const resArr = await pipeline.exec()
        return resArr.map((count, index) => ({
            ruleName: ruleNames[index],
            usedIpCount: count || 0,
        }))
    }

    static async removeChannelRelatedRuleIpCountRecord (channelName: string, ruleNames?: string[]) {
        if (!ruleNames) {
            const rulesKey = this.getChannelRelatedRuleSetKey(channelName)
            ruleNames = await store.Store.SCAN(rulesKey)
        }
        if (!ruleNames.length) {
            return
        }
        const pipeline = store.pipeline()
        ruleNames.forEach(name => {
            pipeline.SREM(this.getChannelRelatedRuleSetKey(channelName), name)
            pipeline.DEL(this.getChannelRelatedRuleIpCountKey(channelName, name))
        })
        await pipeline.exec()
    }

    channelName: string;
    validateUrl: string;
    httpValidateUrl?: string;
    status: IpPoolChannelStatus = IpPoolChannelStatus.normal;
    volume: number = DefaultValueConfigs.CHANNEL_DEFAULT_VOLUME;
    maxRtt: number = DefaultValueConfigs.CHANNEL_DEFAULT_MAXRTT;
    itemLifeTime: number = DefaultValueConfigs.CHANNEL_DEFAULT_ITEM_LIFETIME;
    itemBlockTime: number = DefaultValueConfigs.CHANNEL_DEFAULT_ITEM_BLOCK_TIME;

    get isPaused () {
        return this.status === IpPoolChannelStatus.paused
    }

    get isDefaultChannel () {
        return this.channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME
    }

    constructor(options: Partial<IpPoolChannelDef> & Pick<IpPoolChannelDef, 'channelName'>) {
        Object.assign(this, options)
    }

    private _getStorageData() {
        const { channelName, validateUrl, httpValidateUrl, status, itemBlockTime, itemLifeTime, volume, maxRtt} = this
        const data: IpPoolChannelDef = {
            channelName,
            validateUrl,
            httpValidateUrl,
            status,
            itemBlockTime,
            itemLifeTime,
            volume,
            maxRtt,
        }
        return data
    }

    async save() {
        await store.Store.SADD(CHANNEL_NAMES_SET_KEY, this.channelName)
        await store.Store.SET(IpPoolChannel.getChannelInfoKey(this.channelName), this._getStorageData())
    }

    async remove() {
        await store.Store.SREM(CHANNEL_NAMES_SET_KEY, this.channelName)
        await store.Store.DEL(IpPoolChannel.getChannelInfoKey(this.channelName))
        await IpPoolChannel.removeChannelRelatedRuleIpCountRecord(this.channelName)
        await ChannelIpDataModel.removeChannelAllIps(this.channelName)
        await ChannelIpDataModel.removeAllChannelBlockIps(this.channelName)
        await ChannelIpDataModel.removeChannelBackupIPsSet(this.channelName)
    }

}

interface ChannelIpDataInitOptions extends Partial<ChannelIpDataDef>{
    host?: string;
    ip?: string;
    port?: number;
    channelName?: string;
}

type SortableFeildName = keyof Pick<ChannelIpDataModel, 'usedCount' | 'validateCount' | 'rtt' | 'nextValidateTime' | 'httpType' | 'anonymity'>

const sortabledFeilds: SortableFeildName[] = ['rtt', 'usedCount', 'validateCount', 'nextValidateTime', 'anonymity', 'httpType']

type HashGetAbleFeildName = keyof Pick<ChannelIpDataModel, 'fromRule'>

const hashGetAbleFeilds: HashGetAbleFeildName[] = ['fromRule']

export class ChannelIpDataModel implements ChannelIpDataDef {
    private static getChannelIpDataMapKey(channelName) {
        return generateRedisKey(`cn-${channelName}-ipdata`)
    }

    private static getChannelSortableFeildSetKey(channelName: string, feildName: SortableFeildName) {
        return generateRedisKey(`cn-${channelName}-ipdata-sort-${feildName}`)
    }

    private static getChannelHashGetAbleFeildKey (channelNmae: string, feildName: HashGetAbleFeildName) {
        return generateRedisKey(`cn-${channelNmae}-ipdata-map-${feildName}`)
    }
    
    private static getChannelBlockedIpSetKey (channelName: string) {
        return generateRedisKey(`cn-${channelName}-blocked-host`)
    }

    private static getIpAssignedChannelSetKey(host: string) {
        return generateRedisKey(`host-${host}-assigned-channels`)
    }

    private static getChannelBackupIpSetKey (channelName: string,) {
        return generateRedisKey(`cn-${channelName}-bakcup-ip-set`)
    }

    private static getLocationIpSetKey (locationCode: string) {
        return generateRedisKey(`location-code-${locationCode}-ips`)
    }

    private static getIpLocationMapKey () {
        return generateRedisKey('host-location-map')
    }

    private static assignToChannel(host: string, channelName: string): Promise<any>;
    private static assignToChannel(host: string, channelName: string, pipeline: store.PipelineInstance): store.PipelineInstance;
    private static assignToChannel(host: string, channelName: string, pipeline?: store.PipelineInstance) {
        const key = this.getIpAssignedChannelSetKey(host)
        if (pipeline) {
            return pipeline.SADD(key, channelName)
        } else {
            return store.Store.SADD(key, channelName)
        }
    }

    private static revokeAssignToChannel(host: string, channelName: string): Promise<any>;
    private static revokeAssignToChannel(host: string, channelName: string, pipeline: store.PipelineInstance): store.PipelineInstance;
    private static revokeAssignToChannel(host: string, channelName: string, pipeline?: store.PipelineInstance): store.PipelineInstance | Promise<any> {
        const key = this.getIpAssignedChannelSetKey(host)
        if (pipeline) {
            return pipeline.SREM(key, channelName)
        } else {
            return store.Store.SREM(key, channelName)
        }
    }

    private static removeIpAssignedToChannelsSet(host: string): Promise<any>;
    private static removeIpAssignedToChannelsSet(host: string, pipeline: store.PipelineInstance): store.PipelineInstance;
    private static removeIpAssignedToChannelsSet(host: string, pipeline?: store.PipelineInstance): store.PipelineInstance | Promise<any> {
        const setKey = this.getIpAssignedChannelSetKey(host)
        if (pipeline) {
            return pipeline.DEL(setKey)
        } else {
            return store.Store.DEL(setKey)
        }
    }
    
    // no validate
    static addIpToChannelBackupIpSet (channelName: string, hosts: string[]): Promise<any>;
    static addIpToChannelBackupIpSet (channelName: string, hosts: string[], pipeline: store.PipelineInstance): store.PipelineInstance;
    static addIpToChannelBackupIpSet (channelName: string, hosts: string[], pipeline?: store.PipelineInstance) {
        if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
            throw new Error('invalid channel name')
        }
        if (!hosts.length) {
            return pipeline
        }
        const setKey = this.getChannelBackupIpSetKey(channelName)
        if (pipeline) {
            return pipeline.SREM(setKey, hosts)
        } else {
            return store.Store.SADD(setKey, hosts)
        }
    }

    // validate 
    static async addIpsToChannelArrBackupSet (channels: IpPoolChannel[], ipDataList: ChannelIpDataModel[]) {
        if (!channels.length) {
            return
        }
        if (!ipDataList.length) {
            return
        }
        const tasks = channels.map(async channel => {
            if (channel.isDefaultChannel) {
                return
            }
            const channelHttpType = channel.validateUrl.includes('https') ? IpDataHttpTypes.https : IpDataHttpTypes.http
            const roughFilterArr: string[] = [], filterArr: string[] = []
            const isExistedPipeline = store.pipeline()
            const isBlockedPipeline = store.pipeline()
            ipDataList.forEach(ipData => {
                if (ipData.httpType < channelHttpType) {
                    return
                }
                if (ipData.rtt > channel.maxRtt) {
                    return
                }
                if (ipData.anonymity !== IpDataAnonymities.high) {
                    // TODO
                    return
                }
                // @ts-ignore
                global.count2 ++
                roughFilterArr.push(ipData.host)
                // TODO 优化 pipeline合并
                isExistedPipeline.HEXISTS(this.getChannelIpDataMapKey(channel.channelName), ipData.host)
                isBlockedPipeline.ZSCORE(this.getChannelBlockedIpSetKey(channel.channelName), ipData.host)
            })
            const [isExistedRes, isBlockedRes] = await Promise.all([
                isExistedPipeline.exec(),
                isBlockedPipeline.exec(),
            ])

            roughFilterArr.forEach((host, index) => {
                const isExisted = isExistedRes[index], isBlocked = isBlockedRes[index] !== null
                if (isExisted || isBlocked) {
                    return
                }
                filterArr.push(host)
            })

            await this.addIpToChannelBackupIpSet(channel.channelName, filterArr)
        }) 
        
        await Promise.all(tasks)
    }

    // validate 
    static async addIpsToAllChannelBackupSet (ipDataList: ChannelIpDataModel[]) {
        if (!ipDataList.length) {
            return
        }
        const {runningChannels} = IpPoolChannel.getChannelCache()
        await this.addIpsToChannelArrBackupSet(runningChannels, ipDataList)
        // const tasks = runningChannels.map(async channel => {
        //     if (channel.isDefaultChannel) {
        //         return
        //     }
        //     const channelHttpType = channel.validateUrl.includes('https') ? IpDataHttpTypes.https : IpDataHttpTypes.http
        //     const roughFilterArr: string[] = [], filterArr: string[] = []
        //     const isExistedPipeline = store.pipeline()
        //     const isBlockedPipeline = store.pipeline()
        //     ipDataList.forEach(ipData => {
        //         if (ipData.httpType < channelHttpType) {
        //             return
        //         }
        //         if (ipData.rtt > channel.maxRtt) {
        //             return
        //         }
        //         if (ipData.anonymity !== IpDataAnonymities.high) {
        //             // TODO
        //             return
        //         }
        //         roughFilterArr.push(ipData.host)
        //         // TODO 优化 pipeline合并
        //         isExistedPipeline.HEXISTS(this.getChannelIpDataMapKey(channel.channelName), ipData.host)
        //         isBlockedPipeline.SHAS(this.getChannelBlockedIpSetKey(channel.channelName), ipData.host)
        //     })
        //     const [isExistedRes, isBlockedRes] = await Promise.all([
        //         isExistedPipeline.exec(),
        //         isBlockedPipeline.exec(),
        //     ])

        //     roughFilterArr.forEach((host, index) => {
        //         const isExisted = isExistedRes[index], isBlocked = isBlockedRes[index]
        //         if (isExisted || isBlocked) {
        //             return
        //         }
        //         filterArr.push(host)
        //     })

        //     await this.addIpToChannelBackupIpSet(channel.channelName, filterArr)
        // }) 
        
        // await Promise.all(tasks)
        
    }

    static removeIpFromChannelBackupIpSet (channelName: string, hosts: string[]): Promise<any>;
    static removeIpFromChannelBackupIpSet (channelName: string, hosts: string[], pipeline: store.PipelineInstance): store.PipelineInstance;
    static removeIpFromChannelBackupIpSet (channelName: string, hosts: string[], pipeline?: store.PipelineInstance) {
        if (!hosts.length) {
            return pipeline
        }
        if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
            throw new Error('invalid channel name')
        }
        const setKey = this.getChannelBackupIpSetKey(channelName)
        if (pipeline) {
            return pipeline.SREM(setKey, hosts)
        } else {
            return store.Store.SREM(setKey, hosts)
        }
    }

    static removeChannelBackupIPsSet (channelName: string): Promise<any>;
    static removeChannelBackupIPsSet (channelName: string, pipeline: store.PipelineInstance): store.PipelineInstance;
    static removeChannelBackupIPsSet (channelName: string, pipeline?: store.PipelineInstance) {
        if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
            throw new Error('invalid channel name')
        }
        const setKey = this.getChannelBackupIpSetKey(channelName)
        if (pipeline) {
            return pipeline.DEL(setKey)
        } else {
            return store.Store.DEL(setKey)
        }
    }

    static async getIpsFromChannelBackupSet (channelName: string, count?: number): Promise<string[]> {
        if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
            throw new Error('invalid channel name')
        }
        const setKey = this.getChannelBackupIpSetKey(channelName)
        return await store.Store.SCAN<string>(setKey, count)
    }

    private static removeChannelIpsRecord (channelName: string, hosts: string[], pipeline: store.PipelineInstance) {
        if (!hosts.length) {
            return pipeline
        }
        const isDefaultChannel = channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME
        hosts.forEach(host => {
            sortabledFeilds.forEach((feildName) => {
                pipeline.ZREM(ChannelIpDataModel.getChannelSortableFeildSetKey(channelName, feildName), host)
            })
            hashGetAbleFeilds.forEach(feildName => {
                pipeline.HDEL(this.getChannelHashGetAbleFeildKey(channelName, feildName), host)
            })
            pipeline.HDEL(ChannelIpDataModel.getChannelIpDataMapKey(channelName), host)
            if (!isDefaultChannel) {
                this.revokeAssignToChannel(host, channelName, pipeline)
            }
        })
        return pipeline
    }

    static async removeChannelAllIps(channelName: string) {
        const isDefaultChannel = channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME
        const allChannelHosts = (await store.Store.HGETALL(this.getChannelIpDataMapKey(channelName))).map(o => o.key)
        const {runningChannels} = IpPoolChannel.getChannelCache()

        const pipeline = store.pipeline()
        sortabledFeilds.forEach(feildName => {
            pipeline.DEL(this.getChannelSortableFeildSetKey(channelName, feildName))
        })
        hashGetAbleFeilds.forEach(feildName => {
            pipeline.DEL(this.getChannelHashGetAbleFeildKey(channelName, feildName))
        })
        pipeline.DEL(this.getChannelIpDataMapKey(channelName))
        if (!isDefaultChannel) {
            allChannelHosts.forEach(host => {
                this.revokeAssignToChannel(host, channelName, pipeline)
            })
        } else {
            allChannelHosts.forEach(host => {
                this.removeIpAssignedToChannelsSet(host, pipeline)
            })
            runningChannels.forEach(channel => {
                const {channelName} = channel
                if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
                    return
                }
                this.removeChannelBackupIPsSet(channelName, pipeline)
            })
        }
        await pipeline.exec()

        if (isDefaultChannel) {
            const allChannelNames = await IpPoolChannel.findAllChannel(true)
            await Promise.all(allChannelNames.filter(name => name !== channelName).map(this.removeChannelAllIps.bind(this)) )

            const pipeline = store.pipeline()
            const ipLocationCodes = await store.Store.HGETALL(this.getIpLocationMapKey())
            pipeline.DEL(this.getIpLocationMapKey())
            ipLocationCodes.forEach(({value: locationCode}) => {
                pipeline.DEL(this.getLocationIpSetKey(locationCode))
            })
            await pipeline.exec()
        }
    }

    static async removeChannelIps(channelName: string, hosts: string[]) {
        if (!hosts.length) {
            return
        }
        const pipeline = store.pipeline()
        const isDefaultChannel = channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME

        this.removeChannelIpsRecord(channelName, hosts, pipeline)

        await pipeline.exec()

        if (isDefaultChannel) {
            // TODO
            const allChannelNames = await IpPoolChannel.findAllChannel(true)
            const {runningChannels} = IpPoolChannel.getChannelCache()
            const pipeline1 = store.pipeline()
            allChannelNames.forEach(channelName => {
                this.removeChannelIpsRecord(channelName, hosts, pipeline1)
            })
            runningChannels.forEach(channel => {
                const {channelName} = channel
                if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
                    return
                }
                this.removeIpFromChannelBackupIpSet(channelName, hosts, pipeline1)
            })
            hosts.map(host => this.removeIpAssignedToChannelsSet(host, pipeline1))
            await pipeline1.exec()

            // remove location record
            const pipeline2 = store.pipeline()
            hosts.forEach(host => pipeline2.HGET(this.getIpLocationMapKey(), host))
            const locationCodes = await pipeline2.exec()

            const pipeline3 = store.pipeline()
            locationCodes.forEach((code, index) => {
                const host = hosts[index];
                pipeline3.HDEL(this.getIpLocationMapKey(), host)
                pipeline3.SREM(this.getLocationIpSetKey(code), host)
            })
            await pipeline3.exec()
        }
    }

    static async removeChannelExpiredBlockIps (channelName: string, blockDurationTime: number) {
        await store.Store.ZREMOVEBYSCORE(this.getChannelBlockedIpSetKey(channelName), 0, Date.now() - blockDurationTime)
    }

    static async removeAllChannelBlockIps (channelName: string) {
        await this.removeChannelExpiredBlockIps(channelName, 0)
    }

    static async isIpsBlockedByChannel (channelName: string, hosts: string[]): Promise<boolean[]> {
        if (!hosts.length) {
            return []
        }
        const pipeline = store.pipeline()
        const channelBlockSetKey = this.getChannelBlockedIpSetKey(channelName)
        hosts.forEach(host => {
            pipeline.ZSCORE(channelBlockSetKey, host)
        })
        const resScoreArr = await pipeline.exec()
        return resScoreArr.map(score => score !== null)
    }

    static async isIpsExistedInChannel (channelName: string, hosts: string[]): Promise<boolean[]> {
        if (!hosts.length) {
            return []
        }
        const pipeline = store.pipeline()
        hosts.forEach(host => {
            pipeline.HEXISTS(this.getChannelIpDataMapKey(channelName), host)
            // pipeline.ZSCORE(this.getChannelSortableFeildSetKey(channelName, 'lastValidateTime'), host)
        })
        const resArr = await pipeline.exec()
        return resArr.map(existed => !!existed)
    }

    static async findBySortableFeildOfScoreRange(channelName: string, feildName: SortableFeildName, min: number, max: number): Promise<string[]> {
        const hostArr = await store.Store.ZRANGEBYSCORE(this.getChannelSortableFeildSetKey(channelName, feildName), min, max)
        return hostArr as string[]
    }

    static async findBySortableFeildOfRankRange(channelName: string, feildName: SortableFeildName, start: number, end: number): Promise<string[]> {
        const hostArr = await store.Store.ZRANGE(this.getChannelSortableFeildSetKey(channelName, feildName), start, end)
        return hostArr as string[]
    }

    static async findChannelAllIpDataList (channelName: string): Promise<ChannelIpDataModel[]> {
        const ipDataMapKey = this.getChannelIpDataMapKey(channelName)
        const resArr = await store.Store.HGETALL(ipDataMapKey)
        return resArr.map(item => new this(item.value))
    }

    static async findChannelIpData (channelName: string, hosts: string[]): Promise<ChannelIpDataModel[]> {
        const pipleline = store.pipeline()
        hosts.forEach(host => {
            pipleline.HGET(this.getChannelIpDataMapKey(channelName), host)
        })
        const dataArr = await pipleline.exec()
        return dataArr.map(data => data && new this(data))
    }
    

    static async getChannelIpDataFeildValue<T extends HashGetAbleFeildName> (channelName: string, feildName: T, hosts: string[]): Promise<ChannelIpDataModel[T][]> {
        const pipeline = store.pipeline()
        hosts.forEach(host => {
            pipeline.HGET(this.getChannelHashGetAbleFeildKey(channelName, feildName), host)
        })
        return await pipeline.exec()
    }

    static async countChannelIps (channelName: string): Promise<number> {
        return await store.Store.HLEN(this.getChannelIpDataMapKey(channelName))
    }

    readonly ip: string;
    readonly port: number;
    readonly channelName: string = DefaultValueConfigs.DEFAULT_CHANNEL_NAME;
    readonly host: string;

    readonly usedCount: number = 0;
    readonly rtt: number;
    readonly validateCount: number = 0;
    readonly lastValidateTime: number = Date.now(); // 时间戳
    readonly nextValidateTime: number = Date.now();

    readonly fromRule?: string;
    readonly anonymity?: number;
    readonly httpType?: number;
    readonly location?: string; // code

    get isDefaultChannel () {
        return this.channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME
    }

    constructor(options: ChannelIpDataInitOptions) {
        const { host, ip, port } = options
        if (host) {
            const urlObj = new URL(host)
            this.ip = urlObj.hostname
            this.port = Number(urlObj.port)
        } else if (ip && port) {
            this.host = UrlFormat({
                hostname: ip,
                port: port,
                protocol: 'http',
            })
        } else {
            throw new Error('invalid options')
        }
        Object.assign(this, options)
    }

    private _getChannelIpData(): ChannelIpDataDef {
        const { usedCount, validateCount, lastValidateTime, rtt, anonymity, httpType, location, fromRule, host, nextValidateTime } = this
        return {
            host,
            usedCount,
            validateCount,
            lastValidateTime,
            nextValidateTime,
            rtt,
            httpType,
            anonymity,
            location,
            fromRule,
        }
    }

    private _isValid() {
        return !!(this.host && this.channelName)
    }

    private _canSave () {
        const flag = this._isValid() && (
            this.isDefaultChannel ?  [this.httpType, this.anonymity].every(v => typeof v === 'number') && !!this.location : true
        )
        if (!flag) {
            throw new Error('invalid channel ipdata save data')
        }
    }

    private _preCheck() {
        if (!this._isValid()) {
            throw new Error('invalid channel ipdata model data')
        }
    }

    // 
    
    async save() {
        this._canSave()

        const findChannel = await IpPoolChannel.findChannelByName(this.channelName)
        if (!findChannel) {
            throw new Error(`channel:${this.channelName} not found`)
        }

        const pipeline = store.pipeline()
        pipeline.HSET(ChannelIpDataModel.getChannelIpDataMapKey(this.channelName), this.host, this._getChannelIpData())
        sortabledFeilds.forEach(feildName => {
            const value = this[feildName]
            if (typeof value !== 'number') {
                return
            }
            pipeline.ZADD(ChannelIpDataModel.getChannelSortableFeildSetKey(this.channelName, feildName), value, this.host)
        })
        if (!this.isDefaultChannel) {
            ChannelIpDataModel.assignToChannel(this.host, this.channelName, pipeline)
        } else {
            hashGetAbleFeilds.forEach(feildName => {
                const value = this[feildName]
                if (value === undefined) {
                    return
                }
                pipeline.HSET(ChannelIpDataModel.getChannelHashGetAbleFeildKey(this.channelName, feildName), this.host, value)
            })
            pipeline.HSET(ChannelIpDataModel.getIpLocationMapKey(), this.host, this.location)
            pipeline.SADD(ChannelIpDataModel.getLocationIpSetKey(this.location), this.host)
        }
        await pipeline.exec()
    }

    async remove() {
        this._preCheck()
       console.log(`channelIpData: remove ${this.channelName}/${this.host}`)
       await ChannelIpDataModel.removeChannelIps(this.channelName, [this.host])
    }

    async block () {
        this._preCheck()
        if (this.isDefaultChannel) {
            throw new Error('default channel ipdata can not be blocked')
        }
        console.log(`channelIpData: block ${this.channelName}/${this.host}`)
        await this.remove()
        const blockedSetKey = ChannelIpDataModel.getChannelBlockedIpSetKey(this.channelName)
        await store.Store.ZADD(blockedSetKey, Date.now(), this.host)
    }

    async updateFeild(feildName: keyof Pick<ChannelIpDataModel, 'location'>, value: string)
    async updateFeild(feildName: keyof Pick<ChannelIpDataInitOptions, 'lastValidateTime'>, value: number)
    async updateFeild(feildName: HashGetAbleFeildName, value: string)
    async updateFeild(feildName: SortableFeildName, value: number)
    async updateFeild(feildName: any, value: any) {
        this._preCheck()
        Reflect.set(this, feildName, value)
    }

}

type RuleGetIpValidTypes = 'invalid' | 'valid'

export class GetIpRule implements CrawlRuleDef {
    private static getRuleMapKey () {
        return generateRedisKey('getip-rule-data-map')
    }

    private static getRuleUsedCountSetKey () {
        return generateRedisKey('getip-rule-used-count')
    }

    private static getRuleCrawlIpCountKey (ruleName: string, type: RuleGetIpValidTypes) {
        return generateRedisKey(`getip-rule-${ruleName}-getip-${type}-count`)
    }

    static getRuleCount () {
        return store.Store.HLEN(this.getRuleMapKey())
    }

    static findRuleByName (ruleName: string): Promise<GetIpRule>
    static findRuleByName (ruleName: string, pipeline: store.PipelineInstance): store.PipelineInstance
    static findRuleByName (ruleName: string, pipeline?: store.PipelineInstance) {
        if (pipeline) {
            return pipeline.HGET(this.getRuleMapKey(), ruleName)
        }
        const queryFunc = async () => {
            const ruleJsonObj = await store.Store.HGET(this.getRuleMapKey(), ruleName)
            return ruleJsonObj ? this.fromJson(ruleJsonObj) : null
        }
        return queryFunc()
    }

    static async getAllRules () {
        const allRuleJsonObjs = await store.Store.HGETALL(this.getRuleMapKey())
        return allRuleJsonObjs.map(jsonObj => this.fromJson(jsonObj))
    }

    static async getRulesBySortedUsedCount (ruleCount?: number) { // 升序
        const sortedRuleNameArr = await store.Store.ZRANGEBYSCORE(this.getRuleUsedCountSetKey(), 0, null)
        const pipeline = store.pipeline()
        sortedRuleNameArr.slice(0, ruleCount).forEach(name => pipeline.HGET(this.getRuleMapKey(), name))
        const resArr = await pipeline.exec()
        return resArr.map(originDataObj => this.fromJson(originDataObj))
    }

    static async removeRules (ruleNames: string[]) {
        const pipeline = store.pipeline()
        ruleNames.forEach(name => pipeline.HDEL(this.getRuleMapKey(), name))
        await pipeline.exec()
    }

    static async incrRuleGetIpCount (ruleName: string, type: RuleGetIpValidTypes, increment: number) {
        const key = await this.getRuleCrawlIpCountKey(ruleName, type)
        return await store.Store.INCRBY(key, increment)
    }

    static async getRuleGetIpCountInfo (ruleName: string): Promise<{validCount: number, invalidCount: number}> {
        const pipeline = store.pipeline();
        ['valid', 'invalid'].forEach((type: RuleGetIpValidTypes) => {
            pipeline.GET(this.getRuleCrawlIpCountKey(ruleName, type))
        })
        const [validCount, invalidCount] = await pipeline.exec()
        return {
            validCount: validCount || 0,
            invalidCount: invalidCount || 0,
        }
    }

    static removeRuleGetIpCountRecord (ruleName: string): Promise<any>
    static removeRuleGetIpCountRecord (ruleName: string, pipeline: store.PipelineInstance): store.PipelineInstance
    static removeRuleGetIpCountRecord (ruleName: string, pipeline?: store.PipelineInstance) {
        const deferExec = !!pipeline
        pipeline = pipeline || store.pipeline();
        ['valid', 'invalid'].forEach((type: RuleGetIpValidTypes) => {
            pipeline.DEL(this.getRuleCrawlIpCountKey(ruleName, type))
        })
        if (deferExec) {
            return pipeline
        } else {
            return pipeline.exec()
        }
    }

    static fromJson (jsonObj): GetIpRule {
        return new this(fromJson(jsonObj))
    }

    private _getStorageData (): CrawlRuleDef {
        const {name, url, itemSelector, itemStartIndex, itemInfoSelectors, pagination, interceptor, usedCount, isInRuleFile} = this
        return {
            name,
            url,
            itemSelector,
            itemStartIndex,
            itemInfoSelectors,
            pagination,
            interceptor,
            usedCount,
            isInRuleFile
        }
    }

    constructor (options: Partial<CrawlRuleDef> & Pick<CrawlRuleDef, 'name'>) {
        Object.assign(this, options)
    }

    name: string;
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

    usedCount: number = 0;
    isInRuleFile = false;

    async save () {
        const pipeline = store.pipeline()
        await pipeline.HSET(GetIpRule.getRuleMapKey(), this.name, toJson(this._getStorageData())).
            ZADD(GetIpRule.getRuleUsedCountSetKey(), this.usedCount, this.name).
            exec()
    }

    async remove () {
        const pipeline = store.pipeline()
        await GetIpRule.removeRuleGetIpCountRecord(this.name, pipeline).
            HDEL(GetIpRule.getRuleMapKey(), this.name).
            ZREM(GetIpRule.getRuleUsedCountSetKey(), this.name).
            exec()
    }
}

export async function init() {
    let defaultChannel = await IpPoolChannel.findChannelByName(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
    if (!defaultChannel) {
        const defaultChannel = new IpPoolChannel({
            channelName: DefaultValueConfigs.DEFAULT_CHANNEL_NAME,
            validateUrl: DefaultValueConfigs.DEFAULT_CHANNEL_HTTPS_VALIDATE_URL, // TODO
            httpValidateUrl: DefaultValueConfigs.DEFAULT_CHANNEL_HTTP_VALIDATE_URL,
            volume: DefaultValueConfigs.DEFAULT_CHANNEL_MIN_SIZE,
        })
        await defaultChannel.save()
    }
    await IpPoolChannel.getChannelCache(true)
}

async function test() {
   await init()
    const model = new ChannelIpDataModel({
        ip: '0.0.0.0',
        port: 3001,
        // channelName: 'www.baidu.com'
    })
    await model.save()
    await model.updateFeild('rtt', 1200)
    await model.updateFeild('lastValidateTime', 300)


    const allModels = await ChannelIpDataModel.findBySortableFeildOfScoreRange(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, 'rtt', 0, 2000)
    console.log(allModels)
    await model.remove()
    const allModels2 = await ChannelIpDataModel.findBySortableFeildOfScoreRange(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, 'rtt', 0, 2000)
    console.log(allModels2)
    // await ChannelIpDataModel.removeChannelAllIps('www.baidu.com')

}

// test()

async function testBlock () {
    await init()
    const model = new ChannelIpDataModel({
        ip: '0.0.0.0',
        port: 3001,
        // channelName: 'www.baidu.com'
    })
    model.updateFeild('anonymity', IpDataAnonymities.high)
    model.updateFeild('httpType', IpDataHttpTypes.https)
    await model.save()
    await model.block()
    let res = await ChannelIpDataModel.isIpsBlockedByChannel(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, ['0.0.0.0:3001'])
    console.log('')
}

// testBlock()


async function testCountAndExisted () {
    await init()
    const host = 'http://0.0.0.0:3001'
    const model = new ChannelIpDataModel({
        host,
        // channelName: 'www.baidu.com'
    })
    model.updateFeild('anonymity', IpDataAnonymities.high)
    model.updateFeild('httpType', IpDataHttpTypes.https)
    await model.save()
    let res: any = await ChannelIpDataModel.isIpsExistedInChannel(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, [host])
    res = await ChannelIpDataModel.countChannelIps(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
    await model.remove()
    res = await ChannelIpDataModel.isIpsExistedInChannel(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, [host])
    res = await ChannelIpDataModel.countChannelIps(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
    console.log()
}

// testCountAndExisted()

async function testChannel () {
     const channel = new IpPoolChannel({
        channelName: DefaultValueConfigs.DEFAULT_CHANNEL_NAME,
        validateUrl: 'url'
    })
    await channel.save()
    const all = await IpPoolChannel.findAllChannel()
    const defaultChannel = await IpPoolChannel.findChannelByName(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
    console.log(defaultChannel)
    // await channel.remove()
    // const all2 = await IpPoolChannel.findAllChannel()
    // console.log(all2)
}

// testChannel()


// test()

async function testRemoveList() {
    await init()
    const testChannelName = 'www.baidu.com'
    const model1 = new ChannelIpDataModel({
        ip: '0.0.0.0',
        port: 3001,
        // channelName: 'www.baidu.com'
    })
    model1.updateFeild('anonymity', IpDataAnonymities.high)
    model1.updateFeild('httpType', IpDataHttpTypes.https)
    await model1.save()
    await model1.block()
    await model1.remove()
    await model1.updateFeild('rtt', 1200)
    await model1.updateFeild('lastValidateTime', 300)

    const model2 = new ChannelIpDataModel({
        ip: '0.0.0.0',
        port: 3001,
        channelName: 'www.baidu.com'
    })
    await model2.save()
    await model2.updateFeild('rtt', 1200)
    await model2.updateFeild('lastValidateTime', 300)

    const allModels = await ChannelIpDataModel.findBySortableFeildOfScoreRange(testChannelName, 'rtt', null, null)
    console.log(allModels)
    await new IpPoolChannel({
        channelName: 'www.baidu.com',
        validateUrl: ''
    }).save()

    await ChannelIpDataModel.removeChannelIps(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, ['0.0.0.0:3001'])
    const allModels2 = await ChannelIpDataModel.findBySortableFeildOfScoreRange(testChannelName, 'rtt', null, null)
    console.log(allModels2)
    await ChannelIpDataModel.removeChannelIps('www.baidu.com', ['0.0.0.0:3001'])

}


// testRemoveList()

async function removeChannelAllIp () {
    await init()
    const testChannelName = 'www.baidu.com'
    const testChannel = new IpPoolChannel({
        channelName: testChannelName,
        validateUrl: '',
    })
    await testChannel.save()
    
    const model1 = new ChannelIpDataModel({
        ip: '0.0.0.0',
        port: 3001,
        // channelName: 'www.baidu.com'
    })
    await model1.save()
    await model1.updateFeild('rtt', 1200)
    await model1.updateFeild('lastValidateTime', 300)

    const model2 = new ChannelIpDataModel({
        ip: '0.0.0.0',
        port: 3001,
        channelName: testChannelName
    })
    await model2.save()
    await model2.updateFeild('rtt', 1200)
    await model2.updateFeild('lastValidateTime', 300)

    const defaultChannel = await IpPoolChannel.findChannelByName(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
    // defaultChannel.remove()
    testChannel.remove()
}

// removeChannelAllIp()


function testToJsonFromJson () {
    // @ts-ignore
    const res = toJson({
        func: () => console.log(1),
        object: {
            a: 1,
            func2: () => console.log('func 2')
        },
        array: [1, 2, 3],
        number: 1,
        string: 'string',
    })
    const str = JSON.stringify(res)
    const parsed = JSON.parse(str)
    // @ts-ignore
    const origin = fromJson(parsed)
    let funRes = origin.func()
    console.log(origin)
}

// testToJsonFromJson()

async function testLocation () {
    await init()
    const host = 'http://0.0.0.0:3001'
    const model = new ChannelIpDataModel({
        host,
        // channelName: 'www.baidu.com'
    })
    model.updateFeild('anonymity', IpDataAnonymities.high)
    model.updateFeild('httpType', IpDataHttpTypes.https)
    model.updateFeild('location', configs.UNKNOWN_LOCATION_CODE)
    await model.save()
    // await model.remove()
    // @ts-ignore
    await ChannelIpDataModel.removeChannelAllIps(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
}

// testLocation()


async function testChannelBackupSet () {
    await init()
    const channel2 = new IpPoolChannel({
        channelName: 'testchannel',
        validateUrl: 'https://www.baidu.com/baidu.html', // TODO
    })
    await channel2.save()
    const host = 'http://0.0.0.0:3001'
    const model = new ChannelIpDataModel({
        host,
        // channelName: 'www.baidu.com'
    })
    model.updateFeild('anonymity', IpDataAnonymities.high)
    model.updateFeild('httpType', IpDataHttpTypes.https)
    model.updateFeild('location', configs.UNKNOWN_LOCATION_CODE)
    await model.save()
    await ChannelIpDataModel.addIpToChannelBackupIpSet('testchannel', [host])
    await model.remove()
}

// testChannelBackupSet()

async function testFindAllRule () {
    let res = await GetIpRule.getAllRules()
    console.log(res)
    res = await GetIpRule.getRulesBySortedUsedCount(2)
    console.log(res)
}

// testFindAllRule()

async function testChannelRuleRecord () {
    await IpPoolChannel.incrChannelRelatedRuleIpCount('zhihu', 'testchannelname')
    let res = await IpPoolChannel.getChannelRulesIpCountRecord('zhihu')
    console.log(res)
    await IpPoolChannel.removeChannelRelatedRuleIpCountRecord('zhihu')
}

// testChannelRuleRecord()

async function testRuleValidCount () {
    await GetIpRule.incrRuleGetIpCount('zhihu', 'invalid', 3)
    let res = await GetIpRule.getRuleGetIpCountInfo('zhihu')
    console.log(res)
}

// testRuleValidCount()

async function testHashGetAbleFeild () {
    await init()
    const channel2 = new IpPoolChannel({
        channelName: 'testchannel',
        validateUrl: 'https://www.baidu.com/baidu.html', // TODO
    })
    await channel2.save()
    const host = 'http://0.0.0.0:3001'
    const model = new ChannelIpDataModel({
        host,
        channelName: DefaultValueConfigs.DEFAULT_CHANNEL_NAME,
        // channelName: 'www.baidu.com'
    })
    model.updateFeild('anonymity', IpDataAnonymities.high)
    model.updateFeild('httpType', IpDataHttpTypes.https)
    model.updateFeild('location', configs.UNKNOWN_LOCATION_CODE)
    model.updateFeild('fromRule', 'testrule-zhihu')
    await model.save()
    // await model.remove()
    let res = await ChannelIpDataModel.getChannelIpDataFeildValue(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, 'fromRule', [host])
    console.log(res)
    await ChannelIpDataModel.removeChannelAllIps(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
}

// testHashGetAbleFeild()

import { URL, format as UrlFormat } from 'url'

import * as store from 'lib/store'
import {IpDataAnonymities, IpDataHttpTypes, CrawlRule, Selector, FreshIpData} from 'type'
import { generateRedisKey } from 'utils';
import settings, { config } from 'getSettings'

interface ChannelOptions {
    channelName: string;
    validateUrl: string;
    httpValidateUrl?: string; // 供DEFAULT_CHANNEL 使用
}

const CHANNEL_NAMES_SET_KEY = 'CHANNEL_NAME_SET'

export class IpPoolChannel implements ChannelOptions {
    static getChannelInfoKey(channelName: string) {
        return generateRedisKey(`${channelName}-data`)
    }

    static async findAllChannel(onlyName = false) {
        const allChannelNames = await store.Store.SMEMBERS(CHANNEL_NAMES_SET_KEY)
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

    static async findChannel(channelName: string) {
        const channelInfo = await store.Store.GET(this.getChannelInfoKey(channelName))
        return channelInfo && new this(channelInfo)
    }

    channelName: string;
    validateUrl: string;
    httpValidateUrl?: string;

    get isDefaultChannel () {
        return this.channelName === config.DEFAULT_CHANNEL_NAME
    }

    constructor(options: ChannelOptions) {
        Object.assign(this, options)
    }

    private _getStorageData() {
        const { channelName, validateUrl, httpValidateUrl } = this
        return {
            channelName,
            validateUrl,
            httpValidateUrl,
        }
    }

    async save() {
        await store.Store.SADD(CHANNEL_NAMES_SET_KEY, this.channelName)
        await store.Store.SET(IpPoolChannel.getChannelInfoKey(this.channelName), this._getStorageData())
    }

    async remove() {
        await store.Store.SREM(CHANNEL_NAMES_SET_KEY, this.channelName)
        await store.Store.DEL(IpPoolChannel.getChannelInfoKey(this.channelName))
        await ChannelIpDataModel.removeChannelAllIps(this.channelName)
    }

}


interface ChannelIpData {
    rtt: number;
    usedCount: number;
    validateCount: number;
    lastValidateTime: number;

    anonymity: number;
    httpType: number;

    location: string;
}

interface ChannelIpDataInitOptions extends Partial<ChannelIpData>{
    host?: string;
    ip?: string;
    port?: number;
    channelName?: string;
}

type SortableFeildName = keyof Pick<ChannelIpDataModel, 'usedCount' | 'validateCount' | 'rtt' | 'lastValidateTime' | 'httpType' | 'anonymity'>

const sortabledFeilds: SortableFeildName[] = ['rtt', 'usedCount', 'validateCount', 'lastValidateTime', 'anonymity', 'httpType']

export class ChannelIpDataModel implements ChannelIpData {
    private static getChannelIpDataMapKey(channelName) {
        return generateRedisKey(`${channelName}-ipdata`)
    }

    private static getChannelSortableFeildSetKey(channelName: string, feildName: SortableFeildName) {
        return generateRedisKey(`${channelName}-${feildName}`)
    }
    
    private static getChannelBlockedIpSetKey (channelName: string) {
        return generateRedisKey(`${channelName}-blocked-host`)
    }

    private static getIpAssignedChannelSetKey(host: string) {
        return generateRedisKey(`${host}-assigned-channels`)
    }

    private static getLocationIpSetKey (locationCode: string) {
        return generateRedisKey(`location-${locationCode}-ips`)
    }

    private static getIpLocationMapKey () {
        return generateRedisKey('ip-location-map')
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

    private static removeChannelIpsRecord (channelName: string, hosts: string[], pipeline: store.PipelineInstance) {
        const isDefaultChannel = channelName === config.DEFAULT_CHANNEL_NAME
        hosts.forEach(host => {
            sortabledFeilds.forEach((feildName) => {
                pipeline.ZREM(ChannelIpDataModel.getChannelSortableFeildSetKey(channelName, feildName), host)
            })
            pipeline.HDEL(ChannelIpDataModel.getChannelIpDataMapKey(channelName), host)
            if (isDefaultChannel) {
                this.revokeAssignToChannel(host, channelName, pipeline)
            }
        })
        return pipeline
    }

    static async removeChannelAllIps(channelName: string) {
        const isDefaultChannel = channelName === config.DEFAULT_CHANNEL_NAME
        const allChannelHosts = (await store.Store.HGETALL(this.getChannelIpDataMapKey(channelName))).map(o => o.key)

        const pipeline = store.pipeline()
        sortabledFeilds.forEach(feildName => {
            pipeline.DEL(this.getChannelSortableFeildSetKey(channelName, feildName))
        })
        pipeline.DEL(this.getChannelIpDataMapKey(channelName))
        if (!isDefaultChannel) {
            allChannelHosts.forEach(host => this.revokeAssignToChannel(host, channelName, pipeline))
        } else {
            allChannelHosts.forEach(host => this.removeIpAssignedToChannelsSet(host, pipeline))
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
        const pipeline = store.pipeline()
        const isDefaultChannel = channelName === config.DEFAULT_CHANNEL_NAME

        this.removeChannelIpsRecord(channelName, hosts, pipeline)

        await pipeline.exec()

        if (isDefaultChannel) {
            // TODO
            const allChannelNames = await IpPoolChannel.findAllChannel(true)
            const pipeline1 = store.pipeline()
            allChannelNames.forEach(channelName => {
                this.removeChannelIpsRecord(channelName, hosts, pipeline1)
            })
            hosts.map(host => this.removeIpAssignedToChannelsSet(host))
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

    static async findBySortableFeildOfRange(channelName: string, feildName: SortableFeildName, min: number, max: number): Promise<string[]> {
        const hostArr = await store.Store.ZRANGEBYSCORE(this.getChannelSortableFeildSetKey(channelName, feildName), min, max)
        return hostArr as string[]
    }

    static async removeChannelExpiredBlockIps (channelName: string, blockDurationTime: number) {
        await store.Store.ZREMOVEBYSCORE(this.getChannelBlockedIpSetKey(channelName), 0, Date.now() - blockDurationTime)
    }

    static async isIpsBlockedByChannel (channelName: string, hosts: string[]) {
        const pipeline = store.pipeline()
        const channelBlockSetKey = this.getChannelBlockedIpSetKey(channelName)
        hosts.forEach(host => {
            pipeline.ZSCORE(channelBlockSetKey, host)
        })
        const resScoreArr = await pipeline.exec()
        return resScoreArr.map(score => score !== null)
    }

    static async isIpsExistedInChannel (channelName: string, hosts: string[]) {
        const pipeline = store.pipeline()
        hosts.forEach(host => {
            pipeline.HEXISTS(this.getChannelIpDataMapKey(channelName), host)
            // pipeline.ZSCORE(this.getChannelSortableFeildSetKey(channelName, 'lastValidateTime'), host)
        })
        const resArr = await pipeline.exec()
        return resArr.map(existed => !!existed)
    }

    static async findChannelIpData (channelName: string, host: string) {
        const info = await store.Store.HGET(this.getChannelIpDataMapKey(channelName), host)
        return info ? new this({
            host,
            ...info,
        }) : null
    }

    static async countChannelIps (channelName: string) {
        return await store.Store.HLEN(this.getChannelIpDataMapKey(channelName))
    }

    readonly ip: string;
    readonly port: number;
    readonly channelName: string = config.DEFAULT_CHANNEL_NAME;
    readonly host: string;

    readonly usedCount: number = 0;
    readonly rtt: number;
    readonly validateCount: number = 0;
    readonly lastValidateTime: number = Date.now(); // 时间戳
    readonly anonymity: number;
    readonly httpType: number;
    readonly location: string; // code

    get isDefaultChannel () {
        return this.channelName === config.DEFAULT_CHANNEL_NAME
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

    private _getChannelIpData(): ChannelIpData {
        const { usedCount, validateCount, lastValidateTime, rtt, anonymity, httpType, location } = this
        return {
            usedCount,
            validateCount,
            lastValidateTime,
            rtt,
            httpType,
            anonymity,
            location,
        }
    }

    private _isValid() {
        return !!(this.host && this.channelName)
    }

    private _canSave () {
        const flag = this._isValid() && [this.httpType, this.anonymity].every(v => typeof v === 'number') && !!this.location
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

        const findChannel = await IpPoolChannel.findChannel(this.channelName)
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
        console.log(`channelIpData: block ${this.channelName}/${this.host}`)
        await this.remove()
        const blockedSetKey = ChannelIpDataModel.getChannelBlockedIpSetKey(this.channelName)
        await store.Store.ZADD(blockedSetKey, Date.now(), this.host)
    }

    async updateFeild(feildName: keyof Pick<ChannelIpDataModel, 'location'>, value: string)
    async updateFeild(feildName: SortableFeildName, value: number)
    async updateFeild(feildName: any, value: any) {
        this._preCheck()
        Reflect.set(this, feildName, value)
    }

}

export class GetIpRule implements CrawlRule {
    private static getRuleMapKey () {
        return generateRedisKey('getip-rule-map')
    }

    private static getRuleUsedCountSetKey () {
        return generateRedisKey('getip-rule-used-count')
    }

    private static _toJson (obj: any) {
        let type = typeof obj
        if (type === 'function') {
            return {
                type,
                isLeafNode: true,
                value: obj.toString(),
            }
        }
        if (type !== 'object' || Array.isArray(obj)) {
            return {
                type,
                isLeafNode: true,
                value: obj
            }
        }
        
        let jsonObj: any = {}
        Object.keys(obj).forEach(key => {
            const value = Reflect.get(obj, key)
            Reflect.set(jsonObj, key, this._toJson(value))
        })
        return jsonObj
    }

    private static _fromJson (obj: any) {
        if (obj.isLeafNode) {
            if (obj.type === 'function') {
                const evalFuncBodyStr = `return ${obj.value}`
                return new Function(evalFuncBodyStr)()
            }
            return obj.value
        }
        let originObj: any = {}
        Object.keys(obj).forEach(key => {
            const descriptor = Reflect.get(obj, key)
            Reflect.set(originObj, key, this._fromJson(descriptor))
        })
        return originObj
    }

    static async findRuleByName (ruleName: string) {
        const ruleJsonObj = await store.Store.HGET(this.getRuleMapKey(), ruleName)
        return ruleJsonObj ? new this(this._fromJson(ruleJsonObj)) : null
    }

    static async getRulesBySortedUsedCount (ruleCount?: number) {
        const allRuleJsonObjs = await store.Store.HGETALL(this.getRuleMapKey())
        return allRuleJsonObjs.map(jsonObj => new this(this._fromJson(jsonObj.value))).slice(0, ruleCount)
    }

    constructor (options: Partial<CrawlRule>) {
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

    async save () {
        const pipeline = store.pipeline()
        await pipeline.HSET(GetIpRule.getRuleMapKey(), this.name, GetIpRule._toJson(this)).
            ZADD(GetIpRule.getRuleUsedCountSetKey(), this.usedCount, this.name).
            exec()
    }

    async remove () {
        const pipeline = store.pipeline()
        await pipeline.HDEL(GetIpRule.getRuleMapKey(), this.name).
            ZREM(GetIpRule.getRuleUsedCountSetKey(), this.name).
            exec()
    }
}

export async function init() {
    let defaultChannel = await IpPoolChannel.findChannel(config.DEFAULT_CHANNEL_NAME)
    if (!defaultChannel) {
        const defaultChannel = new IpPoolChannel({
            channelName: config.DEFAULT_CHANNEL_NAME,
            validateUrl: 'https://www.baidu.com/baidu.html', // TODO
            httpValidateUrl: 'http://www.baidu.com/baidu.html',
        })
        await defaultChannel.save()
    }
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


    const allModels = await ChannelIpDataModel.findBySortableFeildOfRange(config.DEFAULT_CHANNEL_NAME, 'rtt', 0, 2000)
    console.log(allModels)
    await model.remove()
    const allModels2 = await ChannelIpDataModel.findBySortableFeildOfRange(config.DEFAULT_CHANNEL_NAME, 'rtt', 0, 2000)
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
    let res = await ChannelIpDataModel.isIpsBlockedByChannel(config.DEFAULT_CHANNEL_NAME, ['0.0.0.0:3001'])
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
    let res: any = await ChannelIpDataModel.isIpsExistedInChannel(config.DEFAULT_CHANNEL_NAME, [host])
    res = await ChannelIpDataModel.countChannelIps(config.DEFAULT_CHANNEL_NAME)
    await model.remove()
    res = await ChannelIpDataModel.isIpsExistedInChannel(config.DEFAULT_CHANNEL_NAME, [host])
    res = await ChannelIpDataModel.countChannelIps(config.DEFAULT_CHANNEL_NAME)
    console.log()
}

// testCountAndExisted()

async function testChannel () {
     const channel = new IpPoolChannel({
        channelName: config.DEFAULT_CHANNEL_NAME,
        validateUrl: 'url'
    })
    await channel.save()
    const all = await IpPoolChannel.findAllChannel()
    const defaultChannel = await IpPoolChannel.findChannel(config.DEFAULT_CHANNEL_NAME)
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

    const allModels = await ChannelIpDataModel.findBySortableFeildOfRange(testChannelName, 'rtt', null, null)
    console.log(allModels)
    await new IpPoolChannel({
        channelName: 'www.baidu.com',
        validateUrl: ''
    }).save()

    await ChannelIpDataModel.removeChannelIps(config.DEFAULT_CHANNEL_NAME, ['0.0.0.0:3001'])
    const allModels2 = await ChannelIpDataModel.findBySortableFeildOfRange(testChannelName, 'rtt', null, null)
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

    const defaultChannel = await IpPoolChannel.findChannel(config.DEFAULT_CHANNEL_NAME)
    // defaultChannel.remove()
    testChannel.remove()
}

// removeChannelAllIp()


function testToJsonFromJson () {
    // @ts-ignore
    const res = GetIpRule._toJson({
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
    const origin = GetIpRule._fromJson(parsed)
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
    model.updateFeild('location', config.UNKNOWN_LOCATION_CODE)
    await model.save()
    // await model.remove()
    // @ts-ignore
    await ChannelIpDataModel.removeChannelAllIps(config.DEFAULT_CHANNEL_NAME)
}

// testLocation()
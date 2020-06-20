import { format as UrlFormat } from 'url';

import { getLocationNameByCode, parseLocation } from 'utils/location'
import { generateRedisKey, catchError, getMapValue } from 'utils';
import { DefaultValueConfigs, configs } from 'getSettings'
import { FreshIpData as WildIpData, IpDataHttpTypes, IpDataAnonymities, CrawlRule } from 'type'
import * as cache from 'lib/cache'
import getIpRules from 'config/rules'
import { baseValidate } from 'lib/validateIp'
import { crawl } from 'lib/getIp';
import { IpPoolChannel, ChannelIpDataModel, init as ModelInit, GetIpRule } from 'models/model'

async function getDefaultChannelAllIpDataList(): Promise<ChannelIpDataModel[]> {
    return await cache.tryGetCache<ChannelIpDataModel[]>(configs.ALL_DEFAULT_CHANNEL_IPS_KEY, async () => {
        return ChannelIpDataModel.findChannelAllIpDataList(DefaultValueConfigs.DEFAULT_CHANNEL_NAME);
    }, 1000 * 10);
}

function getIpDataNextBaseValidateTime (ipDataObj: ChannelIpDataModel, lifeTime: number) {
    if (!ipDataObj.isDefaultChannel) {
        throw new Error('invalid channel name (not default channel!)')
    }
    let intervalTime = 60 * 5 * 1000 + ipDataObj.validateCount * 60 * 2 * 1000
    if (intervalTime >= lifeTime) {
        intervalTime = lifeTime
    }
    return intervalTime + Date.now()
}

//@ts-ignore
global.count1 = 0
// @ts-ignore
global.count2 = 0
// @ts-ignore
global.count3 = 0
function test1 (ipData: ChannelIpDataModel) {
    if (ipData.httpType < 2) {
        return
    }
    if (ipData.anonymity !== 2) {
        return
    }
    //@ts-ignore
    global.count1 ++
}

export namespace ValidateTasksManage {
    interface ConfigOptions {
        threadCount: number;
        getChannelData: (channelName: string) => IpPoolChannel;
    }

    enum ValidateTasksManageStatus {
        started = 1,
        waittingStop,
        stopped,
    }

    export enum ValidateTypes {
        initialValidate = 1,
        assignToChannelValidate,
        baseValidate,
        locationValidate,
        anonymityValidate,
    }

    export interface ValidateTaskData {
        channelName: string;
        host: string;
        type: ValidateTypes;
        fromRule?: string; // 爬取的ip所对应的爬取规则
        wildIpData?: WildIpData; // 爬取到的初始化数据
    }

    const vars = {
        // isInited: false,
        maxThreadCount: 0,
        usedThreadCount: 0,
        status: ValidateTasksManageStatus.stopped,
        getChannel: null as ConfigOptions['getChannelData'],
        startTime: null as number,
        // leftTheradCount: 0,
    }
    // let TaskDataQueue: ValidateTaskData[] = []
    const TypedTaskCountMap: Map<string, number> = new Map()
    const TopLevelPriorityTaskQueue: ValidateTaskData[] = []
    const LowLevelPriorityTaskQuque: ValidateTaskData[] = []
    const MediumPriorityTaskQueue: ValidateTaskData[] = []

    const UtilFuncs = {
        useThread: (): number => {
            if (vars.status !== ValidateTasksManageStatus.started) {
                return null
            }
            if ((vars.maxThreadCount - vars.usedThreadCount) <= 0) {
                return null
            }
            vars.usedThreadCount++
            return Date.now()
        },
        unuseThread: (reqUseThreadTime: number) => {
            if (reqUseThreadTime < vars.startTime) {
                return
            }
            vars.usedThreadCount--
        },
        getTaskType (channelName: string, type: ValidateTypes) {
            return `${channelName}-${type}`
        },
        getQueueTaskCount () {
            return TopLevelPriorityTaskQueue.length + LowLevelPriorityTaskQuque.length + MediumPriorityTaskQueue.length
        },
        shiftFromTaskDataQueue() {
            // const task = TaskDataQueue.shift()
            // TODO 均衡算法
            let task = TopLevelPriorityTaskQueue.shift() || MediumPriorityTaskQueue.shift() || LowLevelPriorityTaskQuque.shift()
            if (task) {
                const typedTaskCount = getMapValue(TypedTaskCountMap, UtilFuncs.getTaskType(task.channelName, task.type))
                TypedTaskCountMap.set(UtilFuncs.getTaskType(task.channelName, task.type), typedTaskCount - 1)
            }
            return task
        },
        pushToTaskDataQueue(taskList: ValidateTaskData[]) {
            taskList.forEach(task => {
                // TaskDataQueue.push(task)
                if (task.type === ValidateTypes.baseValidate) {
                    TopLevelPriorityTaskQueue.push(task)
                } else if (task.type === ValidateTypes.initialValidate) {
                    LowLevelPriorityTaskQuque.push(task)
                } else {
                    MediumPriorityTaskQueue.push(task)
                }
                
                const typedTaskCount = getMapValue(TypedTaskCountMap, UtilFuncs.getTaskType(task.channelName, task.type), 0)
                TypedTaskCountMap.set(UtilFuncs.getTaskType(task.channelName, task.type), typedTaskCount + 1)
            })
        },
        clearTaskDataQueue() {
            // TaskDataQueue = []
            TopLevelPriorityTaskQueue.length = 0
            LowLevelPriorityTaskQuque.length = 0
            MediumPriorityTaskQueue.length = 0
            TypedTaskCountMap.clear()
        }
    }

    class Controller {
        @catchError('_execBaseValidate', (error, cb) => {
            cb({
                error,
            })
        })
        private static async _execBaseValidate(validateUrl: string, host: string, maxRtt: number): Promise<{ error: Error, rtt: number }> {
            let rtt: number
            const res = await baseValidate(validateUrl, host, maxRtt)
            rtt = res.rtt
            return {
                rtt,
                error: null
            }
        }

        @catchError('_execLocationValidate', (error, cb) => {
            cb({
                error,
            })
        })
        private static async _execLocationValidate(validateUrl: string, host: string) {

        }

        @catchError('_execAnonymityValidate', (error, cb) => {
            cb({
                error,
            })
        })
        private static async _execAnonymityValidate(validateUrl: string, host: string) {

        }

        @catchError()
        static async execValidate(task: ValidateTaskData) {
            const needExecValidateFunc = (task: ValidateTaskData, validateFuncType: ValidateTypes,) => {
                if (validateFuncType === ValidateTypes.assignToChannelValidate) {
                    return task.type === validateFuncType
                }
                return task.type === ValidateTypes.initialValidate || task.type === validateFuncType
            }

            const isInitialValidate = (task: ValidateTaskData) => {
                return task.type === ValidateTypes.initialValidate
            }

         

            console.log(`start validate [channel]:${task.channelName}/[taskType]:${task.type}/[host]:${task.host}`)

            // const channel = globalVars.channelMap.get(task.channelName)
            const channel = vars.getChannel(task.channelName)
            // const ipDataModelObj = await ChannelIpDataModel.findChannelIpData(task.channelName, task.host) ||
            //     new ChannelIpDataModel({ host: task.host, channelName: task.channelName })
            // initial validate
            let ipDataModelObj: ChannelIpDataModel = null
            if (isInitialValidate(task) || task.type === ValidateTypes.assignToChannelValidate) {
                ipDataModelObj = new ChannelIpDataModel({ host: task.host, channelName: task.channelName })
            } else {
                ipDataModelObj = (await ChannelIpDataModel.findChannelIpData(task.channelName, [task.host]))[0]
            }
            
            if (!ipDataModelObj) {
                console.warn(`${task.channelName}/${task.host} info not found`)
                return
            }

            let isIpdataModelChanged = false
            if (needExecValidateFunc(task, ValidateTypes.baseValidate)) {
                let httpType: number, rtt: number, error: Error
                const validateRes = await this._execBaseValidate(channel.validateUrl, task.host, channel.maxRtt)
                error = validateRes.error

                if (!validateRes.error) {
                    rtt = validateRes.rtt
                    httpType = IpDataHttpTypes.https
                } else if (isInitialValidate(task)) {
                    const httpValidateRes = await this._execBaseValidate(channel.httpValidateUrl, task.host, channel.maxRtt)
                    error = httpValidateRes.error
                    if (httpValidateRes.error) {
                        console.log(`${task.host} initial validate error`)
                        await GetIpRule.incrRuleGetIpCount(task.fromRule, 'invalid', 1)
                        return
                    }
                    rtt = httpValidateRes.rtt
                    httpType = IpDataHttpTypes.http
                } else {
                    ipDataModelObj.isDefaultChannel ? await ipDataModelObj.remove() : await ipDataModelObj.block()
                    return
                }

                if (!error) {
                    isIpdataModelChanged = true
                    ipDataModelObj.updateFeild('rtt', rtt)
                    ipDataModelObj.updateFeild('lastValidateTime', Date.now())
                    ipDataModelObj.updateFeild('nextValidateTime', getIpDataNextBaseValidateTime(ipDataModelObj, channel.itemLifeTime))
                    ipDataModelObj.updateFeild('validateCount', ipDataModelObj.validateCount + 1)
                    ipDataModelObj.updateFeild('fromRule', task.fromRule)
                    if (isInitialValidate(task)) {
                        ipDataModelObj.updateFeild('httpType', httpType)
                    }
                }
            }
            if (needExecValidateFunc(task, ValidateTypes.assignToChannelValidate)) {
                //@ts-ignore
                global.count3++
                const validateRes = await this._execBaseValidate(channel.validateUrl, task.host, channel.maxRtt)
                if (validateRes.error) {
                    return
                }
                isIpdataModelChanged = true
                ipDataModelObj.updateFeild('rtt', validateRes.rtt)
                ipDataModelObj.updateFeild('lastValidateTime', Date.now())
                ipDataModelObj.updateFeild('validateCount', ipDataModelObj.validateCount + 1)
                await IpPoolChannel.incrChannelRelatedRuleIpCount(channel.channelName, task.fromRule)
            }
            if (needExecValidateFunc(task, ValidateTypes.locationValidate)) {
                // TODO extension
                isIpdataModelChanged = true
                ipDataModelObj.updateFeild('anonymity', task.wildIpData.anonymity)
            }
            if (needExecValidateFunc(task, ValidateTypes.anonymityValidate)) {
                // TODO extension
                isIpdataModelChanged = true
                let locationStr = task.wildIpData.location
                const locationObj = parseLocation(locationStr)
                ipDataModelObj.updateFeild('location', locationObj.code)
            }

            if (isInitialValidate(task)) {
                test1(ipDataModelObj)
            }

            if (isIpdataModelChanged) {
                await ipDataModelObj.save()
                if (isInitialValidate(task)) {
                    await GetIpRule.incrRuleGetIpCount(task.fromRule, 'valid', 1)
                    await ChannelIpDataModel.addIpsToAllChannelBackupSet([ipDataModelObj])
                }
            }

            console.log(`stop validate ${task.channelName}/${task.host}`)
        }

        @catchError('handleValidataTask')
        static async handleValidataTask() {
            // if (vars.leftTheradCount <= 0) {
            //     return
            // }
            // vars.leftTheradCount--
            const time = UtilFuncs.useThread()
            if (!time) {
                return
            }

            try {
                // const task = TaskDataQueue.shift()
                const task = UtilFuncs.shiftFromTaskDataQueue()
                if (task) {
                    await this.execValidate(task)
                }
            } catch (e) {
                console.error(e)
            }
            UtilFuncs.unuseThread(time)

            // vars.leftTheradCount++

            // if (!!TaskDataQueue.length) {
            //     this.schedule()
            // }
            if (!!UtilFuncs.getQueueTaskCount()) {
                this.schedule()
            }
        }

        @catchError()
        static async schedule() {
            // const nowLeftThreadCount = vars.leftTheradCount
            // for (let i = 0; i < nowLeftThreadCount; i++) {
            //     this.handleValidataTask()
            // }
            const nowLeftThreadCount = vars.maxThreadCount - vars.usedThreadCount
            for (let i = 0; i < nowLeftThreadCount; i++) {
                this.handleValidataTask()
            }
        }
    }

    export function pushTaskData(channelName: string, taskDataList: ValidateTaskData[]) {
        // if (vars.isInited) {
        //     Controller.schedule()
        // }
        UtilFuncs.pushToTaskDataQueue(taskDataList)
        if (vars.status === ValidateTasksManageStatus.started) {
            // TaskDataQueue = TaskDataQueue.concat(taskDataList)
            Controller.schedule()
        }
    }

    export function getNotResolvedTaskCount(channelName: string, taskType: ValidateTypes) {
        return getMapValue(TypedTaskCountMap, UtilFuncs.getTaskType(channelName, taskType), 0)
    }

    // function updateConfig(config: ConfigOptions) {
    //     vars.maxThreadCount = config.threadCount
    //     setImmediate(() => {
    //         Controller.schedule()
    //     })
    // }

    export function start(configOptions: ConfigOptions) {
        // if (vars.isInited) {
        //     return
        // }
        // vars.isInited = true
        // vars.leftTheradCount = threadCount
        // setImmediate(() => {
        //     Controller.schedule()
        // })

        const isStop = vars.status === ValidateTasksManageStatus.stopped
        if (!isStop) {
            throw new Error(`启动失败: ValidateTasksManage 当前状态值为非关闭状态: ${vars.status}`)
        }

        vars.maxThreadCount = configOptions.threadCount
        vars.getChannel = configOptions.getChannelData
        vars.startTime = Date.now()
        vars.status = ValidateTasksManageStatus.started
        vars.usedThreadCount = 0
    }

    export function stop(clearTaskQueue: false) {
        if (vars.status !== ValidateTasksManageStatus.started) {
            throw new Error(`关闭失败: ValidateTasksManage 当前状态值为非启动状态: ${vars.status}`)
        }

        vars.status = ValidateTasksManageStatus.stopped
        if (!clearTaskQueue) {
            UtilFuncs.clearTaskDataQueue()
        }
    }

}

export namespace ChannelScheduleManage {
    const channelLoopTimerMap = new Map<string, NodeJS.Timer>()
    const channelRemoveExpiredBlockIpsTimer = new Map<string, NodeJS.Timer>()
    const channelLastScheduleTime = new Map<string, number>()

    const ChannelInitedMap = new Map<string, boolean>()

    class Controllers {
        @catchError()
        static async removeChannelExpiredBlockIps(channel: IpPoolChannel) {
            await ChannelIpDataModel.removeChannelExpiredBlockIps(channel.channelName, channel.itemBlockTime)
        }

        @catchError()
        static async channelValidateTasksSchedule(channel: IpPoolChannel) {
            const { channelName } = channel
            const needToValidateSection = {
                startTime: channelLastScheduleTime.get(channelName),
                endTime: Date.now(),
            }

            const expiredHostList = await ChannelIpDataModel.findBySortableFeildOfScoreRange(channelName, 'nextValidateTime', 0, needToValidateSection.startTime - 1)
            await ChannelIpDataModel.removeChannelIps(channelName, expiredHostList)
            const needValidateHostList = await ChannelIpDataModel.findBySortableFeildOfScoreRange(channelName, 'nextValidateTime', needToValidateSection.startTime, needToValidateSection.endTime)
            const validateTaskDataList = needValidateHostList.map(host => ({
                channelName,
                host,
                type: ValidateTasksManage.ValidateTypes.baseValidate,
            }))
            ValidateTasksManage.pushTaskData(channelName, validateTaskDataList)
            channelLastScheduleTime.set(channelName, needToValidateSection.endTime)
        }

        @catchError('checkChannelIpPoolSize')
        static async checkChannelIpPoolSize(channel: IpPoolChannel) {
            if (!channel.isDefaultChannel && getMapValue(ChannelInitedMap, channel.channelName, false) === false) {
                await ChannelIpDataModel.removeChannelBackupIPsSet(channel.channelName)
                const allValidIpDataList = await getDefaultChannelAllIpDataList()
                await ChannelIpDataModel.addIpsToChannelArrBackupSet([channel], allValidIpDataList)
                ChannelInitedMap.set(channel.channelName, true)
                return
            }

            const channelIpPoolSize = await ChannelIpDataModel.countChannelIps(channel.channelName)
            let needIpCount = 0
            if (channel.isDefaultChannel) {
                const defaultChannelMinSize = channel.volume
                const v = channelIpPoolSize - defaultChannelMinSize
                if (v >= 0) {
                    return
                }
                needIpCount = Math.abs(v)
            } else {
                const v = channelIpPoolSize - channel.volume
                if (v >= 0) {
                    return
                }
                needIpCount = Math.abs(v)
            }

            if (!channel.isDefaultChannel) {
                const hosts = await ChannelIpDataModel.getIpsFromChannelBackupSet(channel.channelName, needIpCount) 
                const hostFromRuleArr = await ChannelIpDataModel.getChannelIpDataFeildValue(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, 'fromRule', hosts)
                ValidateTasksManage.pushTaskData(channel.channelName, hosts.map((host, index) => ({
                    type: ValidateTasksManage.ValidateTypes.assignToChannelValidate,
                    host,
                    channelName: channel.channelName,
                    fromRule: hostFromRuleArr[index],
                })))
                await ChannelIpDataModel.removeIpFromChannelBackupIpSet(channel.channelName, hosts)
    
                if (hosts.length >= needIpCount) {
                    return
                }
            }

            const defaultChannelWaittingTaskCount = ValidateTasksManage.getNotResolvedTaskCount(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, ValidateTasksManage.ValidateTypes.initialValidate)
            needIpCount -= defaultChannelWaittingTaskCount
            if (!channel.isDefaultChannel) {
                const channelWaittingTaskCount = ValidateTasksManage.getNotResolvedTaskCount(channel.channelName, ValidateTasksManage.ValidateTypes.assignToChannelValidate)
                needIpCount -= channelWaittingTaskCount
            }
            if (needIpCount <= 0) {
                return
            }

            const rules = await GetIpRule.getRulesBySortedUsedCount(5)
            for (let rule of rules) {
                const wildIpDataList = await crawl(rule)
                const hostArr = wildIpDataList.map(obj => {
                    return UrlFormat({
                        protocol: 'http',
                        hostname: obj.ip,
                        port: obj.port,
                    })
                })
                const isExistedArr = await ChannelIpDataModel.isIpsExistedInChannel(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, hostArr)
                const validateTaskDataList: ValidateTasksManage.ValidateTaskData[] = []
                hostArr.forEach((host, index) => {
                    const isExisted = isExistedArr[index]
                    const wildIpData = wildIpDataList[index]
                    if (!isExisted) {
                        validateTaskDataList.push({
                            type: ValidateTasksManage.ValidateTypes.initialValidate,
                            host,
                            channelName: DefaultValueConfigs.DEFAULT_CHANNEL_NAME,
                            fromRule: rule.name,
                            wildIpData,
                        })
                    }
                })
                ValidateTasksManage.pushTaskData(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, validateTaskDataList)

                rule.usedCount++
                await rule.save()
            }
        }

        @catchError()
        static startChannelValidateTasksSchedule(channel: IpPoolChannel, scheduleLoopInterval: number) {
            const { channelName } = channel
            const oldTimer = channelLoopTimerMap.get(channelName), oldBlockIpsTrimTimer = channelRemoveExpiredBlockIpsTimer.get(channelName)
            if (oldTimer) {
                clearInterval(oldTimer)
                clearInterval(oldBlockIpsTrimTimer)
            }

            const loopFunc = () => {
                this.checkChannelIpPoolSize(channel)
                this.channelValidateTasksSchedule(channel)
            }
            const tiemr = setInterval(loopFunc, scheduleLoopInterval)
            const blockIpsTrimTimer = setInterval(() => {
                this.removeChannelExpiredBlockIps(channel)
            }, 1000 * 60 * 3)
            channelLoopTimerMap.set(channelName, tiemr)
            channelRemoveExpiredBlockIpsTimer.set(channelName, blockIpsTrimTimer)
            channelLastScheduleTime.set(channelName, Date.now())

            loopFunc()
        }

        @catchError()
        static stopChannelValidateTasksSchedule(channelName: string) {
            const timer = channelLoopTimerMap.get(channelName), blockIpsTrimTimer = channelRemoveExpiredBlockIpsTimer.get(channelName)
            if (timer) {
                clearInterval(timer)
                clearInterval(blockIpsTrimTimer)
            }
            channelLoopTimerMap.delete(channelName)
            channelRemoveExpiredBlockIpsTimer.delete(channelName)
            channelLastScheduleTime.delete(channelName)
            // TODO 清除validate队列
        }
    }

    export const { startChannelValidateTasksSchedule: startChannelSchedule, stopChannelValidateTasksSchedule: stopChannelSchedule } = Controllers
}

export default async function start(validateThreadCount: number) {
    await ModelInit()
    await getDefaultChannelAllIpDataList();
    // const allChannels: IpPoolChannel[] = await IpPoolChannel.findAllChannel()
    // allChannels.forEach(channel => {
    //     globalVars.channelMap.set(channel.channelName, channel)
    // })
    // cache.setCache(configs.CHANNEL_CACHE_KEY, globalVars.channelMap)

    // ValidateTasksManage.start({
    //     threadCount: validateThreadCount,
    //     getChannelData: (name) => {
    //         const channelMap = cache.getCache<Map<string, IpPoolChannel>>(configs.CHANNEL_CACHE_KEY)
    //         return channelMap.get(name)
    //     }
    // })
    // allChannels.forEach(channel => {
    //     ChannelScheduleManage.startChannelSchedule(channel, configs.CHANNEL_SCHEDULE_LOOP_INTERVAL)
    // })


    ValidateTasksManage.start({
        threadCount: validateThreadCount,
        getChannelData: (name) => {
            const { channelMap } = IpPoolChannel.getChannelCache()
            return channelMap.get(name)
        }
    })
    const { runningChannels } = IpPoolChannel.getChannelCache()
    runningChannels.forEach(channel => {
        ChannelScheduleManage.startChannelSchedule(channel, configs.CHANNEL_SCHEDULE_LOOP_INTERVAL)
    })
}


async function testValidateTaskManage() {
    const generateTaskDatas = (arr: number[]) => {
        return arr.map(i => ({
            host: i + '',
            type: null,
            channelName: '',
        }))
    }
    const taskDatas = generateTaskDatas([1, 2, 3, 4, 5])
    ValidateTasksManage.pushTaskData('', taskDatas)
    // ValidateTasksManage.start({ threadCount: 3 })
    await new Promise((resolve) => {
        setTimeout(resolve, taskDatas.length * 100)
    })
    ValidateTasksManage.pushTaskData('', generateTaskDatas([6, 7, 8]))
    // ValidateTasksManage.pushTaskData('', taskDatas)
}

// testValidateTaskManage()

async function testValidateTaskManage2() {
    const taskDataList = [{
        host: '60.191.11.251:3128',
        // channel: confi
    }]
    // ValidateTasksManage.pushTaskData('', taskDatas)
}

// testValidateTaskManage2()

async function insertIpDataModel() {
    // http://58.220.95.78:9401
    const o = new ChannelIpDataModel({
        host: '58.220.95.78',
        port: 9401,
    })
    // o.updateFeild('')
}

async function testInitialValidate() {
    await ModelInit()
    const allChannels: IpPoolChannel[] = await IpPoolChannel.findAllChannel()
    let wildIpDataList = await crawl({
        name: 'test',
        itemSelector: '#list > table > tbody > tr',
        pagination: {
            formatUrl: (pn) => `https://www.kuaidaili.com/free/inha/${pn}/`,
            maxPn: 1,
        },
        itemStartIndex: 1,
        itemInfoSelectors: {
            ip: 0,
            port: 1,
            location: 4,
            anonymity: (ele) => {
                if (ele.root().text().includes('高匿')) {
                    return IpDataAnonymities.high
                }
                return IpDataAnonymities.no
            },
            rtt: (ele) => {
                return Number(ele('td:nth-child(6)').text().trim().replace('秒', '')) * 1000
            },
            httpType: (ele) => {
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
    })
    console.log(wildIpDataList.length)
    // ValidateTasksManage.start({ threadCount: 1 })
    wildIpDataList = [{
        ip: '58.220.95.78',
        port: 9401,
        httpType: IpDataHttpTypes.https,
        location: '中国',
        anonymity: IpDataAnonymities.high,
        rtt: 302,
    }]
    await ValidateTasksManage.pushTaskData(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, wildIpDataList.slice(0, 2).map(obj => {
        const host = UrlFormat({
            protocol: 'http',
            hostname: obj.ip,
            port: obj.port,
        })
        return {
            type: ValidateTasksManage.ValidateTypes.initialValidate,
            host,
            channelName: DefaultValueConfigs.DEFAULT_CHANNEL_NAME,
            wildIpData: obj
        }
    }))
}

// testInitialValidate()

async function testValiate() {
    await start(1)
}

// testValiate()

async function testUrl() {
    console.log(UrlFormat({
        hostname: '58.220.95.78',
        port: 9401,
        protocol: 'http',
    }))
}

// testUrl()

async function testSaveRule() {
    const allRules = await GetIpRule.getAllRules()
    await GetIpRule.removeRules(allRules.filter(rule => rule.isInRuleFile).map(rule => rule.name))
    
    await Promise.all(getIpRules.map(obj => new GetIpRule({...obj, isInRuleFile: true})).map(o => o.save()))
    let rules = await GetIpRule.getRulesBySortedUsedCount()
    console.log(rules)
}

// testSaveRule()

async function testSaveRule2() {
    const obj = new GetIpRule(getIpRules[0])
    console.log(Object.keys(obj.itemInfoSelectors), Object.values(obj.itemInfoSelectors).map(i => typeof i))
}

// testSaveRule2()

// start(20)

function test() {
    console.time('1')
    let set = new Set()
    let s = 0
    for (let i = 0; i < 1000000; i++) {
        // set.add(i)
        s += i
    }
    console.timeEnd('1')
}

// test()

async function mainTest () {
    await ModelInit()
    const channel2 = new IpPoolChannel({
        channelName: 'zhihu',
        validateUrl: 'https://www.zhihu.com/explore',
    })
    await channel2.save()
    await testSaveRule()
    await start(60)
}

// mainTest()

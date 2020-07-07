import { format as UrlFormat } from 'url';

import { getLocationNameByCode, parseLocation } from 'utils/location'
import { generateRedisKey, catchError, getMapValue } from 'utils';
import { DefaultValueConfigs, configs, EditableConfigs } from 'getSettings'
import { FreshIpData as WildIpData, CrawlRule } from 'type'
import {IpDataHttpTypes, IpDataAnonymities} from 'enum_types'
import * as cache from 'lib/cache'
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
        maxThreadCount: 0,
        usedThreadCount: 0,
        status: ValidateTasksManageStatus.stopped,
        getChannel: null as ConfigOptions['getChannelData'],
        startTime: null as number,
    }
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

            const channel = vars.getChannel(task.channelName)
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
            const time = UtilFuncs.useThread()
            if (!time) {
                return
            }

            try {
                const task = UtilFuncs.shiftFromTaskDataQueue()
                if (task) {
                    await this.execValidate(task)
                }
            } catch (e) {
                console.error(e)
            }
            UtilFuncs.unuseThread(time)

            if (!!UtilFuncs.getQueueTaskCount()) {
                this.schedule()
            }
        }

        @catchError()
        static async schedule() {
            const nowLeftThreadCount = vars.maxThreadCount - vars.usedThreadCount
            for (let i = 0; i < nowLeftThreadCount; i++) {
                this.handleValidataTask()
            }
        }
    }

    export function pushTaskData(channelName: string, taskDataList: ValidateTaskData[]) {
        UtilFuncs.pushToTaskDataQueue(taskDataList)
        if (vars.status === ValidateTasksManageStatus.started) {
            Controller.schedule()
        }
    }

    export function getNotResolvedTaskCount(channelName: string, taskType: ValidateTypes) {
        return getMapValue(TypedTaskCountMap, UtilFuncs.getTaskType(channelName, taskType), 0)
    }

    export function getTaskQueueTaskCount () {
        return UtilFuncs.getQueueTaskCount()
    }

    export function isRunning () {
        return vars.status === ValidateTasksManageStatus.started
    }

    export function start(configOptions: ConfigOptions) {
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

    export function stop(clearTaskQueue = false) {
        if (vars.status !== ValidateTasksManageStatus.started) {
            throw new Error(`关闭失败: ValidateTasksManage 当前状态值为非启动状态: ${vars.status}`)
        }

        vars.status = ValidateTasksManageStatus.stopped
        if (clearTaskQueue) {
            UtilFuncs.clearTaskDataQueue()
        }
    }

}

export namespace ChannelScheduleManage {
    const channelLoopTimerMap = new Map<string, NodeJS.Timeout>()
    const channelRemoveExpiredBlockIpsTimer = new Map<string, NodeJS.Timeout>()
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

async function start(validateThreadCount?: number) {
    await ModelInit()
    await getDefaultChannelAllIpDataList();
    if (validateThreadCount === undefined) {
        validateThreadCount = EditableConfigs.getConfig('proxyPoolServer').SERVER_MAX_VALIDATE_THREAD
    }

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

function stop () {
    const { runningChannels } = IpPoolChannel.getChannelCache()
    runningChannels.forEach(channel => {
        ChannelScheduleManage.stopChannelSchedule(channel.channelName)
    })
    ValidateTasksManage.stop(true)

}

export default {
    start,
    stop,
}

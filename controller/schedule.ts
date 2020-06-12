import { format as UrlFormat } from 'url';

import {getLocationNameByCode, parseLocation} from 'utils/location'
import { generateRedisKey, catchError } from 'utils';
import {config} from 'getSettings'
import {FreshIpData as WildIpData, IpDataHttpTypes, IpDataAnonymities, CrawlRule} from 'type'
import getIpRules from 'config/rules'
import {baseValidate} from 'lib/validateIp'
import { crawl } from 'lib/getIp';
import {IpPoolChannel, ChannelIpDataModel, init as ModelInit, GetIpRule} from './model'

const globalVars = {
    channelMap: new Map<string, IpPoolChannel>(),
    allRules: [] as CrawlRule[],
    maxValidateTheradCount: 0,
}

namespace ValidateTasksManage {
    export enum ValidateTypes {
        initialValidate,
        baseValidate,
        locationValidate,
        anonymityValidate,
    }

    export interface ValidateTaskData {
        channelName: string;
        host: string;
        type: ValidateTypes;
        wildIpData?: WildIpData; // 爬取到的初始化数据
    }

    const vars = {
        isInited: false,
        leftTheradCount: 0,
    }
    let TaskDataQueue: ValidateTaskData[] = []

    class Controller {
        @catchError('_execBaseValidate', (error, cb) => {
            cb({
                error,
            })
        })
        private static async _execBaseValidate (validateUrl: string, host: string): Promise<{error: Error, rtt: number}> {
            let rtt: number
            const res = await baseValidate(validateUrl, host)
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
        private static async _execLocationValidate (validateUrl: string, host: string) {
            let rtt: number
            const res = await baseValidate(validateUrl, host)
            rtt = res.rtt
            return {
                rtt,
            }
        }

        @catchError('_execAnonymityValidate', (error, cb) => {
            cb({
                error,
            })
        })
        private static async _execAnonymityValidate (validateUrl: string, host: string) {
            let rtt: number
            const res = await baseValidate(validateUrl, host)
            rtt = res.rtt
            return {
                rtt,
            }
        }

        @catchError()
        static async execValidate (task: ValidateTaskData) {
            const needExecValidateFunc = (task: ValidateTaskData, validateFuncType: ValidateTypes, ) => {
                return task.type === ValidateTypes.initialValidate || task.type === validateFuncType
            }

            const isInitialValidate = (task: ValidateTaskData) => {
                return task.type === ValidateTypes.initialValidate
            }

            console.log(`start validate ${task.channelName}/${task.host}`)

            const channel = globalVars.channelMap.get(task.channelName)
            const ipDataModelObj = await ChannelIpDataModel.findChannelIpData(task.channelName, task.host) || 
                new ChannelIpDataModel({host: task.host, channelName: task.channelName})
            let isIpdateModelChanged = false
            if (needExecValidateFunc(task, ValidateTypes.baseValidate)) {
                let httpType: number, rtt: number, error: Error
                const validateRes = await this._execBaseValidate(channel.validateUrl, task.host)
                error = validateRes.error

                if (!validateRes.error) {
                    rtt = validateRes.rtt
                    httpType = IpDataHttpTypes.https
                } else if (isInitialValidate(task)) {
                    const httpValidateRes = await this._execBaseValidate(channel.httpValidateUrl, task.host)
                    error = httpValidateRes.error
                    if (httpValidateRes.error) {
                        console.log(`${task.host} initial validate error`)
                        return
                    }
                    rtt = httpValidateRes.rtt
                    httpType = IpDataHttpTypes.http
                } else {
                    ipDataModelObj.isDefaultChannel ? await ipDataModelObj.remove() : await ipDataModelObj.block()
                    return
                }

                if (!error) {
                    isIpdateModelChanged = true
                    ipDataModelObj.updateFeild('rtt', rtt)
                    ipDataModelObj.updateFeild('lastValidateTime', Date.now())
                    ipDataModelObj.updateFeild('validateCount', ipDataModelObj.validateCount + 1)
                    if (isInitialValidate(task)) {
                        ipDataModelObj.updateFeild('httpType', httpType)
                    }
                }
            }
            if (needExecValidateFunc(task, ValidateTypes.locationValidate)) {
                // TODO extension
                isIpdateModelChanged = true
                ipDataModelObj.updateFeild('anonymity', task.wildIpData.anonymity)
            }
            if (needExecValidateFunc(task, ValidateTypes.anonymityValidate)) {
                // TODO extension
                isIpdateModelChanged = true
                let locationStr = task.wildIpData.location
                const locationObj = parseLocation(locationStr)
                ipDataModelObj.updateFeild('location', locationObj.code)
            }

            if (isIpdateModelChanged) {
                await ipDataModelObj.save()
            }

            console.log(`stop validate ${task.channelName}/${task.host}`)
        }

        @catchError('handleValidataTask', e => {
            vars.leftTheradCount ++
        })
        static async handleValidataTask() {
            if (vars.leftTheradCount <= 0) {
                return
            }
            vars.leftTheradCount--

            const task = TaskDataQueue.shift()
            if (task) {
               await this.execValidate(task)
            }
            vars.leftTheradCount++

            if (!!TaskDataQueue.length) {
                this.schedule()
            }
        }   

        @catchError()
        static async schedule() {
            const nowLeftThreadCount = vars.leftTheradCount
            for (let i = 0; i < nowLeftThreadCount; i++) {
                this.handleValidataTask()
            }
        }
    }

    export function pushTaskData (channelName: string, taskDataList: ValidateTaskData[]) {
        TaskDataQueue = TaskDataQueue.concat(taskDataList)
        if (vars.isInited) {
            Controller.schedule()
        }
    }

    export function init (threadCount: number) {
        if (vars.isInited) {
            return
        }
        vars.isInited = true
        vars.leftTheradCount = threadCount
        setImmediate(() => {
            Controller.schedule()
        })
    }

}

namespace ChannelScheduleManage {
    const channelTimerMap = new Map<string, NodeJS.Timer>()
    const channelRemoveExpiredBlockIpsTimer = new Map<string, NodeJS.Timer>()
    const channelLastScheduleTime = new Map<string, number>()

    class Controllers {
        @catchError()
        static async removeChannelExpiredBlockIps (channelName: string, blockTime: number) {
            await ChannelIpDataModel.removeChannelExpiredBlockIps(channelName, blockTime)
        }

        @catchError()
        static async channelValidateTasksSchedule (channelName: string, ipDataValidateInterval: number) {
            const needToValidateSection = {
                startTime: channelLastScheduleTime.get(channelName) - ipDataValidateInterval,
                endTime: Date.now() - ipDataValidateInterval,
            }

            const expiredHostList = await ChannelIpDataModel.findBySortableFeildOfRange(channelName, 'lastValidateTime', 0, needToValidateSection.startTime - 1)
            await ChannelIpDataModel.removeChannelIps(channelName, expiredHostList)
            const needValidateHostList = await ChannelIpDataModel.findBySortableFeildOfRange(channelName, 'lastValidateTime', needToValidateSection.startTime, needToValidateSection.endTime)
            const validateTaskDataList= needValidateHostList.map(host => ({
                channelName,
                host,
                type: ValidateTasksManage.ValidateTypes.baseValidate,
            }))
            ValidateTasksManage.pushTaskData(channelName, validateTaskDataList)
        }

        @catchError()
        static async crawlIpByRuleList () {
            const rules = await GetIpRule.getRulesBySortedUsedCount()
            for (let rule of rules) {
                const wildIpDataList = await crawl(rule)
                const hostArr = wildIpDataList.map(obj => {
                    return UrlFormat({
                        protocol: 'http',
                        hostname: obj.ip,
                        port: obj.port,
                    })
                })
                const isExistedArr = await ChannelIpDataModel.isIpsExistedInChannel(config.DEFAULT_CHANNEL_NAME, hostArr)
                const validateTaskDataList: ValidateTasksManage.ValidateTaskData[] = []
                hostArr.forEach((host, index) => {
                    const isExisted = isExistedArr[index]
                    const wildIpData = wildIpDataList[index]
                    if (!isExisted) {
                        validateTaskDataList.push({
                            type: ValidateTasksManage.ValidateTypes.initialValidate,
                            host,
                            channelName: config.DEFAULT_CHANNEL_NAME,
                            wildIpData,
                        })
                    }
                })
                ValidateTasksManage.pushTaskData(config.DEFAULT_CHANNEL_NAME, validateTaskDataList)
               
                rule.usedCount ++
                await rule.save()
            }
        }
    
        @catchError()
        static startChannelValidateTasksSchedule (channelName: string, loopInterval: number, ipDataValidateInterval: number) {
            const oldTimer = channelTimerMap.get(channelName), oldBlockIpsTrimTimer = channelRemoveExpiredBlockIpsTimer.get(channelName)
            if (oldTimer) {
                clearInterval(oldTimer)
                clearInterval(oldBlockIpsTrimTimer)
            }

            const tiemr = setInterval(() => {
                this.channelValidateTasksSchedule(channelName, ipDataValidateInterval)
            }, loopInterval)
            const blockIpsTrimTimer = setInterval(() => {
                this.removeChannelExpiredBlockIps(channelName, 1000 * 60 * 60 * 24 * 1)
            }, 1000 * 60 * 5)
            channelTimerMap.set(channelName, tiemr)
            channelRemoveExpiredBlockIpsTimer.set(channelName, blockIpsTrimTimer)
            channelLastScheduleTime.set(channelName, Date.now())

            this.crawlIpByRuleList()
        }

        @catchError()
        static stopChannelValidateTasksSchedule (channelName: string) {
            const timer = channelTimerMap.get(channelName), blockIpsTrimTimer = channelRemoveExpiredBlockIpsTimer.get(channelName)
            if (timer) {
                clearInterval(timer)
                clearInterval(blockIpsTrimTimer)
            }
            channelTimerMap.delete(channelName)
            channelRemoveExpiredBlockIpsTimer.delete(channelName)
            channelLastScheduleTime.delete(channelName)
            // TODO 清除validate队列
        }
    }

    export const {startChannelValidateTasksSchedule: startChannelSchedule} = Controllers
}



export default async function start (validateThreadCount: number) {
    await ModelInit()
    globalVars.maxValidateTheradCount = validateThreadCount
    const allChannels: IpPoolChannel[] = await IpPoolChannel.findAllChannel()
    allChannels.forEach(channel => {
        globalVars.channelMap.set(channel.channelName, channel)
    })
    ValidateTasksManage.init(validateThreadCount)
    allChannels.forEach(channel => {
        ChannelScheduleManage.startChannelSchedule(channel.channelName, 1000 * 20 * 1, 1000 * 60 * 20)
        // ChannelScheduleManage.startChannelSchedule(channel.channelName, 1000 * 1, 1000 * 60 * 20)
        
    })
}
    


async function testValidateTaskManage () {
    const generateTaskDatas = (arr: number[]) => {
        return arr.map(i => ({
            host: i + '',
            type: null,
            channelName: '',
        }))
    }
    const taskDatas = generateTaskDatas([1, 2, 3, 4, 5])
    ValidateTasksManage.pushTaskData('', taskDatas)
    ValidateTasksManage.init(3)
    await new Promise((resolve) => {
        setTimeout(resolve, taskDatas.length * 100)
    })
    ValidateTasksManage.pushTaskData('', generateTaskDatas([6, 7, 8]))
    // ValidateTasksManage.pushTaskData('', taskDatas)
}

// testValidateTaskManage()

async function testValidateTaskManage2 () {
    const taskDataList = [{
        host: '60.191.11.251:3128',
        // channel: confi
    }]
    // ValidateTasksManage.pushTaskData('', taskDatas)
}

// testValidateTaskManage2()

async function insertIpDataModel () {
    // http://58.220.95.78:9401
    const o = new ChannelIpDataModel({
        host: '58.220.95.78',
        port: 9401,
    })
    // o.updateFeild('')
}

async function testInitialValidate () {
    await ModelInit()
    const allChannels: IpPoolChannel[] = await IpPoolChannel.findAllChannel()
    allChannels.forEach(channel => {
        globalVars.channelMap.set(channel.channelName, channel)
    })
    let wildIpDataList =  await crawl({
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
    ValidateTasksManage.init(1)
    wildIpDataList = [{
        ip: '58.220.95.78',
        port: 9401,
        httpType: IpDataHttpTypes.https,
        location: '中国',
        anonymity: IpDataAnonymities.high,
        rtt: 302,
    }]
    await ValidateTasksManage.pushTaskData(config.DEFAULT_CHANNEL_NAME, wildIpDataList.slice(0, 2).map(obj => {
        const host = UrlFormat({
            protocol: 'http',
            hostname: obj.ip,
            port: obj.port,
        })
        return {
            type: ValidateTasksManage.ValidateTypes.initialValidate,
            host,
            channelName: config.DEFAULT_CHANNEL_NAME,
            wildIpData: obj
        }
    }))
}

// testInitialValidate()

async function testValiate () {
    await start(1)
}

// testValiate()

async function testUrl () {
     console.log(UrlFormat({
        hostname: '58.220.95.78',
        port: 9401,
        protocol: 'http',
    }))
}

// testUrl()

async function testSaveRule () {
    await Promise.all(getIpRules.map(obj => new GetIpRule(obj)).map(o => o.save()))
    let rules = await GetIpRule.getRulesBySortedUsedCount()
    console.log(rules)
}

// testSaveRule()

async function testSaveRule2 () {
    const obj = new GetIpRule(getIpRules[0])
    console.log(Object.keys(obj.itemInfoSelectors), Object.values(obj.itemInfoSelectors).map(i => typeof i))
}

// testSaveRule2()

start(10)
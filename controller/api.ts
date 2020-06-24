import express from 'express'
import httpProxy from 'http-proxy'
import {format as UrlFormat} from 'url'

import { catchError, fromJson, toJson } from 'utils'
import injectedConfigs, { DefaultValueConfigs, configs, EditableConfigs } from 'getSettings';
import { IpPoolChannel, GetIpRule, ChannelIpDataModel } from 'models/model';
import schedule, { ChannelScheduleManage, ValidateTasksManage } from './schedule'
import * as cache from 'lib/cache'
import { ChannelIpDataDef, IpPoolChannelDef, IpPoolChannelStatus } from 'type';
import {ApiResCode} from 'enum_types'

namespace Decorators {
    export const RouteCatchError = catchError('route', (e, cb, req: express.Request, res: express.Response) => {
        res.send('server error')
    })

    // catch error decorator
    export const ApiCatchError = catchError('api', (e, cb, req: express.Request, res: express.Response) => {
        res.json({
            code: ApiResCode.error,
            msg: e.message,
        })
    })

    // proxy decorator
    type ProxyTarget = string | (() => string)

    type ApiHandler = (req: express.Request, res: express.Response) => any

    const getProxyTarget = (target: ProxyTarget) => {
        if (typeof target === 'string') {
            return target
        }
        return target()
    }

    export const useApiProxy = (proxyTarget?: ProxyTarget) => {
        const decorator = (target, property, descriptor: TypedPropertyDescriptor<ApiHandler>) => {
            const func = descriptor.value.bind(target)
            const newFunc = async (...args: Parameters<ApiHandler>) => {
                const [req, res] = args
                const proxyTargetUrl = getProxyTarget(proxyTarget)
                if (proxyTargetUrl) {
                    const target = httpProxy.createServer({
                        target: proxyTargetUrl
                    })
                    const reqCopy = Object.assign({}, req)
                    Object.setPrototypeOf(reqCopy, Object.getPrototypeOf(req))
                    reqCopy.url = req.originalUrl
                    target.web(reqCopy, res)
                } else {
                    return await func(...args)
                }
            }
            descriptor.value = newFunc
            return descriptor
        }
        return decorator
    }

    // isadmin decorator
    export function isAdmin (target, property, descriptor: TypedPropertyDescriptor<ApiHandler>) {
        const func = descriptor.value.bind(target)
        const newFunc = async (...args: Parameters<ApiHandler>) => {
            const [req, res] = args
            if (req.session.isAdmin) {
                return await func(...args)
            }
            res.json({
                code: ApiResCode.unauthorzied,
                msg: 'unauthorzied'
            })
        }
        descriptor.value = newFunc
        return descriptor
    }

    // router decorator
    export namespace RegisterRoute {
        type PathMatcher = string | RegExp
        type Methods = 'get' | 'post'

        const pathRouteHandlers: {
            method: Methods,
            route: PathMatcher,
            handler: (req, res, next) => any;
        }[] = []
        const baseRoutePath = '/api'

        function register(method: Methods, route: PathMatcher) {
            return function (target, propertyName, descriptor: PropertyDescriptor) {
                const handler = descriptor.value.bind(target)
                pathRouteHandlers.push({
                    method,
                    route,
                    handler
                })
                return descriptor
            }
        }

        export function get(route: PathMatcher) {
            return register('get', route)
        }

        export function post(route: PathMatcher) {
            return register('post', route)
        }

        export function listen(app: express.Express) {
            const router = express.Router()
            pathRouteHandlers.forEach(item => {
                const matcher = router[item.method]
                matcher.call(router, item.route, item.handler)
            })
            app.use(baseRoutePath, router)
        }
    }
}

namespace UtilFuncs {
    export function checkChannelPostData(data: Partial<IpPoolChannelDef>) {
        const { httpValidateUrl, channelName, maxRtt } = data
        if (!channelName) {
            throw new Error('feild: ChannelName not found')
        }
        const isDefaultChannel = DefaultValueConfigs.DEFAULT_CHANNEL_NAME === channelName
        if (httpValidateUrl && !isDefaultChannel) {
            throw new Error(`invalid feild: httpValidateUrl`)
        }
        if (!isDefaultChannel) {
            const {channelMap} = IpPoolChannel.getChannelCache()
            const defaultChannel = channelMap.get(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
            if (defaultChannel.maxRtt < maxRtt) {
                throw new Error(`maxRtt must less than: ${defaultChannel.maxRtt}`);
            }
        }
    }

    export function checkGetIpRulePostData(data: Partial<GetIpRule>) {
        if (!data.name) {
            throw new Error('feild: name not found')
        }
    }

}

const getProxyUrl = () => {
    const { CRAWL_POOL_ADMIN_SERVER_URL } = injectedConfigs
    if (!CRAWL_POOL_ADMIN_SERVER_URL) {
        return ''
    } else {
        return CRAWL_POOL_ADMIN_SERVER_URL
    }
}


class AdminApiHandlers {
    @Decorators.RegisterRoute.get('/baseinfo')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async reqBaseInfo (req: express.Request, res: express.Response) {
        res.json({
            code: ApiResCode.success,
            isLogined: true,
            defaultConfigs: DefaultValueConfigs,            
        })
    }

    @Decorators.RegisterRoute.get('/admin/info')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async req (req: express.Request, res: express.Response) {
        const channelIpPoolSize = await ChannelIpDataModel.countChannelIps(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
        const {channelMap, channels} = IpPoolChannel.getChannelCache()
        const defaultChannel = channelMap.get(DefaultValueConfigs.DEFAULT_CHANNEL_NAME)
        const channelsStatusInfo = channels.reduce((countObj, item) => {
            countObj.total ++
            if (item.isPaused) {
                countObj.pausedChannelCount ++
            } else {
                countObj.runningChannelCount ++
            }
            return countObj
        }, {
            total: 0,
            runningChannelCount: 0,
            pausedChannelCount: 0,
        })

        const ruleCount = await GetIpRule.getRuleCount()

        const validateTaskCount = ValidateTasksManage.getTaskQueueTaskCount()

        const serverUrl = injectedConfigs.CRAWL_POOL_ADMIN_SERVER_URL

        const adminConfigs = EditableConfigs.getConfig('admin')
        const proxyPoolServerConfigs = EditableConfigs.getConfig('proxyPoolServer')

        res.json({
            code: ApiResCode.success,
            serverUrl,
            adminConfigs,
            proxyPoolServerConfigs,
            validateTaskCount,
            ruleCount,
            channelsStatusInfo,
            defaultChannelInfo: {
                ...defaultChannel,
                size: channelIpPoolSize,
            }
        })
    }

    @Decorators.RegisterRoute.get('/channels')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async reqAllChannels(req: express.Request, res: express.Response) {
        const channels = await IpPoolChannel.findAllChannel()
        const tasks = await channels.map(async channel => {
            const ruleIpCountInfoArr = await IpPoolChannel.getChannelRulesIpCountRecord(channel.channelName)
            const channelIpPoolSize = await ChannelIpDataModel.countChannelIps(channel.channelName)
            return {
                ...channel,
                isDefaultChannel: channel.channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME,
                ruleIpCountInfoArr,
                size: channelIpPoolSize
            }
        })
        const list = await Promise.all(tasks)
        res.json({
            code: ApiResCode.success,
            // channelRuleIpCountArr: channelRuleIpCountInfoArr,
            list,
        })
    }

    @Decorators.RegisterRoute.post('/channel/add')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async addChannel(req: express.Request, res: express.Response) {
        UtilFuncs.checkChannelPostData(req.body)
        const { channelName } = req.body
        if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
            throw new Error('invalid channel name')
        }
        const findChannel = await IpPoolChannel.findChannelByName(channelName)
        if (findChannel) {
            throw new Error('channelName 已占用!')
        }
        const channel = await new IpPoolChannel(req.body)
        await channel.save()
        // cache.setMapCache(configs.CHANNEL_CACHE_KEY, channelName, channel)
        await IpPoolChannel.getChannelCache(true)
        if (!channel.isPaused) {
            ChannelScheduleManage.startChannelSchedule(channel, configs.CHANNEL_SCHEDULE_LOOP_INTERVAL)
        }
        res.json({
            code: ApiResCode.success,
            channel
        })
    }

    @Decorators.RegisterRoute.post('/channel/edit')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async editChannel(req: express.Request, res: express.Response) {
        const { channelName: newChannelName, validateUrl: newValidateUrl, status: newStatus, maxRtt: newMaxRtt } = req.body
        UtilFuncs.checkChannelPostData(req.body)
        let channel = await IpPoolChannel.findChannelByName(newChannelName)
        if (!channel) {
            throw new Error(`channel: ${newChannelName} not found`)
        }
        let needClearChannelIps = false
        const isValidateUrlChanged = newValidateUrl !== channel.validateUrl
        const isStoppedFromRunning = (channel.status === IpPoolChannelStatus.normal) && (newStatus === IpPoolChannelStatus.paused)
        const isMaxRttChanged = newMaxRtt !== channel.maxRtt
        needClearChannelIps = !channel.isDefaultChannel && (isValidateUrlChanged || isStoppedFromRunning)

        Object.assign(channel, req.body)
        await channel.save()
        await IpPoolChannel.removeChannelRelatedRuleIpCountRecord(channel.channelName)
        await IpPoolChannel.getChannelCache(true)

        // cache.setMapCache(configs.CHANNEL_CACHE_KEY, channel.channelName, channel)
        ChannelScheduleManage.stopChannelSchedule(channel.channelName)

        const clearFunc = {
            clearallIps: () => ChannelIpDataModel.removeChannelAllIps(channel.channelName),
            clearBlockIps: () => ChannelIpDataModel.removeAllChannelBlockIps(channel.channelName),
            clearBackupIps: () => ChannelIpDataModel.removeChannelBackupIPsSet(channel.channelName),
        }

        const funcSet = new Set<() => Promise<any>>()
        let needClearAllIps = false
        if (!channel.isDefaultChannel) {
            if (isValidateUrlChanged) {
                needClearAllIps = true
                funcSet.add(clearFunc.clearallIps)
                funcSet.add(clearFunc.clearBackupIps)
                funcSet.add(clearFunc.clearBlockIps)
            }
        }

        if (isMaxRttChanged && !needClearAllIps) {
            funcSet.add(async () => {
                const excludeHosts = await ChannelIpDataModel.findBySortableFeildOfScoreRange(channel.channelName, 'rtt', newMaxRtt, null)
                await ChannelIpDataModel.removeChannelIps(channel.channelName, excludeHosts)
            })
        }

        funcSet.add(clearFunc.clearBackupIps)

        await Promise.all(Array.from(funcSet))

        if (!channel.isPaused) {
            ChannelScheduleManage.startChannelSchedule(channel, configs.CHANNEL_SCHEDULE_LOOP_INTERVAL)
        }
        res.json({
            code: ApiResCode.success,
            channel
        })
    }

    @Decorators.RegisterRoute.post('/channel/delete')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async deleteChannel(req: express.Request, res: express.Response) {
        const { channelName } = req.body
        let channel = await IpPoolChannel.findChannelByName(channelName)
        if (!channel) {
            throw new Error(`channel: ${channelName} not found`)
        }
        if (channel.isDefaultChannel) {
            throw new Error('default channel can not be deleted!')
        }
        ChannelScheduleManage.stopChannelSchedule(channel.channelName)
        await channel.remove()
        // cache.deleteMapCache(configs.CHANNEL_CACHE_KEY, channelName)
        await IpPoolChannel.getChannelCache(true)

        res.json({
            code: ApiResCode.success,
        })
    }

    @Decorators.RegisterRoute.get('/rules')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async reqGetIpRuleList(req: express.Request, res: express.Response) {
        const allRules = await GetIpRule.getRulesBySortedUsedCount()
        const tasks = await allRules.map(async rule => {
            const info = await GetIpRule.getRuleGetIpCountInfo(rule.name)
            return {
                ...rule,
                ruleGetIpCountInfo: info
            }
        })
        const list = await Promise.all(tasks)
        // const ruleGetIpCountInfo = await Promise.all(tasks)
        res.json({
            code: ApiResCode.success,
            // ipCountInfoList: ruleGetIpCountInfo,
            list: list.map(rule => toJson(rule))
        })
    }

    @Decorators.RegisterRoute.post('/rule/add')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async addGetIpRule(req: express.Request, res: express.Response) {
        const ruleData = fromJson(req.body)
        UtilFuncs.checkGetIpRulePostData(ruleData)
        const { name } = ruleData
        const findRule = await GetIpRule.findRuleByName(name)
        if (findRule) {
            throw new Error(`rule name: ${name}已被占用`)
        }
        const rule = new GetIpRule(ruleData)
        await rule.save()
        res.json({
            code: ApiResCode.success,
            rule: toJson(rule),
        })
    }

    @Decorators.RegisterRoute.post('/rule/edit')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async editGetIpRule(req: express.Request, res: express.Response) {
        const ruleData = fromJson(req.body)
        UtilFuncs.checkGetIpRulePostData(ruleData)
        const { name: newRuleName } = ruleData
        let rule = await GetIpRule.findRuleByName(newRuleName)
        if (!rule) {
            throw new Error(`channel: ${newRuleName} not found`)
        }
        const isNameChanged = newRuleName !== rule.name
        if (isNameChanged) {
            const findRule = await GetIpRule.findRuleByName(newRuleName)
            if (findRule) {
                throw new Error('rule name 已占用!')
            }
        }
        Object.assign(rule, ruleData)
        await rule.save()
        res.json({
            code: ApiResCode.success,
            rule: toJson(rule),
        })
    }

    @Decorators.RegisterRoute.post('/rule/delete')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async deleteGetIpRule(req: express.Request, res: express.Response) {
        const { name } = req.body
        let rule = await GetIpRule.findRuleByName(name)
        if (!rule) {
            throw new Error(`get ip rule: ${name} not found`)
        }
        await rule.remove()
        res.json({
            code: ApiResCode.success,
        })
    }

    @Decorators.RegisterRoute.post('/login')
    @Decorators.ApiCatchError
    @Decorators.useApiProxy(getProxyUrl)
    static async adminLogin(req: express.Request, res: express.Response) {
        if (req.session.isAdmin) {
            throw new Error('请不要重复登录')
        }
        const {userName, password} = req.body
        const passed = userName === injectedConfigs.CRAWL_POOL_ADMIN_USERNAME && password === injectedConfigs.CRAWL_POOL_ADMIN_PASSWORD
        if (!passed) {
            throw new Error('invalid password or username')
        } 
        req.session.isAdmin = true
        res.json({
            code: ApiResCode.success,
        })
    }

    @Decorators.RegisterRoute.post('/logout')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async adminLogout (req: express.Request, res: express.Response) {
        if (!req.session.isAdmin) {
            throw new Error('越权操作')
        }
        req.session.isAdmin = false
        res.json({
            code: ApiResCode.success,
        })
    }

    @Decorators.RegisterRoute.post('/proxypoolconfig/edit')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    @Decorators.useApiProxy(getProxyUrl)
    static async editSystemConfig(req: express.Request, res: express.Response) {
        const oldConfigs = {
            ...EditableConfigs.getConfig('proxyPoolServer')
        }
        const validators = {
            SERVER_MAX_VALIDATE_THREAD: (v) => {
                if (v <= 0) {
                    throw new Error('invalid validateThread count')
                }
            }
        }
        Object.keys(req.body).forEach(key => {
            const value = Reflect.get(req.body, key)
            const validator = Reflect.get(validators, key)
            validator && validator(value)
        })
        EditableConfigs.setConfig('proxyPoolServer', {
            ...req.body
        })

        const isModified = (feildName) => Reflect.get(req.body, feildName) !== undefined
        const {SERVER_MAX_VALIDATE_THREAD, SERVER_RUNNING} = req.body
        if (isModified('SERVER_MAX_VALIDATE_THREAD') && oldConfigs.SERVER_MAX_VALIDATE_THREAD !== SERVER_MAX_VALIDATE_THREAD) {
            // EditableConfigs.setConfig('proxyPoolServer', {
            //     SERVER_MAX_VALIDATE_THREAD: validateThread
            // })
            if (ValidateTasksManage.isRunning()) {
                ValidateTasksManage.stop()
                ValidateTasksManage.start({
                    threadCount: SERVER_MAX_VALIDATE_THREAD,
                    getChannelData: (name) => {
                        const {channelMap} = IpPoolChannel.getChannelCache()
                        return channelMap.get(name)
                    }
                },)
            }
        }

        if (isModified('SERVER_RUNNING') && oldConfigs.SERVER_RUNNING !== SERVER_RUNNING) {
            if (SERVER_RUNNING) {
                schedule.start(EditableConfigs.getConfig('proxyPoolServer').SERVER_MAX_VALIDATE_THREAD)
            } else {
                schedule.stop()
            }
        }
        res.json({
            code: ApiResCode.success
        })
    }


    @Decorators.RegisterRoute.post('/adminconfig/edit')
    @Decorators.ApiCatchError
    @Decorators.isAdmin
    static async editAdminConfig(req: express.Request, res: express.Response) {
        const {showExampleProxyListPage} = req.body
        const {SHOW_EXAMPLE_PROXY_LIST_PAGE} = EditableConfigs.getConfig('admin')
        if (!!showExampleProxyListPage !== SHOW_EXAMPLE_PROXY_LIST_PAGE) {
            EditableConfigs.setConfig('admin', {
                SHOW_EXAMPLE_PROXY_LIST_PAGE: showExampleProxyListPage
            })
        }
        res.json({
            code: ApiResCode.success
        })
    }

    @Decorators.RegisterRoute.get('/proxy/list')
    @Decorators.ApiCatchError
    @Decorators.useApiProxy(getProxyUrl)
    static async getProxyIpList (req: express.Request, res: express.Response) {
        let {pn: pnValue} = req.query
        const pn = pnValue ? Number(pnValue) : 0
        const limit = 10, maxPn = 10
        
        const proxyIpList = await cache.tryGetCache<ChannelIpDataModel[]>('api-cache-proxy-list', async () => {
            const ips = await ChannelIpDataModel.findBySortableFeildOfRankRange(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, 'rtt', 0, limit * maxPn - 1)
            const ipDataObjArr = await ChannelIpDataModel.findChannelIpData(DefaultValueConfigs.DEFAULT_CHANNEL_NAME, ips)
            return ipDataObjArr
        }, 1000 * 60 * 3)
        const offset = pn * limit
        res.json({
            code: ApiResCode.success,
            maxPn: maxPn - 1,
            list: proxyIpList.slice(offset, offset + limit)
        })
    }

}

class OtherRouteHandlers {
    @Decorators.RouteCatchError
    static renderProxyListPage (req: express.Request, res: express.Response) {
        const {SHOW_EXAMPLE_PROXY_LIST_PAGE} = EditableConfigs.getConfig('admin')
        if (!SHOW_EXAMPLE_PROXY_LIST_PAGE) {
            res.sendStatus(404)
        } else {
            res.render('index')
        }
    }
}

export default function registerRoute (app: express.Express) {
    Decorators.RegisterRoute.listen(app)
    app.get('/proxylist', OtherRouteHandlers.renderProxyListPage)
}
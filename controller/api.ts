import express from 'express'

import {catchError, fromJson, toJson} from 'utils'
import { DefaultValueConfigs, configs } from 'getSettings';
import { IpPoolChannel, GetIpRule, ChannelIpDataModel } from 'models/model';
import {ChannelScheduleManage, ValidateTasksManage} from './schedule'
import * as cache from './cache'

const ApiCatchError = catchError('api', (e, cb, req: express.Request, res: express.Response) => {  
    res.json({
        code: 1,
        msg: e.message,
    })
})


export class AdminApiHandlers {
    @ApiCatchError
    static async reqAllChannels (req: express.Request, res: express.Response) {
        const channels = await IpPoolChannel.findAllChannel()
        res.json({
            code: 0,
            list: channels,
        })
    }

    @ApiCatchError
    static async addChannel (req: express.Request, res: express.Response) {
        const {channelName} = req.body
        if (channelName === DefaultValueConfigs.DEFAULT_CHANNEL_NAME) {
            throw new Error('invalid channel name') 
        }
        const findChannel = await IpPoolChannel.findChannel(channelName)
        if (findChannel) {
            throw new Error('channelName 已占用!')
        }
        const channel = await new IpPoolChannel(req.body)
        await channel.save()
        cache.setMapCache(configs.ALL_CHANNELS_MAP_CACHE_KEY, channelName, channel)
        if (!channel.isPaused) {
            ChannelScheduleManage.startChannelSchedule(channel, configs.CHANNEL_SCHEDULE_LOOP_INTERVAL)
        }
        res.json({
            code: 0,
            channel
        })
    }

    @ApiCatchError
    static async editChannel (req: express.Request, res: express.Response) {
        const {channelName: newChannelName, httpValidateUrl, validateUrl: newValidateUrl} = req.body
        let channel = await IpPoolChannel.findChannel(newChannelName)
        if (!channel) {
            throw new Error(`channel: ${newChannelName} not found`)
        }
        const isNameChanged = newChannelName !== channel.channelName
        if (isNameChanged) {
            const findChannel = await IpPoolChannel.findChannel(newChannelName)
            if (findChannel) {
                throw new Error('channelName 已占用!')
            }
        }
        if (httpValidateUrl && !channel.isDefaultChannel) {
            throw new Error(`invalid feild: httpValidateUrl`)
        }
        let needClearChannelIps = false
        const isValidateUrlChanged = newValidateUrl !== channel.validateUrl
        needClearChannelIps = !channel.isDefaultChannel && isValidateUrlChanged

        Object.assign(channel, req.body)
        await channel.save()
        cache.setMapCache(configs.ALL_CHANNELS_MAP_CACHE_KEY, channel.channelName, channel)
        ChannelScheduleManage.stopChannelSchedule(channel.channelName)

        if (needClearChannelIps) {
            await ChannelIpDataModel.removeChannelAllIps(channel.channelName)
            await ChannelIpDataModel.removeAllChannelBlockIps(channel.channelName)
        }
        ChannelScheduleManage.startChannelSchedule(channel, configs.CHANNEL_SCHEDULE_LOOP_INTERVAL)
        res.json({
            code: 0,
            channel
        })
    }

    @ApiCatchError
    static async deleteChannel (req: express.Request, res: express.Response) {
        const {channelName} = req.body
        let channel = await IpPoolChannel.findChannel(channelName)
        if (!channel) {
            throw new Error(`channel: ${channelName} not found`)
        }
        ChannelScheduleManage.stopChannelSchedule(channel.channelName)
        await channel.remove()
        cache.deleteMapCache(configs.ALL_CHANNELS_MAP_CACHE_KEY, channelName)
        res.json({
            code: 0,
        })
    }
    
    @ApiCatchError
    static async reqGetIpRuleList (req: express.Request, res: express.Response) {
        const allRules = await GetIpRule.getRulesBySortedUsedCount()
        res.json({
            code: 0,
            list: allRules
        })
    }

    @ApiCatchError
    static async addGetIpRule (req: express.Request, res: express.Response) {
        const ruleData = fromJson(req.body)
        const {name} = ruleData
        const findRule = await GetIpRule.findRuleByName(name)
        if (findRule) {
            throw new Error(`rule name: ${name}已被占用`)
        }
        const rule = new GetIpRule(ruleData)
        await rule.save()
        res.json({
            code: 0,
            rule,
        })
    }

    @ApiCatchError
    static async editGetIpRule (req: express.Request, res: express.Response) {
        const ruleData = fromJson(req.body)
        const {name: newRuleName} = ruleData
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
            code: 0,
            rule,
        })
    }

    @ApiCatchError
    static async deleteGetIpRule (req: express.Request, res: express.Response) {
        const {name} = req.body
        let rule = await GetIpRule.findRuleByName(name)
        if (!rule) {
            throw new Error(`get ip rule: ${name} not found`)
        }
        await rule.remove()
        res.json({
            code: 0,
        })
    }

    @ApiCatchError
    static async getSystemConfig (req: express.Request, res: express.Response) {
        
    }

    @ApiCatchError
    static async editSystemConfig (req: express.Request, res: express.Response) {
        
    }
}
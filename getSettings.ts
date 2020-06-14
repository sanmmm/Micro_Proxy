import dotenv from 'dotenv'
dotenv.config()

export default {
    REDIS_SERVER: process.env.REDIS_SERVER,
    DEFAULT_AIM_WEBSITE: process.env.DEFAULT_AIM_WEBSITE || 'https://www.baidu.com',
}

export const DefaultValueConfigs = {
    DEFAULT_CHANNEL_NAME: 'DEFAULT_CHANNEL',
    DEFAULT_CHANNEL_MAXRTT: 4000,
    DEFAULT_CHANNEL_VOLUME: 200,
    DEAFULT_CHANNEL_ITEM_BLOCK_TIME: 1000 * 60 * 60 * 24 * 5,
    DEFAULT_CHANNEL_ITEM_LIFETIME: 1000 * 60 * 15,
}

export const configs = {
    UNKNOWN_LOCATION_CODE: 'UNKNOWN',
    ALL_CHANNELS_MAP_CACHE_KEY: 'ALL_CHANNELS_CACHE_KEY',
    CHANNEL_SCHEDULE_LOOP_INTERVAL: 1000 * 60 * 1,
}

import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config()

export const DefaultValueConfigs = {
    DEFAULT_CHANNEL_NAME: 'DEFAULT_CHANNEL',
    DEFAULT_CHANNEL_HTTPS_VALIDATE_URL: 'https://www.baidu.com/baidu.html',
    DEFAULT_CHANNEL_HTTP_VALIDATE_URL: 'http://www.baidu.com/baidu.html',
    DEFAULT_CHANNEL_MIN_SIZE: 500,
    CHANNEL_DEFAULT_MAXRTT: 4000,
    CHANNEL_DEFAULT_VOLUME: 200,
    CHANNEL_DEFAULT_ITEM_BLOCK_TIME: 1000 * 60 * 60 * 24 * 5,
    CHANNEL_DEFAULT_ITEM_LIFETIME: 1000 * 60 * 15,
}

export const configs = {
    UNKNOWN_LOCATION_CODE: 'UNKNOWN',
    CHANNEL_CACHE_KEY: 'ALL_CHANNELS_CACHE_KEY',
    ALL_DEFAULT_CHANNEL_IPS_KEY: 'ALL_DEFAULT_CHANNEL_IPS_KEY',
    CHANNEL_SCHEDULE_LOOP_INTERVAL: 1000 * 60 * 1,
}

export namespace EditableConfigs {
    const DefaultEditableConfigs = {
        // server configs
        SERVER_MAX_VALIDATE_THREAD: 50,
        // client configs
        CLIENT_SHOW_EXAMPLE_PROXY_LIST_PAGE: true,
    }
    

    let configs: typeof DefaultEditableConfigs = null

    const EDITABLE_CONFIG_FILE_NAME = 'editable_config.json'

    export function setConfig (obj: Partial<typeof DefaultEditableConfigs>) {
        Object.assign(configs, obj)
        fs.writeFileSync(EDITABLE_CONFIG_FILE_NAME, JSON.stringify(configs))
    }

    export function getConfig () {
        if (!configs) {
            const configStr = fs.readFileSync(EDITABLE_CONFIG_FILE_NAME, {
                encoding: 'utf-8'
            })
            configs = {
                ...DefaultEditableConfigs,
                ...JSON.parse(configStr),
            }
        }
        return configs
    }
}

const injectedConfigs = {
    IS_PRODUCTION_MODE: process.env.NODE_ENV === 'production',
    REDIS_SERVER_URL: process.env.REDIS_SERVER || 'redis://localhost',
    CRAWL_POOL_SERVER_PORT: process.env.CRAWL_POOL_SERVER_PORT || 3003,
    CRAWL_POOL_SERVER_URL: process.env.CRAWL_POOL_SERVER_URL || 'localhost',
    CRAWL_POOL_ADMIN_USERNAME: process.env.CRAWL_POOL_SERVER_USERNAME,
    CRAWL_POOL_ADMIN_PASSWORD: process.env.CRAWL_POOL_SERVER_PASSWORD,
    CRAWL_POOL_ADMIN_SESSION_SECRET: process.env.CRAWL_POOL_ADMIN_SESSION_SECRET || 'secret',
}

export default injectedConfigs

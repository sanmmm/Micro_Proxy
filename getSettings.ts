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
    const EditableConfigDefaultValue = {
        proxyPoolServer: {
            SERVER_MAX_VALIDATE_THREAD: 50,
            SERVER_RUNNING: true,
        },
        admin: {
            SHOW_EXAMPLE_PROXY_LIST_PAGE: true,
        },
    }    

    const EDITABLE_CONFIG_FILE_NAME = 'editable_config.json'
    
    const readConfigsFromFile = () => {
        let configStr = null
        if (fs.existsSync(EDITABLE_CONFIG_FILE_NAME)) {
            configStr = fs.readFileSync(EDITABLE_CONFIG_FILE_NAME, {
                encoding: 'utf-8'
            })
        }
        return JSON.parse(configStr) || {
            ...EditableConfigDefaultValue
        }
    }

    const saveConfigsToFile = () => {
        fs.writeFileSync(EDITABLE_CONFIG_FILE_NAME, JSON.stringify(configs))
    }

    const configs: typeof EditableConfigDefaultValue = readConfigsFromFile()

    export type ConfigDef = typeof EditableConfigDefaultValue
    
    type ConfigNamespace = keyof typeof EditableConfigDefaultValue
    export function setConfig<T extends ConfigNamespace> (namespace: T, modifiedObj: Partial<ConfigDef[T]>) {
        const subConfigObj = Reflect.get(configs, namespace)
        Object.assign(subConfigObj, modifiedObj)
        saveConfigsToFile()
    }

    export function getConfig<T extends ConfigNamespace> (namespace: T): ConfigDef[T] {
        return Reflect.get(configs, namespace)
    }

}

const injectedConfigs = {
    IS_PRODUCTION_MODE: process.env.NODE_ENV === 'production',
    REDIS_SERVER_URL: process.env.REDIS_SERVER || 'redis://localhost',
    CRAWL_POOL_ADMIN_CLIENT_PORT: process.env.CRAWL_POOL_ADMIN_CLIENT_PORT || 3003,
    CRAWL_POOL_ADMIN_SERVER_URL: process.env.CRAWL_POOL_ADMIN_SERVER_URL, // not required
    CRAWL_POOL_ADMIN_USERNAME: process.env.CRAWL_POOL_ADMIN_USERNAME,
    CRAWL_POOL_ADMIN_PASSWORD: process.env.CRAWL_POOL_ADMIN_PASSWORD,
    CRAWL_POOL_ADMIN_SESSION_SECRET: process.env.CRAWL_POOL_ADMIN_SESSION_SECRET || 'secret',
}


export default injectedConfigs


import dotenv from 'dotenv'
dotenv.config()

export default {
    REDIS_SERVER: process.env.REDIS_SERVER,
    DEFAULT_AIM_WEBSITE: process.env.DEFAULT_AIM_WEBSITE || 'https://www.baidu.com',
}

export const config = {
    DEFAULT_CHANNEL_NAME: 'DEFAULT_CHANNEL',
    UNKNOWN_LOCATION_CODE: 'UNKNOWN',
}
import { URL } from 'url'
import got, { Response, CancelableRequest } from 'got'
import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import tunnel from 'tunnel'

import {FuncTimeout} from 'utils'

function getAgent(host: string) {
    return {
        http: new HttpProxyAgent(host),
        https: new HttpsProxyAgent(host),
    }
}

type UrlResValidator = string | RegExp | ((res: Response) => boolean)

export async function baseValidate(aimUrl: string, host: string, validator?: UrlResValidator) {
    let startTime: number
    let request: CancelableRequest<Response<string>>
     const res = await FuncTimeout({
         func: () => {
            startTime = Date.now()
            request = got(aimUrl, {
                agent: getAgent(host) as any,
                retry: 0,
                headers: {
                    'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36",
                    'Accept': "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                }
            })
            return request
         },
         cancel: () => {
             request.cancel('timeout error')
         }
     }, 4000, 1)
    const rtt = Date.now() - startTime
    let passed = !validator
    if (validator instanceof Function) {
        passed = validator(res)
    } else if (validator instanceof RegExp) {
        passed = validator.test(res.body)
    } else if (typeof validator === 'string') {
        passed = res.body.includes(validator)
    }

    if (!passed) {
        throw new Error(`使用${host}验证${aimUrl}失败`)
    }
    // TODO 响应处理精细化

    console.log(res.body)
    console.log(rtt)
    return {
        rtt,
    }
}

export async function validateLocation(host: string) {

}

export async function validateAnonymity(host: string) {

}

// baseValidate('http://110.243.26.111:9999', 'http://110.243.26.111:9999')
// baseValidate('https://www.baidu.com/baidu.html', 'http://110.243.26.111:9999')


// baseValidate('https://www.baidu.com/baidu.html', 'http://58.220.95.78:9401')
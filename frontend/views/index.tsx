import React from 'react'
import * as polished from 'polished'
import { ClassNamesExport as BindClass } from 'classnames/types'

import { ChannelIpDataDef, IpDataHttpTypes, IpDataAnonymities } from 'type'
import DefaultLayout from './base/layout'
import { useScript, useStyle } from './base/hooks'

const [styleNode, classes] = useStyle('proxy-list-css', {
})

export default function IndexLayout(props) {

    const scriptNode = useScript<{
        dayjs: any;
        dayjs_plugin_relativeTime: any;
        $: JQueryStatic;
        classes: typeof classes;
        classNames: BindClass;
        IpDataHttpTypes: typeof IpDataHttpTypes;
        IpDataAnonymities: typeof IpDataAnonymities;
    }>(({ $, classes, classNames: bindClass, dayjs, IpDataAnonymities, IpDataHttpTypes, dayjs_plugin_relativeTime }) => {
        const vars = {
            pn: 0,
            maxPn: 0,
            list: [] as ChannelIpDataDef[],
            tbodyNode: null as JQuery<HTMLTableSectionElement>,
            paginationNode: null as JQuery<HTMLUListElement>
        }

        $(window).on('load', function () {
            dayjs.extend(dayjs_plugin_relativeTime)
            dayjs.locale('zh-cn')
            vars.tbodyNode = $('tbody')
            vars.paginationNode = $('#pagination')
            reqProxyList(0)
        })

        const getReqApi = (pn: number) => {
            return `/api/proxy/list?pn=${pn}`
        }

        const reqProxyList = (pn: number) => {
            $.ajax({
                method: 'GET',
                url: getReqApi(pn),
                success: (res) => {
                    if (res.code === 0) {
                        vars.pn = pn
                        vars.maxPn = res.maxPn
                        vars.list = res.list
                        renderTable()
                    }
                }
            })
        }

        type RenderKeys = keyof Pick<ChannelIpDataDef, 'host' | 'anonymity' | 'httpType' | 'rtt' | 'lastValidateTime'>
        const keys: RenderKeys[] = ['host', 'anonymity', 'httpType', 'rtt', 'lastValidateTime']

        const transformKeyValue: Partial<{ [key in RenderKeys]: (v: ChannelIpDataDef[key]) => any }> = {
            anonymity: (v) => {
                if (v === IpDataAnonymities.high) {
                    return '高匿'
                } else if (v === IpDataAnonymities.no) {
                    return '透明'
                }
                return '未知'
            },
            httpType: (v) => {
                if (v === IpDataHttpTypes.http) {
                    return 'http'
                } else if (v === IpDataHttpTypes.https) {
                    return 'https'
                }
                return '未知'
            },
            rtt: (v) => `${v}ms`,
            lastValidateTime: (v) => dayjs().from(dayjs(v)),
        }

        const renderTable = () => {
            const { list, pn, maxPn, tbodyNode, paginationNode } = vars
            tbodyNode.empty()
            paginationNode.empty()

            list.forEach(item => {
                if (!item) {
                    return
                }
                const ele = $('<tr></tr>')
                keys.forEach(key => {
                    let v = item[key]
                    const transformer: Function = transformKeyValue[key]
                    if (transformer) {
                        v = transformer(v)
                    }
                    ele.append(`<td>${v}</td>`)
                })
                tbodyNode.append(ele)
            })
            const firstNode = $(`<li class="${bindClass('page-item', pn === 0 && 'disabled')}">
                <a class="page-link" href="#" tabIndex={-1} aria-disabled="true">上一页</a>
            </li>`)
            if (pn !== 0) {
                firstNode.click(reqProxyList.bind(null, pn - 1))
            }
            paginationNode.append(firstNode)
            for (let i = 0; i <= maxPn; i++) {
                const liEle = $(`<li class="${bindClass('page-item', pn === i && 'active')}"></li>`)
                liEle.append(`<a class="page-link" href="#">${i + 1}</a>`)
                liEle.click(reqProxyList.bind(null, i))
                paginationNode.append(liEle)
            }
            const lastNode = $(`<li class="${bindClass('page-item', pn === maxPn && 'disabled')}">
                <a class="page-link" href="#" tabIndex={-1} aria-disabled="true">下一页</a>
            </li>`)
            if (pn !== maxPn) {
                lastNode.click(reqProxyList.bind(null, pn + 1))
            }
            paginationNode.append(lastNode)
        }

    }, {
        classes,
        IpDataHttpTypes: IpDataHttpTypes,
        IpDataAnonymities: IpDataAnonymities,
    })

    const layoutProps = {
        header: <React.Fragment>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.4.1/dist/css/bootstrap.min.css"></link>
            <script src="https://cdn.jsdelivr.net/npm/classnames@2.2.6/index.min.js" />
            <script src="https://cdn.jsdelivr.net/npm/dayjs@1.8.28/dayjs.min.js" />
            <script src="https://cdn.jsdelivr.net/npm/dayjs@1.8.28/plugin/relativeTime.js" />
            <script src="https://cdn.jsdelivr.net/npm/dayjs@1.8.28/locale/zh-cn.js" />
            {styleNode}
        </React.Fragment>
    }
    return <DefaultLayout {...layoutProps}>
        <div>
            <nav className="navbar navbar-dark bg-dark">
                <a className="navbar-brand" href="">Micro Proxy</a>
                <span className="navbar-text">
                    开箱即用的代理ip库
                </span>
            </nav>
            <table className="table table-striped">
                <thead>
                    <tr>
                        <th scope="col">地址</th>
                        <th scope="col">可匿性</th>
                        <th scope="col">类型</th>
                        <th scope="col">延时</th>
                        <th scope="col">上次验证时间</th>
                    </tr>
                </thead>
                <tbody>
                </tbody>
            </table>
            <ul id="pagination" className="pagination justify-content-center">
            </ul>
        </div>
        {scriptNode}
    </DefaultLayout>
}
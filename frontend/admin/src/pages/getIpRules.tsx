import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Table, Modal, Form, Input, Button, InputNumber, message, Card, Tabs } from 'antd'
import { useRequest, request } from 'umi'
import { FormOutlined, DeleteOutlined } from '@ant-design/icons'
import JsonEditor, {JSONEditorOptions} from 'jsoneditor'
import 'jsoneditor/dist/jsoneditor.css'

import {fromJson, toJson, toPureJson, JsonSchema} from '@/utils'
import styles from './index.less';

type ResListItem = GetIpRuleDef & {
    ruleGetIpCountInfo: {
        validCount: string;
        invalidCount: number;
    }
}

type Res = {
    code: number
    list: ResListItem[];
}

enum ModalTypes {
    showEditOrCreateRule = 1,
    showRuleInfo,
}

export default () => {
    const [editItem, setEditItem] = useState(null as GetIpRuleDef)
    const [modalType, setModalType] = useState(null as ModalTypes)
    const [deleteData, setDeleteData] = useState(null as {name: string})

    const { data: rulesData, loading: reqRulesLoading, run: reqRuleList } = useRequest<any, any, Res>('/api/rules', {
        formatResult: (res) => ({
            ...res,
            list: res.list.map(fromJson)
        }),
    })

    const { run: reqDeleteRule } = useRequest({
        url: '/api/rule/delete',
        method: 'post',
        requestType: 'json',
        data: deleteData,
    }, {
        formatResult: (res) => res,
        manual: true,
        onSuccess: () => {
            message.success('删除成功')
            reqRuleList()
        },
        onError: (e) => {
            message.error(e.message)
        }
    })

    const dataSource = (rulesData && rulesData.list) || []

    useEffect(() => {
        if (deleteData) {
            reqDeleteRule()
        }
    }, [deleteData])

    const handleEditOrCreateRuleModalClose = useCallback(() => {
        setEditItem(null)
        setModalType(null)
    }, [])
    
    const handleRefresh = useCallback(() => {
        reqRuleList()
    }, [])

    return (
        <Card title="原始ip抓取规则管理"  className={styles.ruleList} extra={<Button onClick={_ => {
            setModalType(ModalTypes.showEditOrCreateRule)
            setEditItem(null)
        }}>新建</Button>}>
            <ShowRuleDetailModal show={modalType !== null} initialTabType={modalType === ModalTypes.showEditOrCreateRule ? TabTypes.editor : TabTypes.view}  rule={editItem} 
                onClose={handleEditOrCreateRuleModalClose} onRefresh={handleRefresh} />
            <Table
                pagination={false}
                showHeader
                loading={reqRulesLoading}
                dataSource={dataSource}
                rowKey={item => item.name}
                columns={[
                    {
                        key: 'name',
                        dataIndex: 'name',
                        title: '名称',
                    },
                    {
                        key: 'ruleGetIpCountInfo',
                        dataIndex: 'ruleGetIpCountInfo',
                        title: '通过率',
                        render: (value: ResListItem['ruleGetIpCountInfo']) => `${value.validCount}/${value.validCount + value.invalidCount}`
                    },
                    {
                        key: 'usedCount',
                        dataIndex: 'usedCount',
                        title: '调用次数'
                    },
                    {
                        key: 'detail',
                        title: '规则详情',
                        render: (_, item) => <Button onClick={_ => {
                            setEditItem(item)
                            setModalType(ModalTypes.showRuleInfo)
                        }}>查看</Button>
                    },
                    {
                        key: 'action',
                        title: '操作',
                        render: (_, item) => {
                            return <div className={styles.actionArea}>
                                <FormOutlined onClick={_ => {
                                    setEditItem(item)
                                    setModalType(ModalTypes.showEditOrCreateRule)
                                }} />
                                <DeleteOutlined onClick={_ => setDeleteData({name: item.name})}/>
                            </div>
                        }
                    }
                ]}
            />
        </Card>
    );
}

function getRuleSchemaConfig (isEditMode = false) {

    const Selector: SchemaObjValue = {
        value: ['number', 'string'],
        required: true,
        helper: ['type = string | FuncSelector | number', 'type FuncSelector = (itemEle: CheerioStatic, types: { IpDataHttpTypes: typeof IpDataHttpTypes, IpDataAnonymities: typeof IpDataAnonymities }) => any']
    }

    const getSelectorType = (isRequired = true) => {
        return  {
            value: ['number', 'string'] as ['number', 'string'],
            required: isRequired,
            helper: ['type = string | FuncSelector | number', 'type FuncSelector = (itemEle: CheerioStatic, types: { IpDataHttpTypes: typeof IpDataHttpTypes, IpDataAnonymities: typeof IpDataAnonymities }) => any']
        }
    }

    const schemaConfig: SchemaConfig = {
        name: 'string',
        url: {
            value: 'string',
            required: false,
        },
        itemSelector: getSelectorType(),
        itemStartIndex: 'number',
        itemInfoSelectors: {
            ip: getSelectorType(),
            port: getSelectorType(),
            location: getSelectorType(),
            httpType: getSelectorType(),
            anonymity: getSelectorType(),
            rtt: getSelectorType(),
        },
        pagination: {
            required: false,
            value: {
                formatUrl: {
                    value: 'string',
                    helper: '(pn: number) => string'
                },
                maxPn: 'number',
            }
        },
        interceptor: {
            required: false,
            helper: '(ipDataArr: FreshIpData[]) => FreshIpData[]',
            value: 'string'
        },
    }

    if (isEditMode) {
        delete schemaConfig.name
    }

    return JsonSchema.getJsonSchema(schemaConfig)
}

enum TabTypes {
    editor = 'editor',
    view = 'view',
    typeInfo = 'typeInfo',
}

const ShowRuleDetailModal = React.memo<{
    show: boolean;
    rule?: GetIpRuleDef;
    initialTabType?: TabTypes;
    onClose: () => any;
    onRefresh: () => any;
}>((props) => {
    const {rule, show, onClose, onRefresh, initialTabType = TabTypes.editor} = props
    const isEditMode = !!rule

    const [postData, setPostData] = useState(null as Partial<GetIpRuleDef>)
    const [tabType, setTabType] = useState(TabTypes.editor)

    const jsonEditorNodeRef = useRef(null as HTMLDivElement)
    const jsonShowNodeRef = useRef(null as HTMLDivElement)
    const jsonViewNodeRef = useRef(null as HTMLDivElement)
    const jsonEditorRef = useRef(null as JsonEditor)
    const jsonShowRef = useRef(null as JsonEditor)
    const jsonViewRef = useRef(null as JsonEditor)

    const {info: ruleTypeInfo, jsonSchema: ruleJsonSchema} = useMemo(() => {
        return isEditMode ? getRuleSchemaConfig(true) : getRuleSchemaConfig()
    }, [rule])

    const rulePureJsonObj = useMemo(() => {
        const jsonObj = toPureJson(rule || {})
        return Object.keys(ruleTypeInfo).reduce((obj, key) => {
            Reflect.set(obj, key, Reflect.get(jsonObj, key))
            return obj
        }, {})
    }, [rule])

    const {data: editRuleRes, loading: editRuleLoading, run: reqEditRule} = useRequest({
        url: '/api/rule/edit',
        method: 'post',
        requestType: 'json',
        data: postData,
    }, {
        formatResult: (res) => res,
        manual: true,
        onSuccess: () => {
            message.success('提交成功')
            onRefresh()
        },
        onError: (e) => {
            message.error(`提交失败: ${e.message}`)
        },
    })

    const {data: addRuleRes, loading: addRuleLoading, run: reqAddRule} = useRequest({
        url: '/api/rule/add',
        method: 'post',
        requestType: 'json',
        data: postData,
    }, {
        formatResult: (res) => res,
        manual: true,
        onSuccess: () => {
            message.success('提交成功')
            onRefresh()
        },
        onError: (e) => {
            message.error(`提交失败: ${e.message}`)
        },
    })

    useEffect(() => {
        if (postData) {
            isEditMode ? reqEditRule() : reqAddRule()
        }
    }, [postData])

    const handleTabChange = (type: TabTypes) => {
        setTabType(type)
        if (type === TabTypes.view) {
            const jsonData = jsonEditorRef.current.get()
            jsonViewRef.current.set(jsonData)
        }
    }

    useEffect(() => {
        if (show) {
            if (!jsonEditorRef.current) {
                jsonEditorRef.current = new JsonEditor(jsonEditorNodeRef.current, {
                    mode: 'code',
                    sortObjectKeys: false,
                    enableSort: false,
                    enableTransform: false,
                })
            }
            if (!jsonShowRef.current) {
                jsonShowRef.current = new JsonEditor(jsonShowNodeRef.current, {
                    mode: 'preview',
                    mainMenuBar: false,
                    statusBar: false,
                })
            }
            if (!jsonViewRef.current) {
                jsonViewRef.current = new JsonEditor(jsonViewNodeRef.current, {
                    mode: 'preview',
                    mainMenuBar: false,
                    statusBar: false,
                })
            }
            jsonEditorRef.current && jsonEditorRef.current.setSchema({
                "$schema": "http://json-schema.org/schema#",
                ...ruleJsonSchema,
              "additionalProperties": false
            })
            jsonEditorRef.current && jsonEditorRef.current.set(rulePureJsonObj)
            jsonShowRef.current && jsonShowRef.current.set(ruleTypeInfo)

            if (tabType !== initialTabType) {
                handleTabChange(initialTabType)
            }
        }
    }, [show])

    const handleSubmit = () => {
        let data: any
        try {
            data = jsonEditorRef.current.getText()
        } catch (e) {
            console.error(e)
            message.error('格式错误：', e.message)
        }
        const dataObj = JSON.parse(data)
        if (isEditMode) {
            dataObj.name = rule.name
        }
        const postData = toJson(dataObj)
        setPostData(postData)
    }

    return <Modal visible={show}
        title={rule ? `规则[${rule.name}]` : '新建'}
        okText="提交"
        cancelText="关闭"
        onCancel={onClose}
        onOk={handleSubmit}
        okButtonProps={{
            loading: editRuleLoading || addRuleLoading
        }}
        forceRender
    >
          <Tabs activeKey={tabType} onChange={handleTabChange}>
            <Tabs.TabPane tab="编辑" key={TabTypes.editor} forceRender>
                <div ref={jsonEditorNodeRef}></div>
            </Tabs.TabPane>
            <Tabs.TabPane tab="查看" key={TabTypes.view} forceRender>
                <div ref={jsonViewNodeRef}></div>
            </Tabs.TabPane>
            <Tabs.TabPane tab="类型说明" key={TabTypes.typeInfo} forceRender>
                <div ref={jsonShowNodeRef}></div>
            </Tabs.TabPane>
        </Tabs>
    </Modal>
})

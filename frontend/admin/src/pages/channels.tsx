import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Table, Modal, Form, Input, Button, InputNumber, message, Card, Descriptions } from 'antd'
import { useRequest, request } from 'umi'
import { FormOutlined, DeleteOutlined } from '@ant-design/icons'

import styles from './index.less';

type ResListItem = IpPoolChannelDef & {
    isDefaultChannel: boolean;
    size: number;
    ruleIpCountInfoArr: {
        ruleName: string;
        usedIpCount: number;
    }[]
}

type Res = {
    code: number
    list: ResListItem[];
}

enum ModalTypes {
    showEditOrCreateChannel = 1,
    showChannelDetail
}

const formatDuation = (durationTime: number) => {
    const interval = [1000, 60, 60, 24, 356]
    const unitName = ['秒', '分钟', '小时', '天', '年']
    let formatStr = '', duration = durationTime
    interval.some((v, index) => {
        const result = Math.floor(duration / v)
        const remainder = duration % v
        if (remainder !== 0 && index > 0) {
            formatStr = `${remainder}${unitName[index - 1]}` + formatStr
        }
        if (result === 0) {
            return true
        }
        duration = result
    })
    return formatStr
}

export default () => {
    const [focusItem, setFocusItem] = useState(null as ResListItem)
    const [modalType, setModalType] = useState(null as ModalTypes)
    const [deleteData, setDeleteData] = useState(null as { channelName: string })

    const { data: channelsData, loading: reqChannelsLoading, run: reqChannels } = useRequest<any, any, Res>('/api/channels', {
        formatResult: (res) => res,
    })

    const { data: baseInfoRes } = useRequest('', {
        manual: true,
        cacheKey: 'baseinfo',
    })
    const defaultValueObj = baseInfoRes.defaultConfigs || {}

    const { run: reqDeleteChannel } = useRequest({
        url: '/api/channel/delete',
        method: 'post',
        requestType: 'json',
        data: deleteData,
    }, {
        formatResult: (res) => res,
        manual: true,
        onSuccess: () => {
            message.success('删除成功')
            reqChannels()
        },
        onError: (e) => {
            message.error(e.message)
        }
    })

    const dataSource = (channelsData && channelsData.list) || []

    useEffect(() => {
        if (deleteData) {
            reqDeleteChannel(deleteData.channelName)
        }
    }, [deleteData])

    const handleEditOrCreateChannelModalClose = useCallback(() => {
        setFocusItem(null)
        setModalType(null)
    }, [])

    const handleRefresh = useCallback(() => {
        reqChannels()
    }, [])

    const handleChannelDetailModalClose = useCallback(() => {
        setModalType(null)
    }, [])

    return (
        <Card title="频道(channel)管理" className={styles.channelList} extra={<Button onClick={_ => {
            setModalType(ModalTypes.showEditOrCreateChannel)
            setFocusItem(null)
        }}>新建</Button>}>
            <EditChannel item={focusItem} onClose={handleEditOrCreateChannelModalClose} show={modalType === ModalTypes.showEditOrCreateChannel}
                onRefresh={handleRefresh}
            />
            <ChannelDetailModal channel={focusItem} show={modalType === ModalTypes.showChannelDetail} onClose={handleChannelDetailModalClose} />
            <Table
                pagination={false}
                showHeader
                loading={reqChannelsLoading}
                dataSource={dataSource}
                rowKey={item => item.channelName}
                columns={[
                    {
                        key: 'channelName',
                        dataIndex: 'channelName',
                        title: '名称',
                    },
                    {
                        key: 'validateUrl',
                        dataIndex: 'validateUrl',
                        title: '验证url'
                    },
                    {
                        key: 'size',
                        dataIndex: 'size',
                        title: '现有ip',
                    },
                    {
                        key: 'volume',
                        dataIndex: 'volume',
                        title: '容量',
                    },
                    {
                        key: 'maxRtt',
                        dataIndex: 'maxRtt',
                        title: '最大延迟',
                        render: (value) => `${value}ms`
                    },
                    {
                        key: 'itemLifeTime',
                        dataIndex: 'itemLifeTime',
                        title: 'ip最大生命期',
                        render: (value) => formatDuation(value),
                    },
                    {
                        key: 'itemBlockTime',
                        dataIndex: 'itemBlockTime',
                        title: 'ip屏蔽期限',
                        render: (value) => formatDuation(value),
                    },
                    {
                        key: 'detail',
                        title: '详情',
                        render: (_, item) => <Button onClick={_ => {
                            setModalType(ModalTypes.showChannelDetail)
                            setFocusItem(item)
                        }}>详情</Button>
                    },
                    {
                        key: 'action',
                        title: '操作',
                        render: (_, item) => {
                            return <div className={styles.actionArea}>
                                <FormOutlined onClick={_ => {
                                    setFocusItem(item)
                                    setModalType(ModalTypes.showEditOrCreateChannel)
                                }} />
                                {
                                    item.channelName !== defaultValueObj.DEFAULT_CHANNEL_NAME &&
                                    <DeleteOutlined onClick={_ => setDeleteData({ channelName: item.channelName })} />
                                }
                            </div>
                        }
                    }
                ]}
            />
        </Card>
    );
}


interface EditOrCreateChannelProps {
    item: IpPoolChannelDef;
    show: boolean;
    onClose: () => any;
    onRefresh: () => any;
}

const MillisecondToSecond = (time: number) => time ? Math.round(time / 1000) : time

const SecondToMillisocond = (time: number) => time ? time * 1000 : time

const EditChannel = React.memo<EditOrCreateChannelProps>((props) => {
    const { item: editItem, show, onClose, onRefresh } = props

    const isEditMode = !!editItem

    const [form] = Form.useForm()
    const [postData, setPostData] = useState(null as Partial<IpPoolChannelDef>)

    const { data: baseInfoRes } = useRequest('', {
        manual: true,
        cacheKey: 'baseinfo',
    })

    const { data: editChannelRes, loading: editChannelLoading, run: reqEditChannel } = useRequest({
        url: '/api/channel/edit',
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

    const { data: addChannelRes, loading: addChannelLoading, run: reqAddChannel } = useRequest({
        url: '/api/channel/add',
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
            isEditMode ? reqEditChannel() : reqAddChannel()
        }
    }, [postData])

    const defaultValueObj = baseInfoRes.defaultConfigs || {}
    useEffect(() => {
        if (!show) {
            const feildNameList: (keyof IpPoolChannelDef)[] = ['channelName', 'httpValidateUrl', 'validateUrl', 'volume', 'maxRtt', 'itemBlockTime', 'itemLifeTime']
            form.resetFields(feildNameList)
        } else {
            const initialValueObj = isEditMode ? {
                ...editItem,
            } : {
                    volume: defaultValueObj.CHANNEL_DEFAULT_VOLUME,
                    maxRtt: defaultValueObj.CHANNEL_DEFAULT_MAXRTT,
                    itemLifeTime: defaultValueObj.CHANNEL_DEFAULT_ITEM_LIFETIME,
                    itemBlockTime: defaultValueObj.CHANNEL_DEFAULT_ITEM_BLOCK_TIME,
                }
            initialValueObj.itemLifeTime = MillisecondToSecond(initialValueObj.itemLifeTime)
            initialValueObj.itemBlockTime = MillisecondToSecond(initialValueObj.itemBlockTime)
            const fieldValues = Object.entries(initialValueObj).reduce((obj, [feildName, value]) => {
                Reflect.set(obj, feildName, value)
                return obj
            }, {})
            form.setFieldsValue(fieldValues)
        }
    }, [show])

    const handleSubmitClick = () => {
        form.validateFields().
            then((feilds: Partial<IpPoolChannelDef>) => {
                setPostData({
                    ...feilds,
                    itemBlockTime: SecondToMillisocond(feilds.itemBlockTime),
                    itemLifeTime: SecondToMillisocond(feilds.itemLifeTime)
                })
            }).
            catch(e => {
                console.error(e)
            })
    }

    const layout = {
        labelCol: {
            span: 8,
        },
        wrapperCol: {
            span: 16,
        },
    };
    return <Modal title={isEditMode ? '编辑频道' : '创建频道'} visible={show} onCancel={onClose} onOk={handleSubmitClick}
        cancelText="关闭"
        okText="提交"
        okButtonProps={{
            loading: editChannelLoading || addChannelLoading
        }}
    >
        {
            show &&
            <Form
                {...layout}
                form={form}
            >
                <Form.Item
                    label="名称"
                    name="channelName"
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    {
                        isEditMode ? <div>{editItem.channelName}</div> : <Input />
                    }
                </Form.Item>
                {
                    isEditMode && <Form.Item
                        label="是否为默认频道"
                    >
                        <span>{editItem.channelName === defaultValueObj.DEFAULT_CHANNEL_NAME ? '是' : '否'}</span>
                    </Form.Item>
                }
                <Form.Item
                    label="ip连接验证地址"
                    name="validateUrl"
                    rules={[
                        {
                            required: true,
                            message: '请输入该频道ip池的容量值',
                        },
                    ]}
                >
                    <Input />
                </Form.Item>
                {
                    isEditMode && (editItem.channelName === defaultValueObj.DEFAULT_CHANNEL_NAME) && <Form.Item
                        label="http请求验证地址"
                        name="httpValidateUrl"
                        rules={[
                            {
                                required: true,
                                message: '请输入该频道ip池的容量值',
                            },
                        ]}
                    >
                        <Input />
                    </Form.Item>
                }
                <Form.Item
                    label="ip池容量"
                    name="volume"
                    rules={[
                        {
                            required: true,
                            message: '请输入该频道ip池的容量值',
                        },
                    ]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label="最大延迟"
                    name="maxRtt"
                    rules={[
                        {
                            required: true,
                            message: '请输入该频道ip池的最大延迟限制值',
                        },
                    ]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label="ip屏蔽时间"
                    name="itemBlockTime"
                    help="单位：秒"
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label="ip最大生命期"
                    name="itemLifeTime"
                    help="单位：秒"
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <InputNumber />
                </Form.Item>
            </Form>
        }
    </Modal>
})

const getDedetailRenderConfigs = (channel: ResListItem) => {
    if (!channel) {
        return []
    }
    const list = [
        {
            label: '名称',
            value: channel.channelName,
        },
        {
            label: '验证地址',
            value: channel.validateUrl,
        },
        {
            label: '容量',
            value: channel.volume
        },
        {
            label: '最大延迟',
            value: `${channel.maxRtt}ms`
        },
        {
            label: 'ip有效期',
            value: formatDuation(channel.itemLifeTime)
        },
        {
            label: 'ip屏蔽有效期',
            value: formatDuation(channel.itemBlockTime)
        },
        {
            label: 'ip来源排行(前5名)',
            value: channel.ruleIpCountInfoArr.length ? <Descriptions column={1} style={{ margin: 20 }}>
                {
                    channel.ruleIpCountInfoArr.slice(0, 5).map(item => <Descriptions.Item label={item.ruleName || '未命名'}>
                        {item.usedIpCount}
                    </Descriptions.Item>)
                }
            </Descriptions> : '暂无'
        }
    ]
    if (channel.isDefaultChannel) {
        list.splice(2, 0, {
            label: 'http验证地址',
            value: channel.httpValidateUrl,
        })
    }
    return list
}

const ChannelDetailModal = React.memo<{
    show: boolean;
    channel: ResListItem;
    onClose: () => any;
}>(props => {
    const { show, channel, onClose } = props

    const renderConfigs = getDedetailRenderConfigs(channel)

    return <Modal visible={show} title={`频道:${channel && channel.channelName}`}
        footer={<Button onClick={onClose}>关闭</Button>}
        onCancel={onClose}
    >
        <Descriptions column={1}>
            {
                renderConfigs.map(item => <Descriptions.Item key={item.label} label={item.label}>
                    {item.value}
                </Descriptions.Item>)
            }
        </Descriptions>
    </Modal>
})
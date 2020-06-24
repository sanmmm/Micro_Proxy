import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRequest } from 'umi'
import { Card, Row, Col, Avatar, Descriptions, message, Spin, Statistic, Modal, Button } from 'antd'
import JsonEditor, { JSONEditorOptions } from 'jsoneditor'
import 'jsoneditor/dist/jsoneditor.css'

import { JsonSchema } from '@/utils'
import styles from './index.less';

type ResListItem = IpPoolChannelDef & {
	size: number;
	ruleIpCountInfoArr: {
		ruleName: string;
		usedCount: number;
	}[]
}

type Res = {
	code: number;
	serverUrl: string;
	adminConfigs: {
		SHOW_EXAMPLE_PROXY_LIST_PAGE: boolean;
	},
	proxyPoolServerConfigs: {
		SERVER_MAX_VALIDATE_THREAD: number;
		SERVER_RUNNING: boolean;
	};
	validateTaskCount: number;
	ruleCount: number;
	channelsStatusInfo: {
		total: number;
		runningChannelCount: number;
		pausedChannelCount: number;
	}
	defaultChannelInfo: IpPoolChannelDef & {
		size: number;
	};
}



function getAdminConfigsJsonSchema() {
	const def: Record<keyof Res['adminConfigs'], any> = {
		SHOW_EXAMPLE_PROXY_LIST_PAGE: 'boolean',
	}
	return JsonSchema.getJsonSchema(def)
}

function getproxyPoolServerConfigsJsonSchema() {
	const def: Record<keyof Res['proxyPoolServerConfigs'], any> = {
		SERVER_RUNNING: 'boolean',
		SERVER_MAX_VALIDATE_THREAD: 'number',
	}
	return JsonSchema.getJsonSchema(def)
}

enum EditTypes {
	adminConfigs = 1,
	crwalServerConfig,
}

const editTypeConfig = {
	[EditTypes.adminConfigs]: {
		api: '/api/adminconfig/edit',
		label: 'admin'
	},
	[EditTypes.crwalServerConfig]: {
		api: '/api/proxypoolconfig/edit',
		label: '爬虫'
	},
}

export default () => {
	const [editType, setEditType] = useState(null as EditTypes)
	const [postData, setPostData] = useState(null as Partial<Res['adminConfigs'] & Res['proxyPoolServerConfigs']>)
	const jsonEditorNodeRef = useRef(null as HTMLDivElement)
	const jsonEditorRef = useRef(null as JsonEditor)

	const { data: info, loading: reqInfoLoading, run: reqInfo } = useRequest<any, any, Res>('/api/admin/info', {
		formatResult: (res) => res,
		onError: (e) => {
			message.error(e.message)
		}
	})

	const { loading: submitLoading, run: reqPostConfig } = useRequest<any, any, Res>({
		url: editTypeConfig[editType] && editTypeConfig[editType].api,
		method: 'POST',
		requestType: 'json',
		data: postData,
	}, {
		manual: true,
		formatResult: (res) => res,
		onSuccess: () => {
			message.success('提交成功')
			reqInfo()
		},
		onError: (e) => {
			message.error(e.message)
			reqInfo()
		}
	})

	useEffect(() => {
		if (postData) {
			reqPostConfig()
		}
	}, [postData])

	const showEditModal = !!info && !!editType

	useEffect(() => {
		if (showEditModal) {
			if (!jsonEditorRef.current) {
				jsonEditorRef.current = new JsonEditor(jsonEditorNodeRef.current, {
					statusBar: false,
					sortObjectKeys: false,
					enableSort: false,
					enableTransform: false,
					search: false,
					mode: 'code',
				})
			}
			let jsonValidateSchema = null, initData = null, allFeildNames: string[] = []
			if (editType === EditTypes.adminConfigs) {
				const res = getAdminConfigsJsonSchema()
				jsonValidateSchema = res.jsonSchema
				allFeildNames = Object.keys(res.info)
				initData = {
					...info.adminConfigs
				}
			}
			if (editType === EditTypes.crwalServerConfig) {
				const res = getproxyPoolServerConfigsJsonSchema()
				jsonValidateSchema = res.jsonSchema
				allFeildNames = Object.keys(res.info)
				initData = {
					...info.proxyPoolServerConfigs
				}
			}
			const defaultInitData = allFeildNames.reduce((obj, feidName) => {
				obj[feidName] = null
				return obj
			}, {})
			jsonEditorRef.current.setSchema(jsonValidateSchema)
			jsonEditorRef.current.set({
				...defaultInitData,
				...initData
			})
		}
	}, [showEditModal])

	const statusConfigArr = useMemo(() => {
		if (!info) {
			return []
		} else {
			const { defaultChannelInfo, channelsStatusInfo, ruleCount, validateTaskCount, proxyPoolServerConfigs } = info
			return [
				{
					title: '服务状态',
					value: proxyPoolServerConfigs.SERVER_RUNNING ? '运行中' : '已暂停'
				},
				{
					title: '主频道ip数',
					value: defaultChannelInfo.size
				},
				{
					title: '主频道最小容量',
					value: defaultChannelInfo.volume
				},
				{
					title: '频道状态',
					value: channelsStatusInfo.runningChannelCount,
					suffix: `/${channelsStatusInfo.total} 运行中`
				},
				{
					title: '规则数量',
					value: ruleCount,
				},
				{
					title: '待处理验证任务',
					value: validateTaskCount,
				}
			]
		}
	}, [info])

	const handleEditModalClose = useCallback(() => {
		setEditType(null)
	}, [])

	const handleSubmit = () => {
		let jsonData
		try {
			jsonData = jsonEditorRef.current.get()
		} catch (e) {
			message.error('字段错误')
		}
		setPostData(jsonData)
	}

	return (
		<Spin spinning={reqInfoLoading}>
			<Modal visible={showEditModal} onCancel={handleEditModalClose}
				title={`${editTypeConfig[editType] && editTypeConfig[editType].label}配置`}
				okText="提交"
				cancelText="关闭"
				okButtonProps={{
					loading: submitLoading,
					onClick: handleSubmit
				}}
				forceRender
			>
				<div ref={jsonEditorNodeRef}></div>
			</Modal>
			<div style={{ minHeight: '100vh' }}>
				{
					info && <React.Fragment>
						<Row gutter={20} >
							<Col xs={24} md={6}>
								<Card title="基本信息">
									<Descriptions>
										<Descriptions.Item label="角色">
											管理员
								</Descriptions.Item>
										<Descriptions.Item label="地址">
											{info.serverUrl}
										</Descriptions.Item>
									</Descriptions>
								</Card>
							</Col>
							<Col xs={24} md={18}>
								<Card title="服务状态">
									<Row gutter={20} justify="space-around">
										{
											statusConfigArr.map(item => {
												return <Col key={item.title}>
													<Statistic {...item} />
												</Col>
											})
										}
									</Row>
								</Card>
							</Col>
						</Row>
						<Row gutter={20} style={{ marginTop: 16 }}>
							<Col xs={24} md={12}>
								<Card title="admin配置" extra={<Button onClick={_ => setEditType(EditTypes.adminConfigs)}>编辑</Button>}>
									<Descriptions>
										<Descriptions.Item label="开启代理ip展示页">
											{info.adminConfigs.SHOW_EXAMPLE_PROXY_LIST_PAGE ? '是' : '否'}
										</Descriptions.Item>
									</Descriptions>
								</Card>
							</Col>
							<Col xs={24} md={12}>
								<Card title="代理池配置" extra={<Button onClick={_ => setEditType(EditTypes.crwalServerConfig)}>编辑</Button>}>
									<Descriptions>
										<Descriptions.Item label="状态">
											{
												info.proxyPoolServerConfigs.SERVER_RUNNING ? '运行中' : '已暂停'
											}
										</Descriptions.Item>
										<Descriptions.Item label="最大并发验证请求数">
											{
												info.proxyPoolServerConfigs.SERVER_MAX_VALIDATE_THREAD
											}
										</Descriptions.Item>
									</Descriptions>
								</Card>
							</Col>
						</Row>
					</React.Fragment>
				}
			</div>
		</Spin>
	);
}

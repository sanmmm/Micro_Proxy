import React, { useState, useEffect } from 'react';
import { useRequest, history } from 'umi';
import { Form, Input, Card, message, Row, Col, Button } from 'antd';

import styles from './index.less';

export default (props) => {

    const { data, error, loading } = useRequest('/api/baseinfo', {
        formatResult: (res) => res,
        cacheKey: 'baseinfo',
        onSuccess: (data) => {
            if (data && data.isLogined) {
                history.push('/')
            }
        }
    })

    const [loginData, setLoginData] = useState(null as {
        userName: string;
        password: string;
    })
    const [form] = Form.useForm()
    const { run: reqlogin } = useRequest({
        url: '/api/login',
        method: 'post',
        data: loginData
    }, {
        manual: true,
        onSuccess: () => {
            message.success('登录成功')
            history.push('/')
        },
        onError: (e) => {
            message.error(e.message)
        }
    })

    useEffect(() => {
        if (loginData) {
            reqlogin()
        }
    }, [loginData])

    const layout = {
        labelCol: {
            span: 4,
        },
        wrapperCol: {
            span: 20,
        },
    };
    return (
        <div className={styles.loginBox}>
            <Row justify="center" align="middle" className={styles.row}>
                <Col xs={24} md={6}>
                    <Card title="登录" >
                        <Form form={form} {...layout}>
                            <Form.Item label="用户名" name="userName">
                                <Input placeholder="用户名" />
                            </Form.Item>
                            <Form.Item label="密码" name="password">
                                <Input.Password placeholder="密码" />
                            </Form.Item>
                            <Form.Item
                                wrapperCol={{ span: 4, offset: 10 }}
                            >
                                <Button type="primary" onClick={_ => {
                                    const data = form.getFieldsValue()
                                    setLoginData(data as any)
                                }}>登录</Button>
                            </Form.Item>
                        </Form>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}

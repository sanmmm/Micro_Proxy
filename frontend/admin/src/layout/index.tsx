import React, { useCallback, useEffect } from 'react';
import { useRequest, IRoute, history } from 'umi'
import { Menu, Layout, Spin, message } from 'antd';
import path from 'path'

import {ApiResCode} from '@root/type_enums'
import style from './styles.less'

const { Header, Sider, Content } = Layout

export default (props) => {
  const { data, error, loading } = useRequest('/api/baseinfo', {
    formatResult: (res) => res,
    cacheKey: 'baseinfo',
    onError: (e) => {
      console.error(e)
      const res = (e as any).data
      if (res && !res.isLogined) {
        history.push('/login')
      }
    },
  })

  const {run: reqLogout} = useRequest({
    url: '/api/logout',
    method: 'post',
  }, {
    manual: true,
    onSuccess: () => {
      message.success('请求成功')
      history.push('/login')
    },
    onError: (e) => {
      message.error('请求失败')
    },
  })
  
  const isRootPath = props.location.pathname === '/'
  useEffect(() => {
    if (isRootPath) {
      history.push('/index')
    }
  }, [isRootPath])


  let defaultSelectKey = ''
  const renderMenuItems = (arr: IRoute[], prefix = '/') => {
    return arr.map(obj => {
      const isLeafNode = !obj.routes
      const nowPath = path.join(prefix, obj.path);
      if (isLeafNode) {
        if (!defaultSelectKey) {
          defaultSelectKey = nowPath
        }
        return <Menu.Item key={nowPath}>
          {obj.title}
        </Menu.Item>
      }
      return <Menu.SubMenu key={nowPath} title={obj.title}>
          {renderMenuItems(obj.routes, nowPath)}
      </Menu.SubMenu>
    })

}

const showContent = !(loading || error)

const handleMenuClick = useCallback((item) => {
  const path = item.key
  history.push(path)
}, [])

return (
  <Layout className={style.layoutBase}>
    <Header className={style.header}>
      <h3 className={style.logo}>Micro Proxy Admin</h3> 
      <div onClick={reqLogout} className={style.logout}>退出登录</div>     
    </Header>
    <Spin spinning={!showContent}>
      <Layout className={style.layoutBase}>
        <Sider className={style.layoutBase}>
          <Menu mode="inline" onClick={handleMenuClick}
            selectedKeys={props.location.pathname }
            defaultSelectedKeys={[defaultSelectKey]}
          >
            {
              renderMenuItems(props.routes[1].routes)
            }
          </Menu>
        </Sider>
        <Content className={style.content}>
          <div>
            {showContent && props.children}
          </div>
        </Content>
      </Layout>
    </Spin>
  </Layout>
);
}

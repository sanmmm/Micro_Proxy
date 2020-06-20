import React, { useCallback } from 'react';
import { useRequest, IRoute, history } from 'umi'
import { Menu, Layout } from 'antd'
import path from 'path'

import style from './styles.less'

const { Header, Sider, Content } = Layout

export default (props) => {
  const { data, error, loading } = useRequest('/api/baseinfo', {
    formatResult: (res) => res,
    cacheKey: 'baseinfo',
  })

  let defaultSelectKey = ''
  const renderMenuItems = (arr: IRoute[], prefix = '/') => {
    return arr.map(obj => {
      const isLeafNode = !obj.routes
      const nowPath = path.join(prefix, obj.path);
      if (isLeafNode) {
        if (!defaultSelectKey) {
          console.log(nowPath)
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

console.log(props.routes, defaultSelectKey)
return (
  <Layout className={style.layoutBase}>
    <Header className={style.header}>
      <h3 className={style.logo}>Micro Proxy Admin</h3>      
    </Header>
    <Layout className={style.layoutBase}>
      <Sider className={style.layoutBase}>
        <Menu mode="inline" onClick={handleMenuClick}
          defaultSelectedKeys={[defaultSelectKey]}
        >
          {
            renderMenuItems(props.routes[0].routes)
          }
        </Menu>
      </Sider>
      <Content className={style.content}>
        <div>
          {showContent && props.children}
        </div>
      </Content>
    </Layout>
  </Layout>
);
}

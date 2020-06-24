import { defineConfig } from 'umi';

const isProduction = process.env.NODE_ENV === 'production'
export default defineConfig({
  nodeModulesTransform: {
    type: 'none',
  },
  routes: [
    {
      path: '/login',
      component: '@/pages/login',
      title: '登录'
    },
    {
      path: '/',
      component: '@/layout/index',
      title: '管理',
      routes: [
        { path: '/index', component: '@/pages/index', title: "首页" },
        {
          path: '/channels', component: '@/pages/channels', title: '频道'
        },
        {
          path: '/rules', component: '@/pages/getIpRules', title: '规则'
        },
      ],
    },
   
  ],
  alias: {
    '@root': __dirname
  },
  proxy: isProduction ? {} : {
    '/api': {
      'target': 'http://localhost:3003',
      'changeOrigin': true,
    },
  },
});

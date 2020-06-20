import { defineConfig } from 'umi';

export default defineConfig({
  nodeModulesTransform: {
    type: 'none',
  },
  routes: [{
    path: '/',
    component: '@/layout/index',
    title: '管理',
    routes: [
      { path: '/', component: '@/pages/index', title: "首页" },
      {
        path: '/channels', component: '@/pages/channels', title: '频道'
      },
      {
        path: '/rules', component: '@/pages/getIpRules', title: '规则'
      },
    ]
  },
  ],
  proxy: {
    '/api': {
      'target': 'http://localhost:3003',
      'changeOrigin': true,
    },
  },
});

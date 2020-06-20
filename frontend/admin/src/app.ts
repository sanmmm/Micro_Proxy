import { RequestConfig, ErrorShowType } from 'umi';

export const request: RequestConfig = {
  timeout: 5000,
  errorConfig: {
    adaptor: (res) => {
      return {
        ...res,
        success: res.code === 0,
        errorMessage: res.msg,
        showType: ErrorShowType.SILENT,
      }
    }
  },
  middlewares: [],
  requestInterceptors: [],
  responseInterceptors: [],
};
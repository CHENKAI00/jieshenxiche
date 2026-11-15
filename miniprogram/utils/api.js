/** 网络层：统一带 x-token、统一错误提示、统一 loading */
function base() {
  const app = getApp();
  return ((app && app.globalData.baseUrl) || 'http://127.0.0.1:8099').replace(/\/+$/, '');
}

function token() {
  const app = getApp();
  return (app && app.globalData.token) || '';
}

function openid() {
  const app = getApp();
  return (app && app.globalData.openid) || '';
}

function handle(status, data) {
  if (status === 401) {
    wx.showModal({
      title: '需要员工口令',
      content: '请到「我的」页填写门店员工口令后再操作',
      confirmText: '去设置',
      success: (res) => { if (res.confirm) wx.switchTab({ url: '/pages/mine/mine' }); },
    });
    return Promise.reject(new Error('NO_AUTH'));
  }
  if (data && data.ok === false) {
    wx.showToast({ title: data.msg || '操作失败', icon: 'none' });
    return Promise.reject(new Error(data.msg || 'FAIL'));
  }
  return Promise.resolve(data);
}

function request(path, { method = 'GET', data = {}, loading = false, tip = '处理中' } = {}) {
  if (loading) wx.showLoading({ title: tip, mask: true });
  return new Promise((resolve, reject) => {
    wx.request({
      url: base() + path,
      method,
      data,
      timeout: 20000,
      header: { 'content-type': 'application/json', 'x-token': token(), 'x-openid': openid() },
      success: (res) => {
        if (loading) wx.hideLoading();
        handle(res.statusCode, res.data).then(resolve).catch(reject);
      },
      fail: (err) => {
        if (loading) wx.hideLoading();
        wx.showModal({
          title: '连不上服务',
          content: `请确认后端已启动、且「我的」页地址正确：\n${base()}\n\n${err.errMsg || ''}`,
          showCancel: false,
        });
        reject(err);
      },
    });
  });
}

/** 上传图片做车牌识别（wx.uploadFile） */
function uploadPlate(filePath) {
  wx.showLoading({ title: '识别车牌中', mask: true });
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: base() + '/api/v1/ocr/plate',
      filePath,
      name: 'file',
      timeout: 30000,
      header: { 'x-token': token(), 'x-openid': openid() },
      success: (res) => {
        wx.hideLoading();
        let data = {};
        try { data = JSON.parse(res.data); } catch (e) { data = { ok: false, msg: '返回格式错误' }; }
        handle(res.statusCode, data).then(resolve).catch(reject);
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        reject(err);
      },
    });
  });
}

/** 把后端返回的相对图片地址拼成完整地址（小程序 image 组件需要绝对 URL） */
function absUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//.test(p)) return p;
  return base() + (p.startsWith('/') ? p : '/' + p);
}

module.exports = {
  base,
  token,
  request,
  absUrl,
  catalog: () => request('/api/v1/catalog'),
  // ===== 车主端 =====
  customerLogin: (code) => request('/api/v1/customer/login', { method: 'POST', data: { code } }),
  customerMe: () => request('/api/v1/customer/me'),
  customerBind: (payload) => request('/api/v1/customer/bind', { method: 'POST', data: payload, loading: true, tip: '绑定中' }),
  customerUnbind: () => request('/api/v1/customer/unbind', { method: 'POST', loading: true, tip: '解绑中' }),
  customerServices: () => request('/api/v1/customer/services'),
  uploadPlate,
  // ===== 业务接口 =====
  meta: () => request('/api/v1/ocr/meta'),
  lookup: (plate) => request(`/api/v1/member/${encodeURIComponent(plate)}`),
  listMembers: (kw, page = 1, size = 20) =>
    request(`/api/v1/member?keyword=${encodeURIComponent(kw || '')}&page=${page}&size=${size}`),
  createMember: (payload) => request('/api/v1/member', { method: 'POST', data: payload, loading: true, tip: '建档中' }),
  consume: (payload) => request('/api/v1/wash/consume', { method: 'POST', data: payload, loading: true, tip: '核销中' }),
  recharge: (payload) => request('/api/v1/wash/recharge', { method: 'POST', data: payload, loading: true, tip: '充值中' }),
  overview: () => request('/api/v1/stats/overview'),
  health: () => new Promise((resolve) => {
    wx.request({
      url: base() + '/health',
      method: 'GET',
      timeout: 8000,
      success: (r) => resolve(r.data || {}),
      fail: () => resolve({ ok: false, db: 'down' }),
    });
  }),
  recent: (limit = 10) => request(`/api/v1/stats/recent?limit=${limit}`),
};

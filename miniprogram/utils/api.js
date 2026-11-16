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

let authTipAt = 0;

function handle(status, data) {
  if (status === 401) {
    // 10 秒内只提示一次，避免连环弹窗
    if (Date.now() - authTipAt < 10000) return Promise.reject(new Error('NO_AUTH'));
    authTipAt = Date.now();
    wx.showModal({
      title: '口令未通过',
      content: '当前口令被服务器拒绝。打开「我的 → 开发者设置」重新保存（服务器口令需与之一致）。',
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
        const msg = (err && err.errMsg) || '';
        let hint = '请确认服务器上的 Node 服务在运行（bash deploy/manage.sh status）';
        if (/domain list/i.test(msg)) hint = '开发者工具「详情 → 本地设置」要勾选「不校验合法域名」';
        else if (/timeout/i.test(msg)) hint = '请求超时：服务器可能卡住或网络很慢，稍后重试';
        else if (/refused/i.test(msg)) hint = '端口被拒绝：服务没启动，或被防火墙拦了';
        else if (/^http:\/\//.test(base())) {
          hint = '体验版/正式版只允许 https 域名；现在是 http，只能在开发者工具或「真机调试」里访问。';
        }
        wx.showModal({
          title: '连不上服务器',
          content: `地址：${base()}\n\n${hint}\n\n${msg}`,
          showCancel: false,
        });
        reject(err);
      },
    });
  });
}

/** 读本地图片为 base64（车主端识别用） */
function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(r.data),
      fail: reject,
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
  /** 校验员工口令（独立请求，不触发全局 401 弹窗） */
  adminLogin: (password) => new Promise((resolve, reject) => {
    wx.request({
      url: base() + '/api/v1/admin/login',
      method: 'POST',
      timeout: 12000,
      header: { 'content-type': 'application/json' },
      data: { password },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.ok) resolve(res.data);
        else if (res.statusCode === 404) reject(new Error('服务器版本较旧，缺少登录接口'));
        else reject(new Error((res.data && res.data.msg) || '口令不正确'));
      },
      fail: () => reject(new Error('连不上服务器')),
    });
  }),

  // ===== 车主端 =====
  customerLogin: (code) => request('/api/v1/customer/login', { method: 'POST', data: { code } }),
  staffLogin: (password) => request('/api/v1/customer/staff-login', { method: 'POST', data: { password }, loading: true, tip: '登录中' }),
  customerMe: () => request('/api/v1/customer/me'),
  customerBind: (payload) => request('/api/v1/customer/bind', { method: 'POST', data: payload, loading: true, tip: '绑定中' }),
  customerUnbind: () => request('/api/v1/customer/unbind', { method: 'POST', loading: true, tip: '解绑中' }),
  customerServices: () => request('/api/v1/customer/services'),
  /** 车主端识别车牌：单张图片路径 → 车牌与候选 */
  customerOcr: async (filePath) => {
    const images = [await readBase64(filePath)];
    return request('/api/v1/customer/ocr', { method: 'POST', data: { images }, loading: true, tip: '识别车牌' });
  },
  // ===== 预约 =====
  bookingSlots: (date) => request(`/api/v1/customer/slots?date=${encodeURIComponent(date || '')}`),
  createBooking: (payload) => request('/api/v1/customer/bookings', { method: 'POST', data: payload, loading: true, tip: '提交预约' }),
  myBookings: () => request('/api/v1/customer/bookings'),
  cancelBooking: (id) => request(`/api/v1/customer/bookings/${id}/cancel`, { method: 'POST', loading: true, tip: '取消中' }),
  // ===== 门店端预约 =====
  staffBookings: (date) => request(`/api/v1/staff/bookings?date=${encodeURIComponent(date || '')}`),
  staffBookingStatus: (id, status) => request(`/api/v1/staff/bookings/${id}/status`, { method: 'POST', data: { status }, loading: true }),
  staffBookingFinish: (id, useCount) => request(`/api/v1/staff/bookings/${id}/finish`, { method: 'POST', data: { useCount }, loading: true, tip: '核销中' }),
  uploadPlate,
  // ===== 业务接口 =====
  meta: () => request('/api/v1/ocr/meta'),
  lookup: (plate) => request(`/api/v1/member/${encodeURIComponent(plate)}`),
  listMembers: (kw, page = 1, size = 20) =>
    request(`/api/v1/member?keyword=${encodeURIComponent(kw || '')}&page=${page}&size=${size}`),
  createMember: (payload) => request('/api/v1/member', { method: 'POST', data: payload, loading: true, tip: '建档中' }),
  updateMember: (plate, payload) => request(`/api/v1/member/${encodeURIComponent(plate)}`, { method: 'PATCH', data: payload, loading: true, tip: '保存中' }),
  consume: (payload) => request('/api/v1/wash/consume', { method: 'POST', data: payload, loading: true, tip: '核销中' }),
  recharge: (payload) => request('/api/v1/wash/recharge', { method: 'POST', data: payload, loading: true, tip: '充值中' }),
  overview: () => request('/api/v1/stats/overview'),
  health: () => new Promise((resolve) => {
    wx.request({
      url: base() + '/health',
      method: 'GET',
      timeout: 8000,
      success: (r) => resolve(r.data || {}),
      fail: (err) => resolve({ ok: false, db: 'down', errMsg: (err && err.errMsg) || '网络失败' }),
    });
  }),
  recent: (limit = 10) => request(`/api/v1/stats/recent?limit=${limit}`),
};

const api = require('../../utils/api');

Page({
  data: {},

  onLoad(options) {
    const app = getApp();
    // 已选过身份就直接进对应首页（?switch=1 表示主动来切身份，不自动跳）
    if (options && options.switch === '1') return;
    const role = wx.getStorageSync('role');
    if (role === 'customer') wx.reLaunch({ url: '/pages/customer/home/home' });
    else if (role === 'staff') wx.switchTab({ url: '/pages/index/index' });
  },

  async onPhoneLogin(e) {
    const detail = e.detail || {};
    if (!detail.code) {
      wx.showModal({
        title: '没拿到手机号授权',
        content: '可以点下方卡片手动选择身份；正式环境请在微信后台开通「手机号快速验证」并用已认证小程序。',
        showCancel: false,
      });
      return;
    }
    try {
      const app = getApp();
      await app.ensureCustomerLogin();          // 先拿 openid
      const r = await api.phoneLogin({           // 再用手机号 code 判身份
        code: detail.code,
        openid: app.globalData.openid,
      });

      if (r.role === 'staff') {
        app.setToken(r.token);
        app.setRole('staff');
        wx.showToast({ title: '门店端已登录', icon: 'success' });
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 500);
        return;
      }

      app.setRole('customer');
      app.globalData.customerBound = !!r.bound;
      if (!r.bound && r.reason) wx.showToast({ title: r.reason, icon: 'none', duration: 2500 });
      setTimeout(() => wx.reLaunch({ url: '/pages/customer/home/home' }), 600);
    } catch (err) {
      wx.showModal({
        title: '手机号登录失败',
        content: (err && err.message) || '请检查后端是否配置 WX_APPID / WX_SECRET',
        showCancel: false,
      });
    }
  },

  asCustomer() {
    const app = getApp();
    app.setRole('customer');
    wx.reLaunch({ url: '/pages/customer/home/home' });
  },

  asStaff() {
    const app = getApp();
    app.setRole('staff');
    wx.switchTab({ url: '/pages/index/index' });
  },
});

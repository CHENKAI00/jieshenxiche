const api = require('../../utils/api');

Page({
  onLoad(options) {
    // ?switch=1 表示主动来换身份，不自动跳
    if (options && options.switch === '1') return;
    const role = wx.getStorageSync('role');
    if (role === 'customer') wx.reLaunch({ url: '/pages/customer/home/home' });
    else if (role === 'staff') wx.switchTab({ url: '/pages/index/index' });
  },

  /** 车主：只走 wx.login（免费），拿 openid 后进车主端 */
  async customerLogin() {
    const app = getApp();
    try {
      // 每次点都用最新 openid 判断身份（老板微信在 BOSS_OPENID 白名单里会自动进门店端）
      const out = await new Promise((resolve, reject) => {
        wx.login({
          success: async (res) => {
            try {
              const r = await api.customerLogin(res.code);
              app.setOpenid(r.openid);
              resolve(r);
            } catch (e) { reject(e); }
          },
          fail: reject,
        });
      });
      if (out.role === 'staff' && out.token) {
        app.setToken(out.token);
        app.setRole('staff');
        wx.showToast({ title: '门店端已登录', icon: 'success' });
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 500);
        return;
      }
      app.setRole('customer');
      wx.reLaunch({ url: '/pages/customer/home/home' });
    } catch (e) {
      wx.showModal({
        title: '登录失败',
        content: '请检查「服务地址」是否正确、后端是否已启动。',
        showCancel: false,
      });
    }
  },

  /** 老板/员工：输门店口令，不依赖手机号、不调收费接口 */
  staffLogin() {
    wx.showModal({
      title: '员工登录',
      editable: true,
      placeholderText: '输入门店员工口令（ADMIN_TOKEN）',
      success: async (r) => {
        if (!r.confirm) return;
        const pwd = String(r.content || '').trim();
        if (!pwd) return wx.showToast({ title: '请输入口令', icon: 'none' });
        try {
          const out = await api.staffLogin(pwd);
          const app = getApp();
          app.setToken(out.token);
          app.setRole('staff');
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 500);
        } catch (e) { /* api 层已提示口令不正确 */ }
      },
    });
  },
});

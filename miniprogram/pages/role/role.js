const api = require('../../utils/api');

Page({
  data: { serverHost: '' },

  onLoad(options) {
    const app = getApp();
    this.setData({ serverHost: (app.globalData.baseUrl || '').replace(/^https?:\/\//, '') });
    // 体验版/正式版不允许 http，直接在首页提示去改地址
    try {
      const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
      const env = info && info.miniProgram && info.miniProgram.envVersion;
      if (env && env !== 'develop' && /^http:\/\//.test(app.globalData.baseUrl || '')) {
        wx.showModal({
          title: '需要 https 域名',
          content: '体验版/正式版不能用 http 地址。\n请点页面底部「服务器」填云托管的 https 域名（xxx.run.tcloudbase.com）。',
          showCancel: false,
        });
      }
    } catch (e) { /* 低版本基础库忽略 */ }
    // ?switch=1 表示主动来换身份，不自动跳
    if (options && options.switch === '1') return;
    const role = wx.getStorageSync('role');
    if (role === 'customer') wx.reLaunch({ url: '/pages/customer/home/home' });
    else if (role === 'staff') wx.switchTab({ url: '/pages/index/index' });
  },

  /** 服务器设置：现场改地址 + 测连通（排查「连不上服务器」用） */
  openServer() {
    const app = getApp();
    wx.showModal({
      title: '服务器地址',
      editable: true,
      content: '',
      placeholderText: app.globalData.baseUrl,
      success: async (r) => {
        if (!r.confirm) return;
        const url = (String(r.content || '').trim() || app.globalData.baseUrl).replace(/\/+$/, '');
        if (!/^https?:\/\//.test(url)) return wx.showToast({ title: '要带 http:// 或 https://', icon: 'none' });
        app.setBaseUrl(url);
        this.setData({ serverHost: url.replace(/^https?:\/\//, '') });
        wx.showLoading({ title: '测试连接', mask: true });
        const h = await require('../../utils/api').health();
        wx.hideLoading();
        wx.showModal({
          title: h.ok ? '连接正常' : '连不上',
          content: [
            `地址：${url}`,
            `服务：${h.ok ? '在线' : '不可达'}`,
            `数据库：${h.db || '未知'}`,
            `识别：${h.ocr || '未知'}`,
            h.ok ? '' : '\n体验版/正式版必须是 https 域名，且加到「request 合法域名」。',
          ].filter(Boolean).join('\n'),
          showCancel: false,
        });
      },
    });
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

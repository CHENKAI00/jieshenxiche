const api = require('../../utils/api');
const { guardStaff } = require('../../utils/role');

Page({
  data: {
    baseUrl: '',
    token: '',
    staffName: '',
    staffInitial: '前',
    showToken: false,
    health: { db: '—', ocr: '—' },
    openid: '',
    showDev: false,
  },

  onShow() {
    if (!guardStaff()) return;
    const app = getApp();
    this.setData({
      baseUrl: app.globalData.baseUrl,
      token: app.globalData.token,
      staffName: app.globalData.staffName,
      staffInitial: (app.globalData.staffName || '前').slice(0, 1),
    });
    this.test();
  },

  async test() {
    const h = await api.health();
    this.setData({ health: { db: h.db || 'down', ocr: h.ocr || '—' } });
  },

  toggleDev() { this.setData({ showDev: !this.data.showDev }); },

  onBase(e) { this.setData({ baseUrl: e.detail.value }); },
  onToken(e) { this.setData({ token: e.detail.value }); },
  onStaff(e) { this.setData({ staffName: e.detail.value, staffInitial: (e.detail.value || '前').slice(0, 1) }); },
  toggleToken() { this.setData({ showToken: !this.data.showToken }); },

  async copyOpenid() {
    const app = getApp();
    try {
      if (!app.globalData.openid) await app.ensureCustomerLogin();
      const openid = app.globalData.openid || '';
      this.setData({ openid });
      wx.setClipboardData({ data: openid });
    } catch (e) {
      wx.showToast({ title: '获取失败，检查服务地址', icon: 'none' });
    }
  },

  async save() {
    const app = getApp();
    const pwd = String(this.data.token || '').trim();
    const baseUrl = String(this.data.baseUrl || '').trim();
    if (!pwd) return wx.showToast({ title: '请填写员工口令', icon: 'none' });

    // 先落地址，再拿这个地址去校验口令，校验通过才算保存成功
    app.setBaseUrl(baseUrl);
    wx.showLoading({ title: '验证口令', mask: true });
    try {
      await api.adminLogin(pwd);
      app.setToken(pwd);
      app.setStaffName(this.data.staffName || '前台');
      wx.hideLoading();
      wx.showToast({ title: '已保存并通过验证', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showModal({
        title: '口令没通过',
        content: `${e.message || '口令不正确'}\n\n服务器：${baseUrl}\n如果服务器还没更新，口令仍是旧值，请在服务器 .env 里改成 ${pwd} 后重启。`,
        showCancel: false,
      });
      return;
    }
    await this.test();
    if (this.data.health.db !== 'up') {
      wx.showModal({
        title: '数据库未连通',
        content: '地址和口令都通了，但数据库没连上，检查服务器 .env 的数据库账号。',
        showCancel: false,
      });
    }
  },

  openMembers() { wx.navigateTo({ url: '/pages/records/records?mode=members' }); },

  goCustomer() {
    wx.showModal({
      title: '切换身份',
      content: '切换到车主端后，看的是车主自己的会员卡；随时可以切回来。',
      confirmText: '切换',
      success: (r) => {
        if (!r.confirm) return;
        getApp().setRole('customer');
        wx.reLaunch({ url: '/pages/customer/home/home' });
      },
    });
  },

  async showPrice() {
    try {
      const meta = await api.meta();
      wx.showModal({
        title: '洗车价目表',
        content: (meta.services || []).map((i) => `${i.name}  ¥${i.price} / 约${i.mins}分钟`).join('\n'),
        showCancel: false,
      });
    } catch (e) {}
  },

  async diagnose() {
    const app = getApp();
    const base = app.globalData.baseUrl;
    const pwd = String(this.data.token || '').trim();
    wx.showLoading({ title: '诊断中', mask: true });
    const health = await api.health();
    let auth = '未校验';
    try {
      await api.adminLogin(pwd);
      auth = '口令正确';
    } catch (e) {
      auth = `口令不通过（${e.message || '未知'}）`;
    }
    wx.hideLoading();
    wx.showModal({
      title: '连接诊断',
      content: [
        `地址：${base}`,
        `服务：${health.ok ? '在线' : '不可达'}`,
        `版本：${health.version || '较旧（无版本号，功能可用）'}`,
        `数据库：${health.db || '未知'}`,
        `识别引擎：${health.ocr || '未知'}`,
        `员工口令：${auth}`,
      ].join('\n'),
      showCancel: false,
    });
  },

  showAbout() {
    wx.showModal({
      title: '关于',
      content: '洁神洗车门店小程序 v2.0.0\n特色：拍照识别车牌秒查会员\n服务：洗车 / 打蜡 / 抛光 / 内饰 / 镀膜\n数据：MySQL 单表会员系统（精简版）\n后端：Node.js + Express',
      showCancel: false,
    });
  },
});

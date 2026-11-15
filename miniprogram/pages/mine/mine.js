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

  onBase(e) { this.setData({ baseUrl: e.detail.value }); },
  onToken(e) { this.setData({ token: e.detail.value }); },
  onStaff(e) { this.setData({ staffName: e.detail.value, staffInitial: (e.detail.value || '前').slice(0, 1) }); },
  toggleToken() { this.setData({ showToken: !this.data.showToken }); },

  async save() {
    const app = getApp();
    app.setBaseUrl(this.data.baseUrl);
    app.setToken(this.data.token);
    app.setStaffName(this.data.staffName || '前台');
    wx.showToast({ title: '已保存', icon: 'success' });
    await this.test();
    if (this.data.health.db !== 'up') {
      wx.showModal({
        title: '数据库未连通',
        content: '请检查后端 npm start 是否运行、.env 数据库账号是否正确。',
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

  showAbout() {
    wx.showModal({
      title: '关于',
      content: '洁神洗车门店小程序 v2.0.0\n特色：拍照识别车牌秒查会员\n服务：洗车 / 打蜡 / 抛光 / 内饰 / 镀膜\n数据：MySQL 单表会员系统（精简版）\n后端：Node.js + Express',
      showCancel: false,
    });
  },
});

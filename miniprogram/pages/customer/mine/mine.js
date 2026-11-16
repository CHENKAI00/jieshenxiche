const api = require('../../../utils/api');
const { guardCustomer } = require('../../../utils/role');

Page({
  data: { bound: false, member: {}, initial: '车' },

  onShow() {
    if (!guardCustomer()) return;
    this.load();
  },

  async load() {
    try {
      const app = getApp();
      await app.ensureCustomerLogin();
      const d = await api.customerMe();
      const m = d.member || {};
      this.setData({
        bound: !!d.bound,
        member: m,
        initial: m.nickname ? m.nickname.slice(0, 1) : '车',
      });
    } catch (e) {}
  },

  goHome() {
    wx.reLaunch({ url: '/pages/customer/home/home' });
  },

  goOrders() { wx.reLaunch({ url: '/pages/customer/orders/orders' }); },

  goBind() {
    wx.navigateTo({ url: '/pages/customer/bind/bind' });
  },

  unbind() {
    wx.showModal({
      title: '解绑确认',
      content: '解绑后将看不到这辆车的余额和次数，随时可以用车牌重新绑定。',
      confirmText: '解绑',
      confirmColor: '#d9463a',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.customerUnbind();
          wx.showToast({ title: '已解绑', icon: 'success' });
          this.setData({ bound: false, member: {} });
        } catch (e) {}
      },
    });
  },

  callStore() {
    const phone = getApp().globalData.storePhone;
    if (!phone) {
      return wx.showModal({
        title: '联系门店',
        content: '门店电话还没配置。让管理员在小程序 app.js 的 storePhone 里填上号码即可。',
        showCancel: false,
      });
    }
    wx.makePhoneCall({ phoneNumber: String(phone) });
  },

  switchRole() {
    wx.showModal({
      title: '切换身份',
      content: '切换到门店员工端需要员工口令（在员工端「我的」里配置）。',
      confirmText: '切换',
      success: (r) => {
        if (!r.confirm) return;
        getApp().setRole('staff');
        wx.switchTab({ url: '/pages/index/index' });
      },
    });
  },

  about() {
    wx.showModal({
      title: '关于洁神洗车',
      content: '车主端：查看余额 / 剩余次数 / 洗车打蜡记录 / 店内项目。\n数据由洁神洗车门店系统维护，如有疑问请联系门店。',
      showCancel: false,
    });
  },
});

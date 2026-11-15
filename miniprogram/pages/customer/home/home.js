const api = require('../../../utils/api');
const fmt = require('../../../utils/fmt');
const { guardCustomer } = require('../../../utils/role');

Page({
  data: {
    loading: true,
    bound: false,
    member: {},
    balanceText: '0.00',
    lastAgo: '',
    activeBooking: null,
  },

  onShow() {
    if (!guardCustomer()) return;
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      await app.ensureCustomerLogin();
      const d = await api.customerMe();
      const m = d.member || {};
      this.setData({
        bound: !!d.bound,
        member: m,
        balanceText: fmt.money(m.balance),
        lastAgo: m.lastServiceAt ? fmt.timeAgo(m.lastServiceAt) : '',
        loading: false,
      });
      app.globalData.customerBound = !!d.bound;
      if (d.bound) this.loadActiveBooking();
    } catch (e) {
      this.setData({ loading: false, bound: false });
    }
  },

  async loadActiveBooking() {
    try {
      const d = await api.myBookings();
      const active = (d.list || []).find((b) => ['pending', 'confirmed', 'serving'].includes(b.status));
      if (!active) return this.setData({ activeBooking: null });
      const dt = new Date(`${active.date}T00:00:00+08:00`);
      this.setData({
        activeBooking: {
          ...active,
          dateText: `${dt.getMonth() + 1}月${dt.getDate()}日`,
        },
      });
    } catch (e) {}
  },

  goBooking() { wx.reLaunch({ url: '/pages/customer/booking/booking' }); },
  goOrders() { wx.reLaunch({ url: '/pages/customer/orders/orders' }); },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  goBind() {
    wx.navigateTo({ url: '/pages/customer/bind/bind' });
  },

  goServices() {
    wx.reLaunch({ url: '/pages/customer/services/services' });
  },

  callStore() {
    const app = getApp();
    const phone = app.globalData.storePhone;
    if (!phone) {
      return wx.showModal({
        title: '联系门店',
        content: '门店电话还没配置。让管理员在小程序 app.js 的 storePhone 里填上号码即可。',
        showCancel: false,
      });
    }
    wx.makePhoneCall({ phoneNumber: String(phone) });
  },
});

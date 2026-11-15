const api = require('../../../utils/api');

Page({
  data: { title: '预约成功', desc: '', booking: null },

  async onLoad(options) {
    this.setData({
      title: decodeURIComponent(options.title || '预约成功'),
      desc: decodeURIComponent(options.desc || ''),
    });
    if (options.id) {
      try {
        const d = await api.myBookings();
        const booking = (d.list || []).find((b) => b.id === options.id) || null;
        this.setData({ booking });
      } catch (e) {}
    }
  },

  goOrders() { wx.reLaunch({ url: '/pages/customer/orders/orders' }); },
  goHome() { wx.reLaunch({ url: '/pages/customer/home/home' }); },
});

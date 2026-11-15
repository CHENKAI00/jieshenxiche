Component({
  properties: {
    active: { type: String, value: 'home' },
  },
  data: {
    items: [
      { key: 'home', text: '我的卡', ico: '💳', url: '/pages/customer/home/home' },
      { key: 'booking', text: '预约', ico: '📅', url: '/pages/customer/booking/booking' },
      { key: 'orders', text: '订单', ico: '🧾', url: '/pages/customer/orders/orders' },
      { key: 'mine', text: '我的', ico: '👤', url: '/pages/customer/mine/mine' },
    ],
  },
  methods: {
    go(e) {
      const key = e.currentTarget.dataset.key;
      if (key === this.data.active) return;
      const item = this.data.items.find((i) => i.key === key);
      if (item) wx.reLaunch({ url: item.url });
    },
  },
});

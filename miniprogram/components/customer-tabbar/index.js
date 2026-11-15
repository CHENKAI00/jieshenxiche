Component({
  properties: {
    active: { type: String, value: 'home' },
  },
  data: {
    items: [
      { key: 'home', text: '我的卡', ico: '💳', url: '/pages/customer/home/home' },
      { key: 'services', text: '店内项目', ico: '🧽', url: '/pages/customer/services/services' },
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

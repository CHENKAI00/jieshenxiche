App({
  globalData: {
    // 本地调试：微信开发者工具里勾「不校验合法域名」即可直连
    baseUrl: 'http://127.0.0.1:8099',
    token: 'js-wash-2026',
    staffName: '前台',
    lastPlate: ''
  },

  onLaunch() {
    const baseUrl = wx.getStorageSync('baseUrl');
    const token = wx.getStorageSync('token');
    const staffName = wx.getStorageSync('staffName');
    if (baseUrl) this.globalData.baseUrl = baseUrl;
    if (token) this.globalData.token = token;
    if (staffName) this.globalData.staffName = staffName;
  },

  setBaseUrl(v) {
    this.globalData.baseUrl = String(v || '').replace(/\/+$/, '');
    wx.setStorageSync('baseUrl', this.globalData.baseUrl);
  },

  setToken(v) {
    this.globalData.token = String(v || '').trim();
    wx.setStorageSync('token', this.globalData.token);
  },

  setStaffName(v) {
    this.globalData.staffName = String(v || '前台').trim();
    wx.setStorageSync('staffName', this.globalData.staffName);
  },
});

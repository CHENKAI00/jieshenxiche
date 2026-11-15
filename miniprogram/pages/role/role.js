Page({
  data: {},

  onLoad(options) {
    const app = getApp();
    // 已选过身份就直接进对应首页（?switch=1 表示主动来切身份，不自动跳）
    if (options && options.switch === '1') return;
    const role = wx.getStorageSync('role');
    if (role === 'customer') wx.reLaunch({ url: '/pages/customer/home/home' });
    else if (role === 'staff') wx.switchTab({ url: '/pages/index/index' });
  },

  asCustomer() {
    const app = getApp();
    app.setRole('customer');
    wx.reLaunch({ url: '/pages/customer/home/home' });
  },

  asStaff() {
    const app = getApp();
    app.setRole('staff');
    wx.switchTab({ url: '/pages/index/index' });
  },
});

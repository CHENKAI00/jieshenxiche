App({
  globalData: {
    // 默认连服务器；本机调试时在「我的 → 开发者设置」里改成 http://127.0.0.1:8099
    baseUrl: 'http://27.124.46.63:8099',
    token: '123456',
    staffName: '前台',
    lastPlate: '',
    // 门店电话（车主端「联系门店」用），改成你们店的号码
    storePhone: '',
    // 角色：staff 门店端 / customer 车主端
    role: 'staff',
    openid: '',
    customerBound: false,
  },

  onLaunch() {
    const baseUrl = wx.getStorageSync('baseUrl');
    const token = wx.getStorageSync('token');
    const staffName = wx.getStorageSync('staffName');
    const role = wx.getStorageSync('role');
    const openid = wx.getStorageSync('openid');
    // 一次性迁移：老的本地地址 / 老口令自动换成新的默认值
    if (baseUrl && /^https?:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl)) {
      this.setBaseUrl(this.globalData.baseUrl);
    } else if (baseUrl) {
      this.globalData.baseUrl = baseUrl;
    }
    if (token && token !== 'js-wash-2026') this.globalData.token = token;
    else if (token === 'js-wash-2026') this.setToken('123456');
    if (staffName) this.globalData.staffName = staffName;
    if (role === 'customer' || role === 'staff') this.globalData.role = role;
    if (openid) this.globalData.openid = openid;
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

  setRole(role) {
    this.globalData.role = role === 'customer' ? 'customer' : 'staff';
    wx.setStorageSync('role', this.globalData.role);
  },

  setOpenid(openid) {
    this.globalData.openid = String(openid || '');
    wx.setStorageSync('openid', this.globalData.openid);
  },

  /** 车主端静默登录：有 openid 直接复用，否则 wx.login 换一次 */
  ensureCustomerLogin() {
    const api = require('./utils/api');
    if (this.globalData.openid) return Promise.resolve(this.globalData.openid);
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          try {
            if (!res.code) throw new Error('wx.login 没拿到 code');
            const out = await api.customerLogin(res.code);
            this.setOpenid(out.openid);
            resolve(out.openid);
          } catch (e) { reject(e); }
        },
        fail: (e) => reject(e),
      });
    });
  },
});

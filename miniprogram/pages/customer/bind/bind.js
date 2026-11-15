const api = require('../../../utils/api');
const { guardCustomer } = require('../../../utils/role');

Page({
  data: { plateNo: '', phone: '' },

  onLoad() {
    guardCustomer();
  },

  onPlate(e) {
    this.setData({ plateNo: (e.detail.value || '').toUpperCase() });
  },

  onPhone(e) {
    this.setData({ phone: (e.detail.value || '').replace(/\D/g, '') });
  },

  async submit() {
    const plateNo = (this.data.plateNo || '').replace(/[·\s]/g, '').toUpperCase();
    const phone = this.data.phone || '';
    if (plateNo.length < 7) return wx.showToast({ title: '请填写完整车牌', icon: 'none' });
    if (phone.length !== 11 && phone.length !== 4) {
      return wx.showToast({ title: '填完整手机号或后 4 位', icon: 'none' });
    }

    try {
      const app = getApp();
      await app.ensureCustomerLogin();
      await api.customerBind({ plateNo, phone });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => wx.reLaunch({ url: '/pages/customer/home/home' }), 800);
    } catch (e) { /* api 层已提示具体原因 */ }
  },
});

const api = require('../../../utils/api');
const { guardCustomer } = require('../../../utils/role');

Page({
  data: {
    plateNo: '',
    phone: '',
    plateError: '',
    ocrLoading: false,
    submitting: false,
  },

  onLoad() {
    guardCustomer();
  },

  onPlate(e) {
    const value = e.detail.value;
    this.setData({
      plateNo: value,
      plateError: value && value.length < 7 ? '车牌至少 7 位' : '',
    });
  },

  onPlateClear() {
    this.setData({ plateNo: '', plateError: '' });
  },

  onPhone(e) {
    this.setData({ phone: (e.detail.value || '').replace(/\D/g, '') });
  },

  /** 拍照 or 相册选择 */
  pickImage() {
    if (this.data.ocrLoading) return;
    wx.showActionSheet({
      itemList: ['拍照识别', '从相册选择'],
      success: (r) => {
        const fromCamera = r.tapIndex === 0;
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: [fromCamera ? 'camera' : 'album'],
          camera: 'back',
          sizeType: ['compressed'],
          success: (res) => {
            const files = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
            if (files.length) this.doRecognize(files);
          },
        });
      },
    });
  },

  async doRecognize(files) {
    this.setData({ ocrLoading: true });
    try {
      const app = getApp();
      await app.ensureCustomerLogin();
      const r = await api.customerOcr(files);
      if (r.plateNo) {
        this.setData({
          plateNo: r.plateNo,
          plateError: r.plateValid ? '' : '识别结果不完整，请手动修正',
        });
        wx.showToast({
          title: r.votes > 1 ? `识别完成（${r.votes} 张一致）` : '识别完成',
          icon: 'none',
        });
      } else {
        wx.showToast({ title: r.reason || '没认出来，请手动输入', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '识别失败，请手动输入', icon: 'none' });
    } finally {
      this.setData({ ocrLoading: false });
    }
  },

  async submit() {
    const plateNo = (this.data.plateNo || '').replace(/[·\s]/g, '').toUpperCase();
    const phone = this.data.phone || '';
    if (plateNo.length < 7) return wx.showToast({ title: '请填写完整车牌', icon: 'none' });
    if (phone.length !== 11 && phone.length !== 4) {
      return wx.showToast({ title: '填完整手机号或后 4 位', icon: 'none' });
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const app = getApp();
      await app.ensureCustomerLogin();
      await api.customerBind({ plateNo, phone });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => wx.reLaunch({ url: '/pages/customer/home/home' }), 800);
    } catch (e) {
      this.setData({ submitting: false });
    }
  },
});

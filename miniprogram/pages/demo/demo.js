const SERVICES = [
  { id: 'wash_std', name: '标准洗车', price: 30, mins: 20, tag: '洗车', desc: '水枪冲洗 + 泡沫 + 轮毂清洁 + 擦干', promo: '首单减 10 元' },
  { id: 'wash_suv', name: '精洗 SUV/MPV', price: 50, mins: 35, tag: '洗车', desc: '大车专属，门缝/轮毂细节刷洗 + 内饰吸尘', promo: '' },
  { id: 'wax', name: '打蜡', price: 98, mins: 45, tag: '美容', desc: '棕榈蜡手工上蜡 + 收蜡，漆面增亮防水', promo: '买 3 送 1' },
];

Page({
  data: {
    services: SERVICES,
    // 按钮
    loadingPrimary: false,
    // 字段
    name: '',
    phone: '',
    password: '',
    plate: '',
    remark: '',
    errorValue: '粤B1234',
    plateError: '',
    cameraLoading: false,
  },

  /* ---------- 按钮演示 ---------- */
  onPrimary() { wx.showToast({ title: '主按钮点击', icon: 'none' }); },
  onSecondary() { wx.showToast({ title: '次按钮点击', icon: 'none' }); },
  onText() { wx.showToast({ title: '文字按钮点击', icon: 'none' }); },
  onDanger() { wx.showToast({ title: '危险操作', icon: 'none' }); },

  toggleLoading() {
    this.setData({ loadingPrimary: true });
    setTimeout(() => this.setData({ loadingPrimary: false }), 1600);
  },

  /* ---------- 字段演示 ---------- */
  onName(e) { this.setData({ name: e.detail.value }); },
  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onRemark(e) { this.setData({ remark: e.detail.value }); },
  onErrorInput(e) { this.setData({ errorValue: e.detail.value }); },

  onPlate(e) {
    const value = e.detail.value;
    this.setData({
      plate: value,
      plateError: value && value.length < 7 ? '车牌至少 7 位' : '',
    });
  },

  onClearPlate() {
    this.setData({ plate: '', plateError: '' });
  },

  /** 拍照识别：演示用，实际接 /api/v1/ocr/plate-batch */
  onCamera() {
    if (this.data.cameraLoading) return;
    this.setData({ cameraLoading: true });
    setTimeout(() => {
      this.setData({ cameraLoading: false, plate: '粤B12345', plateError: '' });
      wx.showToast({ title: '识别完成（演示）', icon: 'none' });
    }, 900);
  },

  /* ---------- 客户视角 ---------- */
  onBook(e) {
    const name = e.currentTarget.dataset.name;
    wx.showToast({ title: `选择「${name}」`, icon: 'none' });
  },

  onPromo() {
    wx.showToast({ title: '优惠：充 500 送 150', icon: 'none' });
  },
});

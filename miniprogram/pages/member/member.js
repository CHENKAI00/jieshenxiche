const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

Page({
  data: {
    plate: '',
    platePretty: '',
    member: {},
    balanceText: '0.00',
    lastAmountText: '0.00',
    lastAgo: '',
    services: [],
    loaded: false,
    form: { plateNo: '', nickname: '', phone: '', remark: '' },
  },

  onLoad(options) {
    const plate = decodeURIComponent(options.plate || '');
    this.setData({ plate, platePretty: fmt.prettyPlate(plate), 'form.plateNo': plate });
    this.load(plate);
    this.loadMeta();
  },

  onShow() {
    if (this.data.loaded && this.data.member.exists) this.load(this.data.plate);
  },

  async loadMeta() {
    try {
      const meta = await api.meta();
      this.setData({ services: meta.services || [] });
    } catch (e) {}
  },

  async load(plate) {
    try {
      const m = await api.lookup(plate || this.data.plate);
      if (!m.exists) {
        this.setData({ member: { ...m, exists: false }, loaded: true, form: { ...this.data.form, plateNo: m.plateNo } });
        return;
      }
      this.setData({
        plate: m.plateNo,
        platePretty: m.platePretty,
        member: m,
        balanceText: fmt.money(m.balance),
        lastAmountText: fmt.money(m.lastAmount),
        lastAgo: m.lastServiceAt ? fmt.timeAgo(m.lastServiceAt) : '',
        loaded: true,
      });
    } catch (e) {
      this.setData({ loaded: true, member: { exists: false } });
    }
  },

  onForm(e) {
    const k = e.currentTarget.dataset.k;
    let v = e.detail.value;
    if (k === 'plateNo') v = String(v || '').toUpperCase();
    this.setData({ [`form.${k}`]: v });
  },

  async submitCreate() {
    const f = this.data.form;
    if (!f.plateNo || f.plateNo.length < 7) return wx.showToast({ title: '请填写完整车牌', icon: 'none' });
    try {
      const r = await api.createMember({
        plateNo: f.plateNo,
        nickname: f.nickname || '车主',
        phone: f.phone,
        remark: f.remark,
      });
      wx.showToast({ title: r.created ? '建档成功' : '该车牌已有档案', icon: 'success' });
      this.setData({ plate: r.plateNo, platePretty: r.platePretty });
      this.load(r.plateNo);
    } catch (e) {}
  },

  /** 点服务卡片 → 确认核销（次数优先，否则余额） */
  pickService(e) {
    const id = e.currentTarget.dataset.id;
    const svc = this.data.services.find((s) => s.id === id);
    if (svc) this.doConsume(svc);
  },

  openConsume() {
    const services = this.data.services;
    if (!services.length) return wx.showToast({ title: '价目表加载失败', icon: 'none' });
    wx.showActionSheet({
      itemList: services.map((s) => `${s.name} ¥${s.price}`),
      success: (res) => this.doConsume(services[res.tapIndex]),
    });
  },

  doConsume(svc) {
    const m = this.data.member;
    const useCount = m.remainCount > 0 && !m.expireWarn;
    const amount = Number(svc.price);
    wx.showModal({
      title: '确认核销',
      content: `项目：${svc.name}\n本次：${useCount ? '扣次数 1 次（剩 ' + m.remainCount + ' 次）' : '余额支付 ¥' + amount.toFixed(2)}\n核销后：${useCount ? '余额 ¥' + fmt.money(m.balance) : '余额 ¥' + fmt.money(m.balance - amount)}`,
      confirmText: '确认核销',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const out = await api.consume({ plateNo: m.plateNo, serviceId: svc.id, useCount, operator: getApp().globalData.staffName });
          wx.showToast({ title: '核销成功', icon: 'success' });
          this.load(m.plateNo);
          wx.showModal({
            title: '核销完成',
            content: `${out.service} · ${out.payType}\n剩余次数 ${out.remainCount} 次 · 累计 ${out.totalCount} 次\n余额 ¥${fmt.money(out.balance)}`,
            showCancel: false,
          });
        } catch (e) {}
      },
    });
  },

  goRecharge() {
    wx.navigateTo({ url: `/pages/recharge/recharge?plate=${encodeURIComponent(this.data.member.plateNo)}` });
  },

  goMembers() {
    wx.navigateTo({ url: '/pages/records/records' });
  },

  callOwner() {
    const phone = this.data.member.phoneRaw;
    if (!phone) return wx.showToast({ title: '未登记手机号', icon: 'none' });
    wx.makePhoneCall({ phoneNumber: phone });
  },
});

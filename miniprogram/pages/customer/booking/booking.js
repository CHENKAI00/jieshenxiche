const api = require('../../../utils/api');
const { guardCustomer } = require('../../../utils/role');

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function beautify(day) {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date(`${day}T00:00:00+08:00`);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`;
}

Page({
  data: {
    services: [],
    service: {},
    svcActions: [],
    showSvc: false,
    showCal: false,
    minDate: new Date(),
    maxDate: new Date(Date.now() + 30 * 86400000),
    date: '',
    dateText: '',
    slots: [],
    time: '',
    remark: '',
    submitting: false,
  },

  onLoad(options) {
    if (!guardCustomer()) return;
    this.presetServiceId = (options && options.serviceId) || '';
    this.loadServices();
  },

  async loadServices() {
    try {
      const d = await api.customerServices();
      const services = d.services || [];
      const preset = services.find((s) => s.id === this.presetServiceId);
      this.setData({
        services,
        service: preset || {},
        svcActions: services.map((s) => ({
          name: s.name,
          subname: `¥${s.price} · 约${s.mins}分钟`,
          id: s.id,
        })),
      });
    } catch (e) {}
  },

  openService() {
    if (!this.data.svcActions.length) return wx.showToast({ title: '项目加载中', icon: 'none' });
    this.setData({ showSvc: true });
  },
  closeSvc() { this.setData({ showSvc: false }); },

  onPickSvc(e) {
    const picked = e.detail;
    const svc = this.data.services.find((s) => s.name === picked.name) || {};
    this.setData({ service: svc, showSvc: false });
  },

  openCalendar() { this.setData({ showCal: true }); },
  closeCal() { this.setData({ showCal: false }); },

  async onPickDate(e) {
    const d = e.detail instanceof Date ? e.detail : new Date(e.detail);
    const day = fmtDate(d);
    this.setData({ showCal: false, date: day, dateText: beautify(day), time: '', slots: [] });
    try {
      const r = await api.bookingSlots(day);
      this.setData({ slots: r.slots || [] });
    } catch (err) {}
  },

  pickTime(e) {
    const t = e.currentTarget.dataset.time;
    const slot = this.data.slots.find((s) => s.time === t);
    if (!slot || slot.left <= 0) return wx.showToast({ title: '该时段已约满', icon: 'none' });
    this.setData({ time: t === this.data.time ? '' : t });
  },

  onRemark(e) { this.setData({ remark: e.detail }); },

  async submit() {
    if (this.data.submitting) return;
    const { service, date, time, remark } = this.data;
    if (!service.id) return wx.showToast({ title: '先选项目', icon: 'none' });
    if (!date) return wx.showToast({ title: '先选日期', icon: 'none' });
    if (!time) return wx.showToast({ title: '先选时段', icon: 'none' });

    this.setData({ submitting: true });
    try {
      const out = await api.createBooking({ serviceId: service.id, date, time, remark });
      wx.redirectTo({
        url: `/pages/customer/result/result?type=booking&id=${out.booking.id}&title=${encodeURIComponent('预约成功')}&desc=${encodeURIComponent(service.name + ' · ' + beautify(date) + ' ' + time)}`,
      });
    } catch (e) {
      this.setData({ submitting: false });
    }
  },
});

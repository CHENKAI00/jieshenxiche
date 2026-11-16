const api = require('../../utils/api');
const { guardStaff } = require('../../utils/role');
const fmt = require('../../utils/fmt');

Page({
  data: {
    imagePath: '',
    loading: false,
    result: null,
    confText: '',
    balanceText: '0.00',
    memberInitial: '',
    lastAgo: '',
    showInput: false,
    plateInput: '',
  },

  onShow() {
    if (!guardStaff()) return;
    if (this.data.result && this.data.result.plateNo && this.data.result.exists) {
      this.lookupByPlate(this.data.result.plateNo);
    }
  },

  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: this.data.imagePath ? ['camera', 'album'] : ['camera'],
      camera: 'back',
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) this.doRecognize(file.tempFilePath);
      },
    });
  },

  /** 相册：最多选 3 张，多张走投票识别 */
  chooseAlbum() {
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: async (res) => {
        const files = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (!files.length) return;
        if (files.length === 1) return this.doRecognize(files[0]);
        this.setData({ imagePath: files[0], loading: true });
        try {
          const r = await api.uploadPlateBatch(files);
          this.applyResult({ ...r, rawPlate: r.corrected ? (r.candidates && r.candidates[0] && r.candidates[0].plate) || '' : '' });
          wx.showToast({ title: r.exists ? `${r.member.nickname} 已到店` : '已识别', icon: 'none' });
        } catch (e) {
          this.setData({ showInput: true, plateInput: '' });
        } finally {
          this.setData({ loading: false });
        }
      },
    });
  },

  /** 连拍：一次拍/选最多 3 张，走投票识别 */
  shootBatch() {
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      camera: 'back',
      sizeType: ['compressed'],
      success: async (res) => {
        const files = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (!files.length) return;
        this.setData({ imagePath: files[0], loading: true });
        try {
          const r = await api.uploadPlateBatch(files);
          this.applyResult({ ...r, rawPlate: r.corrected ? (r.candidates && r.candidates[0] && r.candidates[0].plate) || '' : '' });
          if (r.exists && r.member) {
            wx.vibrateShort && wx.vibrateShort({ type: 'light' });
            wx.showToast({ title: `${r.member.nickname} 已到店`, icon: 'success' });
          } else if (r.plateNo) {
            wx.showToast({ title: r.corrected ? '已按会员库校正' : '未建档，可一键建档', icon: 'none' });
          }
        } catch (e) {
          this.setData({ showInput: true, plateInput: '' });
        } finally {
          this.setData({ loading: false });
        }
      },
    });
  },

  useSuggestion() {
    const sug = this.data.result && this.data.result.suggestion;
    if (!sug) return;
    this.lookupByPlate(sug.plate);
  },

  async doRecognize(filePath) {
    this.setData({ imagePath: filePath, loading: true });
    try {
      const r = await api.uploadPlate(filePath);
      this.applyResult(r);
      if (r.exists && r.member) {
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
        wx.showToast({ title: `${r.member.nickname} 已到店`, icon: 'success' });
      } else if (r.plateNo) {
        wx.showToast({ title: '未建档，可一键建档', icon: 'none' });
      }
    } catch (e) {
      this.setData({ showInput: true, plateInput: '' });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyResult(r) {
    const member = r.member || null;
    this.setData({
      result: r,
      confText: r.confidence ? Math.round(r.confidence * 100) + '%' : '—',
      balanceText: member ? fmt.money(member.balance) : '0.00',
      memberInitial: member && member.nickname ? member.nickname.slice(0, 1) : '车',
      lastAgo: member && member.lastServiceAt ? fmt.timeAgo(member.lastServiceAt) : '',
    });
    getApp().globalData.lastPlate = r.plateNo || '';
  },

  async lookupByPlate(plate) {
    try {
      const m = await api.lookup(plate);
      this.applyResult({
        plateNo: m.plateNo,
        platePretty: m.platePretty,
        plateValid: m.plateValid,
        plateColor: m.plateColor || '',
        engine: 'manual',
        exists: m.exists,
        member: m.exists ? m : null,
        confidence: 0,
      });
    } catch (e) { /* ignore */ }
  },

  reset() { this.setData({ imagePath: '', result: null }); },

  editPlate() {
    this.setData({ showInput: true, plateInput: (this.data.result && this.data.result.plateNo) || '' });
  },

  focusInput() { this.setData({ showInput: true, plateInput: '' }); },
  onInput(e) { this.setData({ plateInput: (e.detail.value || '').toUpperCase() }); },
  closeInput() { this.setData({ showInput: false }); },
  noop() {},

  submitPlate() {
    const p = (this.data.plateInput || '').replace(/[·\s]/g, '').toUpperCase();
    if (p.length < 7) return wx.showToast({ title: '车牌至少 7 位', icon: 'none' });
    this.setData({ showInput: false });
    this.lookupByPlate(p);
  },

  openMember() {
    const p = this.data.result && this.data.result.plateNo;
    if (p) wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(p)}` });
  },

  openRecharge() {
    const p = this.data.result && this.data.result.plateNo;
    if (p) wx.navigateTo({ url: `/pages/recharge/recharge?plate=${encodeURIComponent(p)}` });
  },

  goCreate() {
    const p = this.data.result && this.data.result.plateNo;
    if (p) wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(p)}&create=1` });
  },
});

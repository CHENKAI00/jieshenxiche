Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared',
  },
  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    /** text | number | digit | idcard | nickname */
    type: { type: String, value: 'text' },
    password: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    /** 布尔或文案：true → 默认提示，字符串 → 自定义提示 */
    error: { type: null, value: '' },
    maxlength: { type: Number, value: 140 },
    clearable: { type: Boolean, value: false },
    /** 前缀：图片路径（/、http、data:）或短文本/emoji */
    prefixIcon: { type: String, value: '' },
    /** 车牌模式：32rpx / 字间距 2rpx / 自动大写 */
    plate: { type: Boolean, value: false },
    required: { type: Boolean, value: false },
    hint: { type: String, value: '' },
    showCount: { type: Boolean, value: false },
    /** 外部控制聚焦 */
    focus: { type: Boolean, value: false },
    confirmType: { type: String, value: 'done' },
  },

  data: {
    innerValue: '',
    focused: false,
    focusFlag: false,
    errorMessage: '',
    isImageIcon: false,
  },

  observers: {
    value(v) {
      const next = v == null ? '' : String(v);
      if (next !== this.data.innerValue) this.setData({ innerValue: next });
    },
    focus(v) {
      this.setData({ focusFlag: !!v });
    },
    error(v) {
      let msg = '';
      if (typeof v === 'string') msg = v;
      else if (v === true) msg = '请检查此项';
      this.setData({ errorMessage: msg });
    },
    prefixIcon(v) {
      this.setData({ isImageIcon: /^(https?:|\/|data:)/.test(v || '') });
    },
  },

  methods: {
    onInput(e) {
      let value = e.detail.value == null ? '' : String(e.detail.value);
      if (this.data.plate) {
        value = value.toUpperCase().replace(/\s/g, '');
      }
      this.setData({ innerValue: value });
      this.triggerEvent('input', { value });
    },

    onFocus(e) {
      this.setData({ focused: true });
      this.triggerEvent('focus', { value: this.data.innerValue });
    },

    onBlur(e) {
      this.setData({ focused: false });
      this.triggerEvent('blur', { value: this.data.innerValue });
    },

    onConfirm(e) {
      this.triggerEvent('confirm', { value: this.data.innerValue });
    },

    /** 清空后保持聚焦 */
    onClear() {
      this.setData({ innerValue: '', focusFlag: false });
      this.triggerEvent('input', { value: '' });
      this.triggerEvent('clear');
      wx.nextTick(() => this.setData({ focusFlag: true }));
    },

    onSuffixTap(e) {
      this.triggerEvent('suffixtap', e.detail || {});
    },
  },
});

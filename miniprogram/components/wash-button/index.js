Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared',
  },
  properties: {
    /** primary | secondary | text | danger */
    type: { type: String, value: 'primary' },
    /** large 88 | medium 72 | small 56 */
    size: { type: String, value: 'large' },
    block: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    /** 不传 slot 时用这个文案 */
    label: { type: String, value: '' },
    /** 额外类名，用于单点微调（如 margin-less） */
    customClass: { type: String, value: '' },
  },
  methods: {
    onTap(e) {
      if (this.data.disabled || this.data.loading) return;
      this.triggerEvent('tap', { event: e });
    },
  },
});

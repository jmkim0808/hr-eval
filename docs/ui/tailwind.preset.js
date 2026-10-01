/**
 * 인사평가 시스템 Tailwind 설정 (선택 사항)
 * - 값은 tokens.css의 CSS 변수를 그대로 부른다. tokens.css를 먼저 불러와야 한다.
 * - theme를 extend가 아니라 "교체"해서 기본 팔레트·임의 크기를 쓸 수 없게 한다.
 * 사용: tailwind.config.js → presets: [require('./docs/ui/tailwind.preset.js')]
 */
const v = (name) => `var(--${name})`;

module.exports = {
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      page: v('color-page-background'),
      surface: v('color-surface-background'),
      'surface-muted': v('color-surface-muted'),
      'row-hover': v('color-row-hover-background'),
      selected: v('color-selected-background'),
      text: {
        primary: v('color-text-primary'),
        secondary: v('color-text-secondary'),
        muted: v('color-text-muted'),
        disabled: v('color-text-disabled'),
        'on-primary': v('color-text-on-primary'),
        link: v('color-text-link'),
      },
      border: {
        DEFAULT: v('color-border-default'),
        subtle: v('color-border-subtle'),
        input: v('color-border-input'),
        'input-hover': v('color-border-input-hover'),
        'header-rule': v('color-header-rule'),
      },
      brand: v('color-brand-primary'),
      'button-primary': {
        DEFAULT: v('color-button-primary-background'),
        hover: v('color-button-primary-background-hover'),
        pressed: v('color-button-primary-background-pressed'),
      },
      'button-disabled': { DEFAULT: v('color-button-disabled-background'), text: v('color-button-disabled-text') },
      status: {
        'success-text': v('color-status-success-text'), 'success-bg': v('color-status-success-background'),
        'warning-text': v('color-status-warning-text'), 'warning-bg': v('color-status-warning-background'),
        'danger-text': v('color-status-danger-text'), 'danger-bg': v('color-status-danger-background'),
        'progress-text': v('color-status-progress-text'), 'progress-bg': v('color-status-progress-background'),
        'neutral-text': v('color-status-neutral-text'), 'neutral-bg': v('color-status-neutral-background'),
      },
      grade: {
        'up-text': v('color-grade-up-text'), 'up-bg': v('color-grade-up-background'), 'up-border': v('color-grade-up-border'),
        'down-text': v('color-grade-down-text'), 'down-bg': v('color-grade-down-background'), 'down-border': v('color-grade-down-border'),
        'rule-text': v('color-grade-rule-text'), 'rule-bg': v('color-grade-rule-background'), 'rule-border': v('color-grade-rule-border'),
      },
      confidential: v('color-confidential-text'),
      'focus-ring': v('color-focus-ring'),
      'input-focus-halo': v('color-input-focus-halo'),
      'input-error-halo': v('color-input-error-halo'),
      overlay: v('color-overlay-backdrop'),
    },
    fontFamily: { base: v('font-family-base') },
    fontSize: {
      'page-title': [v('font-size-page-title'), { lineHeight: v('line-height-page-title') }],
      'section-title': [v('font-size-section-title'), { lineHeight: v('line-height-section-title') }],
      'subsection-title': [v('font-size-subsection-title'), { lineHeight: v('line-height-subsection-title') }],
      body: [v('font-size-body'), { lineHeight: v('line-height-body') }],
      caption: [v('font-size-caption'), { lineHeight: v('line-height-caption') }],
      'label-small': [v('font-size-label-small'), { lineHeight: v('line-height-label-small') }],
    },
    fontWeight: { regular: v('font-weight-regular'), medium: v('font-weight-medium'), bold: v('font-weight-bold') },
    spacing: {
      0: '0', 1: v('space-1'), 2: v('space-2'), 3: v('space-3'), 4: v('space-4'), 6: v('space-6'), 8: v('space-8'), 12: v('space-12'),
      'control-sm': v('size-control-small'), 'control-md': v('size-control-medium'), 'control-lg': v('size-control-large'), row: v('size-row'),
    },
    borderRadius: { none: '0', control: v('radius-control'), box: v('radius-box'), tag: v('radius-tag') },
    borderWidth: { 0: '0', DEFAULT: v('border-width-default'), header: v('border-width-header-rule'), indicator: v('border-width-indicator'), banner: v('border-width-banner-accent') },
    boxShadow: { none: 'none', overlay: v('shadow-overlay') },
    maxWidth: { form: v('layout-form-max-width'), auth: v('layout-auth-max-width'), dialog: v('layout-dialog-width'), full: '100%' },
    screens: { narrow: { max: '720px' } },
  },
};

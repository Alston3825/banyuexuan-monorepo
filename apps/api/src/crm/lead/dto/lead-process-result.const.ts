/** 线索/预约的处理结果，多选，见 Lead.processResults（JSON数组存这些code）。 */
export const LEAD_PROCESS_RESULTS = [
  'PHONE_VALID', // 电话有效
  'PHONE_INVALID', // 电话无效
  'WECHAT_ADDED', // 已加微信
  'PHONE_UNREACHABLE', // 电话无法接通
  'NOT_CONTACTED', // 未联系上
] as const;

export type LeadProcessResult = (typeof LEAD_PROCESS_RESULTS)[number];

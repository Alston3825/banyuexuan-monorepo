/** 客户类型（多选，参考同类系统建档表单补的字段，见业务规则确认记录"客户档案表单扩展"一节）。
 *  前端展示文案见 apps/web/src/utils/status-map.ts 的 CUSTOMER_SERVICE_TYPE_LABEL_MAP，
 *  两边的code必须保持一致。 */
export const CUSTOMER_SERVICE_TYPES = [
  'MATERNITY_ROOM', // 月子房客户
  'CONFINEMENT_NANNY', // 月嫂上户客户
  'MEAL_DELIVERY', // 月子餐外送
  'POSTPARTUM_RECOVERY', // 产康客户
  'BABY_CARE', // 宝宝托管
] as const;

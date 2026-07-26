/**
 * 字段级掩码注册表（RBAC 四级权限的"字段"级）——轻量方案，不做重型通用框架。
 * P1+ 新增敏感字段（证件号、薪资、余额等）只需在这里加一条注册，机制本身不用改。
 */
export interface SensitiveFieldRule {
  field: string;
  permissionCode: string;
  mask: (value: unknown) => unknown;
}

function maskPhone(value: unknown): unknown {
  if (typeof value !== 'string' || value.length < 7) return value ? '***' : value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

export const SENSITIVE_FIELD_REGISTRY: Record<string, SensitiveFieldRule[]> = {
  Account: [{ field: 'phone', permissionCode: 'platform.account.field.phone.view', mask: maskPhone }],
  Customer: [{ field: 'phone', permissionCode: 'crm.customer.field.phone.view', mask: maskPhone }],
};

/**
 * 字段级掩码注册表（RBAC 四级权限的"字段"级）——轻量方案，不做重型通用框架。
 * P1+ 新增敏感字段（证件号、薪资、余额等）只需在这里加一条注册，机制本身不用改。
 */
export interface SensitiveFieldRule {
  field: string;
  permissionCode: string;
  mask: (value: unknown) => unknown;
}

/**
 * 目前没有任何字段需要掩码：软件仅内部使用，已有权限体系把关，业务方明确要求
 * 客户手机号、员工手机号、身份证号、工资卡号等一律明文显示（2026-10-06 取消了员工手机号的掩码）。
 * 机制（MaskEntity 装饰器 + 拦截器）保留着，以后真有需要时在这里加一条注册即可。
 */
export const SENSITIVE_FIELD_REGISTRY: Record<string, SensitiveFieldRule[]> = {};

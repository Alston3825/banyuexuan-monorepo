import { SetMetadata } from '@nestjs/common';

export const MASK_ENTITY_KEY = 'maskEntityType';

/** 标记该路由返回值需要按 sensitive-field-registry 做字段级掩码（RBAC 第四级：字段）。 */
export const MaskEntity = (entityType: string) => SetMetadata(MASK_ENTITY_KEY, entityType);

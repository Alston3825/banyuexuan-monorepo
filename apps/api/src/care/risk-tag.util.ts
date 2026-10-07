import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 风险标签的分类：母婴档案/宝宝档案的风险标签只能用这一类（销售用的客户分类、客户类型不能混进来）。 */
export const CARE_RISK_CATEGORY = 'CARE_RISK';

/**
 * 把某个母婴档案/宝宝档案的风险标签整体改成 tagIds：
 * 不在新名单里的现有标签标记撤销（保留历史，不物理删除；误选的客户分类/类型标签也会被撤掉），新增的补上绑定。
 */
export async function replaceRiskTags(
  prisma: PrismaService,
  p: { tenantId: string; accountId: string; entityType: 'MOTHER_PROFILE' | 'BABY_PROFILE'; entityId: string; tagIds: string[] },
): Promise<{ added: string[]; removed: string[] }> {
  const wanted = [...new Set(p.tagIds)];
  if (wanted.length > 0) {
    const tags = await prisma.tag.findMany({ where: { id: { in: wanted }, tenantId: p.tenantId } });
    if (tags.length !== wanted.length) throw new BadRequestException('存在不存在的标签');
    const wrong = tags.find((t) => t.category !== CARE_RISK_CATEGORY);
    if (wrong) throw new BadRequestException(`「${wrong.name}」不是母婴风险标签，不能作为风险标签（母婴风险标签请到“基础资料 → 标签管理”里，分类选“母婴风险标签”）`);
  }
  const current = await prisma.tagBinding.findMany({ where: { entityType: p.entityType, entityId: p.entityId, revokedAt: null } });
  const currentIds = new Set(current.map((c) => c.tagId));
  const removed = current.filter((c) => !wanted.includes(c.tagId));
  const added = wanted.filter((id) => !currentIds.has(id));
  await prisma.$transaction(async (tx) => {
    if (removed.length) await tx.tagBinding.updateMany({ where: { id: { in: removed.map((r) => r.id) } }, data: { revokedAt: new Date() } });
    for (const tagId of added) {
      await tx.tagBinding.create({ data: { tagId, entityType: p.entityType, entityId: p.entityId, tenantId: p.tenantId, createdBy: p.accountId } });
    }
  });
  return { added, removed: removed.map((r) => r.tagId) };
}

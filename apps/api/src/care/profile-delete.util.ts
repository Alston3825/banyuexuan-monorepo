import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 母婴档案（妈妈档案 + 名下宝宝）的“能不能删”检查与删除，母婴档案页和“删除客户”共用。
 * - blockers：真正的护理痕迹（护理记录/日常护理记录/护理计划/异常/离店关怀计划，含宝宝名下的），任何人都不能连带删除；
 * - attached：评估表、用药委托书、护理计划版本、服务执行记录、纸质资料等“录入类”资料，管理员确认后可连同删除。
 */
export async function motherProfilesDeleteCheck(db: Db, motherIds: string[]) {
  if (motherIds.length === 0) return { blockers: [] as string[], attached: [] as string[], babyCount: 0 };
  const babies = await db.babyProfile.findMany({ where: { motherProfileId: { in: motherIds } }, select: { id: true } });
  const babyIds = babies.map((b) => b.id);
  const mOrB = <K extends string>(mKey: K) => ({ OR: [{ [mKey]: { in: motherIds } }, { babyProfileId: { in: babyIds } }] });
  const [records, dailies, babyDailies, plans, abnormalities, outreach, mAdm, mDis, bAdm, bDis, meds, versions, logs, docs, links] = await Promise.all([
    db.careRecord.count({ where: mOrB('motherProfileId') }),
    db.careDailyRecord.count({ where: { motherProfileId: { in: motherIds } } }),
    db.careDailyBabyRecord.count({ where: { babyProfileId: { in: babyIds } } }),
    db.carePlan.count({ where: mOrB('motherProfileId') }),
    db.careAbnormality.count({ where: mOrB('motherProfileId') }),
    db.careOutreachPlan.count({ where: { motherProfileId: { in: motherIds } } }),
    db.careMotherAdmission.count({ where: { motherProfileId: { in: motherIds } } }),
    db.careMotherDischarge.count({ where: { motherProfileId: { in: motherIds } } }),
    db.careBabyAdmission.count({ where: { babyProfileId: { in: babyIds } } }),
    db.careBabyDischarge.count({ where: { babyProfileId: { in: babyIds } } }),
    db.careMedicationAuth.count({ where: { motherProfileId: { in: motherIds } } }),
    db.carePlanVersion.count({ where: { motherProfileId: { in: motherIds } } }),
    db.careServiceLog.count({ where: { motherProfileId: { in: motherIds } } }),
    db.careDocument.count({ where: { motherProfileId: { in: motherIds } } }),
    db.careConfirmLink.count({ where: { motherProfileId: { in: motherIds } } }),
  ]);
  const blockers = [
    records && `${records} 条护理记录`,
    dailies + babyDailies > 0 && `${dailies + babyDailies} 条日常护理记录`,
    plans && `${plans} 个护理计划`,
    abnormalities && `${abnormalities} 条护理异常`,
    outreach && `${outreach} 个离店关怀计划`,
  ].filter(Boolean) as string[];
  const attached = [
    mAdm + bAdm > 0 && '入所评估表',
    mDis + bDis > 0 && '出所评估表',
    meds && `${meds} 份用药委托书`,
    versions && `${versions} 个护理计划版本`,
    logs && `${logs} 条服务执行记录`,
    docs && `${docs} 份纸质资料`,
    links && `${links} 个客户确认链接`,
  ].filter(Boolean) as string[];
  return { blockers, attached, babyCount: babyIds.length };
}

/** 在事务里删除这些妈妈档案及名下宝宝、评估表、资料等；返回纸质资料 id（事务提交后清理磁盘文件）。调用前必须已通过 motherProfilesDeleteCheck（blockers 为空）。 */
export async function deleteMotherProfilesTx(tx: Prisma.TransactionClient, motherIds: string[]): Promise<string[]> {
  if (motherIds.length === 0) return [];
  const babies = await tx.babyProfile.findMany({ where: { motherProfileId: { in: motherIds } }, select: { id: true } });
  const babyIds = babies.map((b) => b.id);
  const docs = await tx.careDocument.findMany({ where: { motherProfileId: { in: motherIds } }, select: { id: true } });
  await tx.careMotherAdmission.deleteMany({ where: { motherProfileId: { in: motherIds } } });
  await tx.careMotherDischarge.deleteMany({ where: { motherProfileId: { in: motherIds } } });
  await tx.careBabyAdmission.deleteMany({ where: { babyProfileId: { in: babyIds } } });
  await tx.careBabyDischarge.deleteMany({ where: { babyProfileId: { in: babyIds } } });
  await tx.careMedicationAuth.deleteMany({ where: { motherProfileId: { in: motherIds } } }); // 药品行随之级联删除
  await tx.carePlanVersion.deleteMany({ where: { motherProfileId: { in: motherIds } } });
  await tx.careServiceLog.deleteMany({ where: { motherProfileId: { in: motherIds } } });
  await tx.careDocument.deleteMany({ where: { motherProfileId: { in: motherIds } } }); // 照片记录随之级联删除
  await tx.careConfirmLink.deleteMany({ where: { motherProfileId: { in: motherIds } } });
  await tx.tagBinding.deleteMany({ where: { OR: [{ entityType: 'MOTHER_PROFILE', entityId: { in: motherIds } }, { entityType: 'BABY_PROFILE', entityId: { in: babyIds } }] } });
  await tx.babyProfile.deleteMany({ where: { motherProfileId: { in: motherIds } } });
  await tx.motherProfile.deleteMany({ where: { id: { in: motherIds } } });
  return docs.map((d) => d.id);
}

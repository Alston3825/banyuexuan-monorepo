import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { RoomService, RoomBoardEntry } from '../../room/room/room.service';
import { QueryCareBoardDto } from './dto/query-care-board.dto';

export interface CareBoardBaby {
  id: string;
  sequenceNo: number;
  name: string | null;
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN';
}

export interface CareBoardCare {
  motherProfileId: string;
  deliveryMethod: 'VAGINAL' | 'CESAREAN' | 'UNKNOWN';
  deliveryDate: Date | null;
  gestationalWeeks: number | null;
  careNote: string | null;
  /** 主责护理师（员工账号）；没指派为 null */
  nurse: { id: string; name: string } | null;
  /** 过敏提示（看板“敏”字）：风险标签有“高敏”，或入住评估里填了过敏史“有”/写了过敏说明，任一满足就亮 */
  hasAllergyTag: boolean;
  /** 入住评估里的过敏说明（如“鸡蛋过敏”）；没有为 null */
  allergyNote: string | null;
  /** 当前生效的妈妈护理计划：护理等级、重点关注、下次评审日（没有生效的计划则为 null） */
  plan: { level: string; focusPoints: string | null; nextReviewDue: string | null; reviewOverdue: boolean } | null;
  /** 今天的日常护理记录是否已填 */
  dailyFilledToday: boolean;
  babies: CareBoardBaby[];
}

export interface CareBoardEntry extends RoomBoardEntry {
  care: CareBoardCare | null;
}

/**
 * 护理看板：房态看板的数据（房间+占用状态）之上，叠加当前入住这一段对应的母婴档案信息
 * （生产方式/生产日期/孕周、护理要点、风险标签、宝宝性别）。是"读"的聚合视图，不新增
 * 任何写操作——数据仍然分别维护在 RoomService/MotherProfileService/BabyProfileService。
 * 一次入住只可能对应一条母婴档案（MotherProfile.occupancyId 是"再次入住建新档"的锚点，
 * 见 MotherProfile 模型注释），所以按 occupancyId 精确匹配，不取"最新一条"这种模糊口径。
 */
@Injectable()
export class CareBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomService: RoomService,
    private readonly ctx: RequestContextService,
  ) {}

  async getBoard(query: QueryCareBoardDto): Promise<CareBoardEntry[]> {
    const entries = await this.roomService.getBoard(query);
    const occupancyIds = entries.map((e) => e.occupancyId).filter((id): id is string => !!id);
    if (occupancyIds.length === 0) {
      return entries.map((e) => ({ ...e, care: null }));
    }

    const profiles = await this.prisma.motherProfile.findMany({
      where: { tenantId: this.ctx.tenantId, occupancyId: { in: occupancyIds } },
      include: { babies: { orderBy: { sequenceNo: 'asc' } }, primaryNurse: { select: { id: true, realName: true } } },
    });
    const profileByOccupancyId = new Map(profiles.map((p) => [p.occupancyId as string, p]));

    const motherProfileIds = profiles.map((p) => p.id);
    const allergyBindings =
      motherProfileIds.length > 0
        ? await this.prisma.tagBinding.findMany({
            where: { entityType: 'MOTHER_PROFILE', entityId: { in: motherProfileIds }, revokedAt: null, tag: { name: '高敏' } },
            select: { entityId: true },
          })
        : [];
    const allergyMotherProfileIds = new Set(allergyBindings.map((b) => b.entityId));

    // 入住评估（纸质《产妇入住评估单》）里的过敏史/过敏说明
    const admissions = motherProfileIds.length
      ? await this.prisma.careMotherAdmission.findMany({
          where: { tenantId: this.ctx.tenantId, motherProfileId: { in: motherProfileIds } },
          select: { motherProfileId: true, allergyHistory: true, allergyNote: true },
        })
      : [];
    const NO_ALLERGY_TEXT = /^(无|没有|否|无过敏|未见|\/|-|—)$/;
    const allergyByProfile = new Map(
      admissions.map((a) => {
        const note = a.allergyNote?.trim() || null;
        const noteMeansAllergy = !!note && !NO_ALLERGY_TEXT.test(note);
        return [a.motherProfileId, { flag: a.allergyHistory === 'YES' || noteMeansAllergy, note: noteMeansAllergy ? note : null }] as const;
      }),
    );

    // 今天（北京时间）的日常护理记录填了没有
    const today = new Date(`${new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const dailyToday = motherProfileIds.length
      ? await this.prisma.careDailyRecord.findMany({ where: { motherProfileId: { in: motherProfileIds }, recordDate: today }, select: { motherProfileId: true } })
      : [];
    const dailyFilled = new Set(dailyToday.map((r) => r.motherProfileId));
    const activePlans = motherProfileIds.length
      ? await this.prisma.carePlanVersion.findMany({ where: { tenantId: this.ctx.tenantId, motherProfileId: { in: motherProfileIds }, babyProfileId: null, status: 'ACTIVE' } })
      : [];
    const planByMother = new Map(activePlans.map((p) => [p.motherProfileId, p]));

    return entries.map((entry) => {
      const profile = entry.occupancyId ? profileByOccupancyId.get(entry.occupancyId) : undefined;
      if (!profile) return { ...entry, care: null };
      return {
        ...entry,
        care: {
          motherProfileId: profile.id,
          deliveryMethod: profile.deliveryMethod,
          deliveryDate: profile.deliveryDate,
          gestationalWeeks: profile.gestationalWeeks,
          careNote: profile.careNote,
          nurse: profile.primaryNurse ? { id: profile.primaryNurse.id, name: profile.primaryNurse.realName } : null,
          hasAllergyTag: allergyMotherProfileIds.has(profile.id) || !!allergyByProfile.get(profile.id)?.flag,
          allergyNote: allergyByProfile.get(profile.id)?.note ?? null,
          dailyFilledToday: dailyFilled.has(profile.id),
          plan: planByMother.has(profile.id)
            ? {
                level: planByMother.get(profile.id)!.level,
                focusPoints: planByMother.get(profile.id)!.focusPoints,
                nextReviewDue: planByMother.get(profile.id)!.nextReviewDue ? planByMother.get(profile.id)!.nextReviewDue!.toISOString().slice(0, 10) : null,
                reviewOverdue: !!planByMother.get(profile.id)!.nextReviewDue && planByMother.get(profile.id)!.nextReviewDue! <= today,
              }
            : null,
          babies: profile.babies.map((b) => ({ id: b.id, sequenceNo: b.sequenceNo, name: b.name, gender: b.gender })),
        },
      };
    });
  }
}

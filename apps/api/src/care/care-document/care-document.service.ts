import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CareDocType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { AiGatewayClient } from '../../ai/ai-gateway/ai-gateway.client';
import { CareDocumentExtractionService } from './care-document-extraction.service';
import { CareStorageService } from './care-storage.service';

export interface UploadMeta {
  docType: CareDocType;
  motherProfileId?: string;
  babyProfileId?: string;
  title?: string;
  docDate?: string;
  remark?: string;
  autoExtract?: string;
}

const filesSelect = { orderBy: { sortOrder: 'asc' as const }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sortOrder: true } };
const isHeic = (f: Express.Multer.File) => /^image\/hei[cf]$/i.test(f.mimetype) || /\.hei[cf]$/i.test(f.originalname);
const isPdf = (f: Express.Multer.File) => f.buffer.subarray(0, 4).toString() === '%PDF';

/** 纸质资料（照片/PDF）的上传、查看、识别触发。结构化类型上传后自动排队识别；只留档类型上传即视为已确认。 */
@Injectable()
export class CareDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CareStorageService,
    private readonly extraction: CareDocumentExtractionService,
    private readonly aiGateway: AiGatewayClient,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  list(query: { motherProfileId?: string; babyProfileId?: string; docType?: CareDocType }) {
    return this.prisma.careDocument.findMany({
      where: { tenantId: this.ctx.tenantId, motherProfileId: query.motherProfileId, babyProfileId: query.babyProfileId, docType: query.docType },
      include: { files: filesSelect },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string) {
    const doc = await this.prisma.careDocument.findFirst({ where: { id, tenantId: this.ctx.tenantId }, include: { files: filesSelect } });
    if (!doc) throw new NotFoundException('资料不存在');
    return doc;
  }

  /** 上传一份资料（可含多张照片）。 */
  async upload(files: Express.Multer.File[], meta: UploadMeta) {
    if (!files?.length) throw new BadRequestException('请选择照片或 PDF 文件');
    const { motherProfileId, babyProfileId, storeId } = await this.resolveOwner(meta);
    for (const f of files) {
      if (!isPdf(f) && !/^image\/(jpeg|png|webp|hei[cf])$/i.test(f.mimetype) && !isHeic(f)) {
        throw new BadRequestException(`文件「${this.fileName(f)}」不是照片（JPG/PNG/HEIC）或 PDF`);
      }
    }
    const structured = this.extraction.isStructured(meta.docType);
    const extract = structured && meta.autoExtract !== 'false';
    const created = await this.prisma.careDocument.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId,
        docType: meta.docType,
        motherProfileId,
        babyProfileId,
        title: meta.title?.trim() || null,
        docDate: meta.docDate ? new Date(meta.docDate) : null,
        remark: meta.remark?.trim() || null,
        status: structured ? 'DRAFT' : 'CONFIRMED',
        extractStatus: extract ? 'PENDING' : 'NONE', // 先标成排队中，前端马上就能看到“识别中”
        confirmedBy: structured ? null : this.ctx.accountId,
        confirmedAt: structured ? null : new Date(),
        createdBy: this.ctx.accountId!,
      },
    });
    await this.saveFiles(created.id, files, 0);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareDocument',
      entityId: created.id,
      afterData: { docType: meta.docType, files: files.length },
      tenantId: this.ctx.tenantId,
      storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    if (extract) this.extraction.enqueue(created.id);
    return this.getOne(created.id);
  }

  /** 给已有资料补拍照片（多页表格分次拍、或重拍）。 */
  async addFiles(id: string, files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('请选择照片或 PDF 文件');
    const doc = await this.getOne(id);
    for (const f of files) {
      if (!isPdf(f) && !/^image\/(jpeg|png|webp|hei[cf])$/i.test(f.mimetype) && !isHeic(f)) {
        throw new BadRequestException(`文件「${this.fileName(f)}」不是照片（JPG/PNG/HEIC）或 PDF`);
      }
    }
    await this.saveFiles(id, files, doc.files.length);
    return this.getOne(id);
  }

  async updateMeta(id: string, patch: { title?: string | null; docDate?: string | null; remark?: string | null }) {
    await this.getOne(id);
    await this.prisma.careDocument.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title?.trim() || null } : {}),
        ...(patch.docDate !== undefined ? { docDate: patch.docDate ? new Date(patch.docDate) : null } : {}),
        ...(patch.remark !== undefined ? { remark: patch.remark?.trim() || null } : {}),
        version: { increment: 1 },
      },
    });
    return this.getOne(id);
  }

  async reextract(id: string) {
    const doc = await this.getOne(id);
    if (!this.extraction.isStructured(doc.docType)) throw new BadRequestException('这类资料只做拍照留档，不需要识别');
    if (doc.files.length === 0) throw new BadRequestException('还没有上传照片');
    if (doc.extractStatus === 'PENDING' || doc.extractStatus === 'RUNNING') throw new ConflictException('正在识别中，请稍候');
    await this.prisma.careDocument.update({ where: { id }, data: { extractStatus: 'PENDING', extractError: null } });
    this.extraction.enqueue(id);
    return this.getOne(id);
  }

  /**
   * 只有还没入库的草稿（拍错了/不要了）才能删；已确认的原件永久保留。
   * 例外：只留档类的资料（风险告知书/宣教/呛奶预案等）上传后 24 小时内允许删除，方便处理传错照片。
   */
  async remove(id: string): Promise<void> {
    const doc = await this.getOne(id);
    const recentArchiveOnly = !this.extraction.isStructured(doc.docType) && Date.now() - doc.createdAt.getTime() < 24 * 3600 * 1000;
    if (doc.status === 'CONFIRMED' && !recentArchiveOnly) throw new ConflictException('已确认归档的资料不能删除（原件需永久保留）；只留档类资料上传后 24 小时内可以删除');
    const linked =
      (await this.prisma.careMotherAdmission.count({ where: { documentId: id } })) +
      (await this.prisma.careBabyAdmission.count({ where: { documentId: id } })) +
      (await this.prisma.careMotherDischarge.count({ where: { documentId: id } })) +
      (await this.prisma.careBabyDischarge.count({ where: { documentId: id } }));
    if (linked > 0) throw new ConflictException('这份资料已被评估表引用，不能删除');
    await this.prisma.careDocument.delete({ where: { id } });
    await this.storage.removeDocumentDir(id);
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'CareDocument',
      entityId: id,
      beforeData: { docType: doc.docType, files: doc.files.length } as Prisma.InputJsonValue,
      tenantId: this.ctx.tenantId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
  }

  async openFile(id: string, fileId: string) {
    const file = await this.prisma.careDocumentFile.findFirst({ where: { id: fileId, documentId: id, tenantId: this.ctx.tenantId } });
    if (!file) throw new NotFoundException('文件不存在');
    const { stream, size } = await this.storage.readStream(file.storagePath);
    return { stream, size, mimeType: file.mimeType, fileName: file.fileName };
  }

  // ---------------- 内部 ----------------

  private fileName(f: Express.Multer.File): string {
    // multer 把非 ASCII 文件名按 latin1 解码，这里还原成 UTF-8，避免中文名乱码
    return Buffer.from(f.originalname, 'latin1').toString('utf8');
  }

  /** 保存文件：HEIC 转 JPEG 展示（原图一并保留）；其他照片和 PDF 原样保存。 */
  private async saveFiles(documentId: string, files: Express.Multer.File[], startOrder: number): Promise<void> {
    let order = startOrder;
    for (const f of files) {
      const name = this.fileName(f);
      const stamp = Date.now();
      let storagePath: string;
      let originalPath: string | null = null;
      let mimeType = isPdf(f) ? 'application/pdf' : f.mimetype;
      let displayName = name;
      let size = f.size;
      if (isHeic(f)) {
        let jpeg: Buffer;
        try {
          jpeg = await this.aiGateway.normalizeImage(f.buffer);
        } catch (err) {
          throw new BadRequestException(`苹果 HEIC 照片转换失败（${(err as Error).message}）。请在手机上把照片分享为 JPG 再上传，或检查 AI 服务是否在运行`);
        }
        originalPath = await this.storage.save(documentId, `${stamp}-orig-${name}`, f.buffer);
        displayName = name.replace(/\.[^.]+$/, '') + '.jpg';
        storagePath = await this.storage.save(documentId, `${stamp}-${displayName}`, jpeg);
        mimeType = 'image/jpeg';
        size = jpeg.length;
      } else {
        storagePath = await this.storage.save(documentId, `${stamp}-${name}`, f.buffer);
      }
      await this.prisma.careDocumentFile.create({
        data: {
          tenantId: this.ctx.tenantId!,
          documentId,
          fileName: displayName,
          storagePath,
          originalPath,
          mimeType,
          sizeBytes: size,
          sortOrder: order++,
          createdBy: this.ctx.accountId!,
        },
      });
    }
  }

  /** 确定这份资料挂在哪个妈妈/宝宝档案下，并取出门店。宝宝类资料必须指定宝宝档案。 */
  private async resolveOwner(meta: UploadMeta): Promise<{ motherProfileId: string; babyProfileId: string | null; storeId: string }> {
    const tenantId = this.ctx.tenantId;
    if (meta.docType === 'BABY_ADMISSION' || meta.docType === 'BABY_DISCHARGE' || meta.babyProfileId) {
      if (!meta.babyProfileId) throw new BadRequestException('宝宝的资料请选择是哪个宝宝');
      const baby = await this.prisma.babyProfile.findFirst({ where: { id: meta.babyProfileId, tenantId } });
      if (!baby) throw new NotFoundException('宝宝档案不存在');
      if (meta.motherProfileId && meta.motherProfileId !== baby.motherProfileId) throw new BadRequestException('宝宝档案和妈妈档案不匹配');
      return { motherProfileId: baby.motherProfileId, babyProfileId: baby.id, storeId: baby.storeId };
    }
    if (!meta.motherProfileId) throw new BadRequestException('请指定妈妈档案');
    const mother = await this.prisma.motherProfile.findFirst({ where: { id: meta.motherProfileId, tenantId } });
    if (!mother) throw new NotFoundException('妈妈档案不存在');
    return { motherProfileId: mother.id, babyProfileId: null, storeId: mother.storeId };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, ReadStream } from 'fs';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import * as path from 'path';

/**
 * 护理档案纸质资料（照片/PDF）的磁盘存储，做法同合同存储。
 * 根目录由环境变量 CARE_STORAGE_DIR 指定，默认 apps/api/storage/care（被 .gitignore 忽略）。
 * 数据库里只存"相对根目录的路径"，扩容/换盘时整个目录搬走、改环境变量即可。
 * 注意：原件是唯一凭证，生产环境的备份脚本必须把这个目录一起备份（见待完善清单 E2/E4）。
 */
@Injectable()
export class CareStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.get<string>('CARE_STORAGE_DIR') ?? path.join(process.cwd(), 'storage', 'care'));
  }

  async save(documentId: string, fileName: string, data: Buffer): Promise<string> {
    const rel = path.posix.join(documentId, CareStorageService.safeName(fileName));
    const abs = this.resolve(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return rel;
  }

  async readBuffer(rel: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(rel));
    } catch {
      throw new NotFoundException('文件不存在或已被移动');
    }
  }

  async readStream(rel: string): Promise<{ stream: ReadStream; size: number }> {
    const abs = this.resolve(rel);
    try {
      const info = await stat(abs);
      return { stream: createReadStream(abs), size: info.size };
    } catch {
      throw new NotFoundException('文件不存在或已被移动');
    }
  }

  async removeDocumentDir(documentId: string): Promise<void> {
    await rm(this.resolve(documentId), { recursive: true, force: true });
  }

  private resolve(rel: string): string {
    const abs = path.resolve(this.root, rel);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) throw new NotFoundException('非法的文件路径');
    return abs;
  }

  static safeName(name: string): string {
    const base = path.basename(name).replace(/[^\p{L}\p{N}._\-()（）]/gu, '_');
    return base.length > 0 ? base.slice(-120) : 'file';
  }
}

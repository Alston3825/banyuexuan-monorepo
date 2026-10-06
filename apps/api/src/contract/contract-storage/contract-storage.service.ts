import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, ReadStream } from 'fs';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import * as path from 'path';

/**
 * 合同原件与页面图片的磁盘存储。
 * 根目录由环境变量 CONTRACT_STORAGE_DIR 指定，默认 apps/api/storage/contracts（被 .gitignore 忽略）。
 * 数据库里只存"相对根目录的路径"，服务器扩容、换盘时把整个目录搬走、改一下环境变量即可。
 * 注意：原件是唯一凭证，生产环境的备份脚本必须把这个目录一起备份（见部署手册）。
 */
@Injectable()
export class ContractStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.get<string>('CONTRACT_STORAGE_DIR') ?? path.join(process.cwd(), 'storage', 'contracts'));
  }

  /** 保存文件，返回相对路径（存进数据库）。 */
  async save(contractId: string, subDir: 'orig' | 'pages', fileName: string, data: Buffer): Promise<string> {
    const rel = path.posix.join(contractId, subDir, ContractStorageService.safeName(fileName));
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

  /** 只清掉逐页图片目录（重新识别前用），原件保留。 */
  async removePagesDir(contractId: string): Promise<void> {
    await rm(this.resolve(path.posix.join(contractId, 'pages')), { recursive: true, force: true });
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

  /** 删除某份合同的全部文件（删除待核对合同时用）。 */
  async removeContractDir(contractId: string): Promise<void> {
    await rm(this.resolve(contractId), { recursive: true, force: true });
  }

  /** 拼出绝对路径，并保证结果仍然在存储根目录内（防 ../ 路径穿越）。 */
  private resolve(rel: string): string {
    const abs = path.resolve(this.root, rel);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new NotFoundException('非法的文件路径');
    }
    return abs;
  }

  /** 文件名只保留安全字符，避免特殊字符/路径分隔符；保留中文和扩展名。 */
  static safeName(name: string): string {
    const base = path.basename(name).replace(/[^\p{L}\p{N}._\-()（）]/gu, '_');
    return base.length > 0 ? base.slice(-120) : 'file';
  }
}

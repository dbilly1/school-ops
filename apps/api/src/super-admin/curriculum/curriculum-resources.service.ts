import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EducationLevelType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CreateCurriculumResourceDto, UploadedFileLike } from './dto/curriculum-resource.dto';

@Injectable()
export class CurriculumResourcesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  findAll(levelType?: EducationLevelType) {
    return this.prisma.curriculumResource.findMany({
      where: levelType ? { levelType } : {},
      orderBy: [{ levelType: 'asc' }, { subjectName: 'asc' }, { title: 'asc' }],
    });
  }

  async create(dto: CreateCurriculumResourceDto, file: UploadedFileLike) {
    if (!file) throw new BadRequestException('A file is required.');
    // Sanitise the original name for the storage key; keep a readable fileName.
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `resources/${randomUUID()}-${safe}`;

    await this.storage.upload(fileKey, file.buffer, file.mimetype);

    return this.prisma.curriculumResource.create({
      data: {
        levelType: dto.levelType,
        subjectName: dto.subjectName.trim(),
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        fileKey,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype || null,
      },
    });
  }

  async download(id: string) {
    const resource = await this.prisma.curriculumResource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found');
    return { url: await this.storage.signedUrl(resource.fileKey) };
  }

  async delete(id: string) {
    const resource = await this.prisma.curriculumResource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found');
    await this.storage.remove(resource.fileKey);
    await this.prisma.curriculumResource.delete({ where: { id } });
    return { deleted: true };
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCurriculumLinkDto, UpdateCurriculumLinkDto } from './dto/curriculum-link.dto';

@Injectable()
export class CurriculumService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ── Shared GES library (read-only to schools) ────────────────────────────

  // Scope the shared library to the level bands this school actually runs; if the
  // school hasn't tagged any grade levels yet, show everything.
  async listResources(schoolId: string) {
    const levels = await this.prisma.gradeLevel.findMany({
      where: { schoolId, levelType: { not: null } },
      select: { levelType: true },
      distinct: ['levelType'],
    });
    const types = levels.map((l) => l.levelType!).filter(Boolean);
    return this.prisma.curriculumResource.findMany({
      where: types.length ? { levelType: { in: types } } : {},
      orderBy: [{ levelType: 'asc' }, { subjectName: 'asc' }, { title: 'asc' }],
    });
  }

  async downloadResource(id: string) {
    const resource = await this.prisma.curriculumResource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found');
    return { url: await this.storage.signedUrl(resource.fileKey) };
  }

  // ── Per-school links ──────────────────────────────────────────────────────

  listLinks(schoolId: string) {
    return this.prisma.schoolCurriculumLink.findMany({
      where: { schoolId },
      orderBy: [{ levelType: 'asc' }, { subjectName: 'asc' }, { title: 'asc' }],
    });
  }

  createLink(schoolId: string, userId: string, dto: CreateCurriculumLinkDto) {
    const url = dto.url.trim();
    if (!/^https?:\/\//i.test(url)) throw new BadRequestException('Enter a valid http(s) link.');
    return this.prisma.schoolCurriculumLink.create({
      data: {
        schoolId,
        createdBy: userId,
        title: dto.title.trim(),
        url,
        levelType: dto.levelType ?? null,
        subjectName: dto.subjectName?.trim() || null,
        description: dto.description?.trim() || null,
      },
    });
  }

  async updateLink(schoolId: string, id: string, dto: UpdateCurriculumLinkDto) {
    const link = await this.prisma.schoolCurriculumLink.findFirst({ where: { id, schoolId } });
    if (!link) throw new NotFoundException('Link not found');
    if (dto.url !== undefined && !/^https?:\/\//i.test(dto.url.trim())) {
      throw new BadRequestException('Enter a valid http(s) link.');
    }
    return this.prisma.schoolCurriculumLink.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
        ...(dto.levelType !== undefined ? { levelType: dto.levelType } : {}),
        ...(dto.subjectName !== undefined ? { subjectName: dto.subjectName.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      },
    });
  }

  async deleteLink(schoolId: string, id: string) {
    const link = await this.prisma.schoolCurriculumLink.findFirst({ where: { id, schoolId } });
    if (!link) throw new NotFoundException('Link not found');
    await this.prisma.schoolCurriculumLink.delete({ where: { id } });
    return { deleted: true };
  }
}

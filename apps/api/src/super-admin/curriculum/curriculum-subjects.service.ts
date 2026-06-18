import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCurriculumSubjectDto, UpdateCurriculumSubjectDto } from './dto/curriculum-subject.dto';

@Injectable()
export class CurriculumSubjectsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.curriculumSubject.findMany({
      orderBy: [{ levelType: 'asc' }, { sequence: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCurriculumSubjectDto) {
    const existing = await this.prisma.curriculumSubject.findFirst({
      where: { levelType: dto.levelType, name: dto.name },
    });
    if (existing) throw new ConflictException('A subject with this name already exists for that level');
    return this.prisma.curriculumSubject.create({ data: { ...dto, sequence: dto.sequence ?? 0 } });
  }

  async update(id: string, dto: UpdateCurriculumSubjectDto) {
    const row = await this.prisma.curriculumSubject.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Curriculum subject not found');
    return this.prisma.curriculumSubject.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const row = await this.prisma.curriculumSubject.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Curriculum subject not found');
    return this.prisma.curriculumSubject.delete({ where: { id } });
  }
}

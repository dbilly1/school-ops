import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentCategoryDto, BulkCreateCategoriesDto } from './dto/student-category.dto';

@Injectable()
export class StudentCategoriesService {
  constructor(private prisma: PrismaService) {}

  async bulkCreate(schoolId: string, dto: BulkCreateCategoriesDto) {
    const names = [...new Set(dto.names.map(n => n.trim()).filter(Boolean))];
    if (names.length === 0) return { created: [] };

    // Skip names that already exist
    const existing = await this.prisma.studentCategory.findMany({
      where: { schoolId, name: { in: names } },
      select: { name: true },
    });
    const existingNames = new Set(existing.map(e => e.name));
    const toCreate = names.filter(n => !existingNames.has(n));

    if (toCreate.length === 0) return { created: [] };

    await this.prisma.studentCategory.createMany({
      data: toCreate.map(name => ({ schoolId, name })),
    });

    return { created: toCreate };
  }

  findAll(schoolId: string) {
    return this.prisma.studentCategory.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  async create(schoolId: string, dto: CreateStudentCategoryDto) {
    const existing = await this.prisma.studentCategory.findFirst({
      where: { schoolId, name: dto.name },
    });
    if (existing) throw new ConflictException('Category already exists');
    return this.prisma.studentCategory.create({ data: { schoolId, name: dto.name } });
  }

  async delete(schoolId: string, id: string) {
    const cat = await this.prisma.studentCategory.findFirst({ where: { id, schoolId } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.studentCategory.delete({ where: { id } });
  }
}

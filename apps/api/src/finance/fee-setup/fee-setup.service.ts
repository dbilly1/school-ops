import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFeeComponentDto, UpdateFeeComponentDto, SaveFeeItemsDto,
} from './dto/fee-setup.dto';

@Injectable()
export class FeeSetupService {
  constructor(private prisma: PrismaService) {}

  // ── Fee component catalog ───────────────────────────────────────────────

  findComponents(schoolId: string, includeArchived = false) {
    return this.prisma.feeComponent.findMany({
      where: { schoolId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    });
  }

  async createComponent(schoolId: string, dto: CreateFeeComponentDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Component name is required');

    const existing = await this.prisma.feeComponent.findFirst({ where: { schoolId, name } });
    if (existing) throw new ConflictException('A fee component with this name already exists');

    // Append to the end of the catalog.
    const last = await this.prisma.feeComponent.findFirst({
      where: { schoolId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return this.prisma.feeComponent.create({
      data: {
        schoolId, name, sequence: (last?.sequence ?? -1) + 1,
        ...(dto.billingFrequency ? { billingFrequency: dto.billingFrequency } : {}),
      },
    });
  }

  async updateComponent(schoolId: string, id: string, dto: UpdateFeeComponentDto) {
    const component = await this.prisma.feeComponent.findFirst({ where: { id, schoolId } });
    if (!component) throw new NotFoundException('Fee component not found');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Component name is required');
      const clash = await this.prisma.feeComponent.findFirst({
        where: { schoolId, name, id: { not: id } },
      });
      if (clash) throw new ConflictException('A fee component with this name already exists');
    }

    return this.prisma.feeComponent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.billingFrequency !== undefined ? { billingFrequency: dto.billingFrequency } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
    });
  }

  // Hard-delete only when unused; otherwise the caller should archive instead,
  // because invoice line items snapshot the name and keep a (nullable) link.
  async deleteComponent(schoolId: string, id: string) {
    const component = await this.prisma.feeComponent.findFirst({ where: { id, schoolId } });
    if (!component) throw new NotFoundException('Fee component not found');

    const usedInItems = await this.prisma.feeItem.count({ where: { feeComponentId: id } });
    if (usedInItems > 0)
      throw new ConflictException(
        'This component is used in a fee setup. Remove it from those fees first, or archive it instead.',
      );

    // Detach from any historical invoice lines (keeps their name snapshot) then delete.
    await this.prisma.invoiceItem.updateMany({
      where: { feeComponentId: id },
      data: { feeComponentId: null },
    });
    return this.prisma.feeComponent.delete({ where: { id } });
  }

  // ── Fee items (per student category × term) ─────────────────────────────

  async getFeeItems(schoolId: string, studentCategoryId: string) {
    const items = await this.prisma.feeItem.findMany({
      where: { schoolId, studentCategoryId },
      include: { overrides: { select: { gradeLevelId: true, amount: true } } },
    });

    return items.map((it) => ({
      feeComponentId: it.feeComponentId,
      defaultAmount: Number(it.defaultAmount),
      overrides: it.overrides.map((o) => ({
        gradeLevelId: o.gradeLevelId,
        amount: Number(o.amount),
      })),
    }));
  }

  async saveFeeItems(schoolId: string, dto: SaveFeeItemsDto) {
    const { studentCategoryId } = dto;

    const category = await this.prisma.studentCategory.findFirst({ where: { id: studentCategoryId, schoolId } });
    if (!category) throw new NotFoundException('Student category not found');

    // Validate that the referenced components/grade levels belong to this school.
    const [components, gradeLevels] = await Promise.all([
      this.prisma.feeComponent.findMany({ where: { schoolId }, select: { id: true } }),
      this.prisma.gradeLevel.findMany({ where: { schoolId }, select: { id: true } }),
    ]);
    const componentIds = new Set(components.map((c) => c.id));
    const gradeIds = new Set(gradeLevels.map((g) => g.id));

    for (const item of dto.items) {
      if (!componentIds.has(item.feeComponentId))
        throw new BadRequestException('Unknown fee component in payload');
      for (const ov of item.overrides) {
        if (!gradeIds.has(ov.gradeLevelId))
          throw new BadRequestException('Unknown grade level in override');
      }
    }
    // Guard against duplicate components in the same payload.
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.feeComponentId))
        throw new BadRequestException('Duplicate fee component in payload');
      seen.add(item.feeComponentId);
    }

    await this.prisma.$transaction(async (tx) => {
      // Replace the whole category set: drop existing items not in the payload,
      // then upsert each item and rewrite its overrides.
      const existing = await tx.feeItem.findMany({
        where: { schoolId, studentCategoryId },
        select: { id: true, feeComponentId: true },
      });
      const keepComponentIds = new Set(dto.items.map((i) => i.feeComponentId));
      const toDelete = existing.filter((e) => !keepComponentIds.has(e.feeComponentId));
      if (toDelete.length > 0) {
        await tx.feeItem.deleteMany({ where: { id: { in: toDelete.map((e) => e.id) } } });
      }

      for (const item of dto.items) {
        const saved = await tx.feeItem.upsert({
          where: {
            schoolId_studentCategoryId_feeComponentId: {
              schoolId, studentCategoryId, feeComponentId: item.feeComponentId,
            },
          },
          create: {
            schoolId, studentCategoryId,
            feeComponentId: item.feeComponentId,
            defaultAmount: item.defaultAmount,
          },
          update: { defaultAmount: item.defaultAmount },
        });

        // Rewrite overrides (simplest correct approach for a small set).
        await tx.feeItemOverride.deleteMany({ where: { feeItemId: saved.id } });
        const overrides = item.overrides.filter((o) => o.amount > 0);
        if (overrides.length > 0) {
          await tx.feeItemOverride.createMany({
            data: overrides.map((o) => ({
              feeItemId: saved.id, gradeLevelId: o.gradeLevelId, amount: o.amount,
            })),
          });
        }
      }
    });

    return { saved: dto.items.length };
  }
}

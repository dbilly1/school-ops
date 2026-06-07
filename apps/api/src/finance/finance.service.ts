import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFeeStructureDto, CreateInvoiceDto,
  RecordPaymentDto, AssignStudentCategoryDto,
  BulkCreateFeeStructuresDto, SaveFeeMatrixDto,
} from './dto/finance.dto';

type InvoiceStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

function invoiceStatus(amount: number, amountPaid: number): InvoiceStatus {
  if (amountPaid >= amount) return 'PAID';
  if (amountPaid > 0) return 'PARTIAL';
  return 'UNPAID';
}

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  // ── Fee Structures ────────────────────────────────────────

  async findFeeStructures(schoolId: string, termId?: string) {
    return this.prisma.feeStructure.findMany({
      where: { schoolId, ...(termId ? { termId } : {}) },
      include: {
        gradeLevel: { select: { id: true, name: true } },
        studentCategory: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
      },
      orderBy: [{ gradeLevel: { sequence: 'asc' } }, { studentCategory: { name: 'asc' } }],
    });
  }

  async bulkCreateFeeStructures(schoolId: string, dto: BulkCreateFeeStructuresDto) {
    const results = await Promise.all(
      dto.entries.map(async (entry) => {
        const existing = await this.prisma.feeStructure.findFirst({
          where: { schoolId, gradeLevelId: entry.gradeLevelId, studentCategoryId: dto.studentCategoryId, termId: dto.termId },
        });
        if (existing) {
          // Update amount if already exists
          return this.prisma.feeStructure.update({
            where: { id: existing.id },
            data: { amount: entry.amount },
          });
        }
        return this.prisma.feeStructure.create({
          data: { schoolId, gradeLevelId: entry.gradeLevelId, studentCategoryId: dto.studentCategoryId, termId: dto.termId, amount: entry.amount },
        });
      }),
    );
    return { saved: results.length };
  }

  async saveFeeMatrix(schoolId: string, dto: SaveFeeMatrixDto) {
    if (dto.cells.length === 0) return { saved: 0 };

    // Upsert every cell in parallel
    const results = await Promise.all(
      dto.cells.map(async (cell) => {
        const existing = await this.prisma.feeStructure.findFirst({
          where: {
            schoolId,
            gradeLevelId:      cell.gradeLevelId,
            studentCategoryId: cell.studentCategoryId,
            termId:            dto.termId,
          },
        });
        if (existing) {
          return this.prisma.feeStructure.update({
            where: { id: existing.id },
            data: { amount: cell.amount },
          });
        }
        return this.prisma.feeStructure.create({
          data: {
            schoolId,
            gradeLevelId:      cell.gradeLevelId,
            studentCategoryId: cell.studentCategoryId,
            termId:            dto.termId,
            amount:            cell.amount,
          },
        });
      }),
    );
    return { saved: results.length };
  }

  async createFeeStructure(schoolId: string, dto: CreateFeeStructureDto) {
    const existing = await this.prisma.feeStructure.findFirst({
      where: { schoolId, gradeLevelId: dto.gradeLevelId, studentCategoryId: dto.studentCategoryId, termId: dto.termId },
    });
    if (existing) throw new ConflictException('Fee structure already exists for this combination');

    return this.prisma.feeStructure.create({
      data: { schoolId, ...dto },
      include: {
        gradeLevel: { select: { id: true, name: true } },
        studentCategory: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
      },
    });
  }

  async updateFeeStructure(schoolId: string, id: string, amount: number) {
    const structure = await this.prisma.feeStructure.findFirst({ where: { id, schoolId } });
    if (!structure) throw new NotFoundException('Fee structure not found');
    return this.prisma.feeStructure.update({ where: { id }, data: { amount } });
  }

  async deleteFeeStructure(schoolId: string, id: string) {
    const structure = await this.prisma.feeStructure.findFirst({ where: { id, schoolId } });
    if (!structure) throw new NotFoundException('Fee structure not found');
    return this.prisma.feeStructure.delete({ where: { id } });
  }

  // ── Student Category Assignment ───────────────────────────

  async assignStudentCategory(schoolId: string, studentId: string, dto: AssignStudentCategoryDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    const category = await this.prisma.studentCategory.findFirst({
      where: { id: dto.studentCategoryId, schoolId },
    });
    if (!category) throw new NotFoundException('Student category not found');

    return this.prisma.student.update({
      where: { id: studentId },
      data: { studentCategoryId: dto.studentCategoryId },
      select: { id: true, studentId: true, studentCategoryId: true },
    });
  }

  // ── Invoices ──────────────────────────────────────────────

  async findInvoices(schoolId: string, termId?: string, classId?: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        ...(termId ? { termId } : {}),
        ...(classId
          ? { student: { classAssignments: { some: { classId } } } }
          : {}),
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
        term: { select: { id: true, name: true } },
        _count: { select: { payments: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return invoices.map((inv) => {
      const amount     = Number(inv.amount);
      const amountPaid = Number(inv.amountPaid);
      return {
        ...inv,
        amount,
        amountPaid,
        balance: amount - amountPaid,
        status:  invoiceStatus(amount, amountPaid),
      };
    });
  }

  async findInvoice(schoolId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, schoolId },
      include: {
        student: {
          select: {
            id: true, studentId: true, firstName: true, lastName: true,
            studentCategory: { select: { id: true, name: true } },
          },
        },
        term: { select: { id: true, name: true, academicYearId: true } },
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: { recordedByUser: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // Grade level isn't on the invoice — resolve it via the student's class
    // assignment for this term's academic year.
    const assignment = await this.prisma.studentClassAssignment.findFirst({
      where: { studentId: invoice.studentId, academicYearId: invoice.term.academicYearId },
      select: { class: { select: { gradeLevel: { select: { id: true, name: true } } } } },
    });

    const amount     = Number(invoice.amount);
    const amountPaid = Number(invoice.amountPaid);
    return {
      ...invoice,
      amount,
      amountPaid,
      balance: amount - amountPaid,
      isPaid:  amountPaid >= amount,
      status:  invoiceStatus(amount, amountPaid),
      gradeLevel:      assignment?.class.gradeLevel ?? null,
      studentCategory: invoice.student.studentCategory ?? null,
      payments: invoice.payments.map((p) => ({
        ...p,
        amount: Number(p.amount),
        recordedBy: p.recordedByUser,
      })),
    };
  }

  async createInvoice(schoolId: string, dto: CreateInvoiceDto) {
    const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const existing = await this.prisma.invoice.findFirst({
      where: { schoolId, studentId: dto.studentId, termId: dto.termId },
    });
    if (existing) throw new ConflictException('Invoice already exists for this student and term');

    return this.prisma.invoice.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        termId: dto.termId,
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes,
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
        term: { select: { id: true, name: true } },
      },
    });
  }

  // Auto-generate invoices for all students in a term from fee structures
  async generateTermInvoices(schoolId: string, termId: string) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: {
        academicYearId: term.academicYearId,
        class: { schoolId },
      },
      include: {
        student: {
          select: { id: true, studentId: true, studentCategoryId: true },
        },
        class: { select: { gradeLevelId: true } },
      },
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const { student, class: cls } of assignments) {
      if (!student.studentCategoryId) {
        errors.push(`${student.studentId}: no student category assigned`);
        skipped++;
        continue;
      }

      const existing = await this.prisma.invoice.findFirst({
        where: { schoolId, studentId: student.id, termId },
      });
      if (existing) { skipped++; continue; }

      const feeStructure = await this.prisma.feeStructure.findFirst({
        where: {
          schoolId,
          gradeLevelId: cls.gradeLevelId,
          studentCategoryId: student.studentCategoryId,
          termId,
        },
      });

      if (!feeStructure) {
        errors.push(`${student.studentId}: no fee structure for grade level + category`);
        skipped++;
        continue;
      }

      await this.prisma.invoice.create({
        data: { schoolId, studentId: student.id, termId, amount: feeStructure.amount },
      });
      created++;
    }

    return { created, skipped, errors, termId };
  }

  // ── Payments ──────────────────────────────────────────────

  async recordPayment(schoolId: string, invoiceId: string, dto: RecordPaymentDto, recordedBy: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.prisma.$transaction(async (tx) => {
      // Atomic increment (not read-modify-write) so concurrent payments can't
      // lose an update; validate the resulting total inside the transaction so
      // an over-payment rolls back.
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid: { increment: dto.amount } },
      });
      if (Number(updated.amountPaid) > Number(updated.amount))
        throw new BadRequestException(
          `Payment of ${dto.amount} would exceed invoice amount of ${updated.amount}`,
        );

      const payment = await tx.payment.create({
        data: {
          schoolId,
          invoiceId,
          amount: dto.amount,
          paymentDate: new Date(dto.paymentDate),
          method: dto.method,
          reference: dto.reference,
          recordedBy,
        },
      });

      return {
        payment,
        invoice: {
          id: invoiceId,
          amount: updated.amount,
          amountPaid: updated.amountPaid,
          balance: Number(updated.amount) - Number(updated.amountPaid),
          isPaid: Number(updated.amountPaid) >= Number(updated.amount),
        },
      };
    });
  }

  // ── Outstanding Balances ──────────────────────────────────

  async getOutstandingBalances(schoolId: string, termId: string, classId?: string) {
    const term = await this.prisma.term.findFirst({
      where: { id: termId, schoolId },
      select: { academicYearId: true },
    });

    const invoices = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        termId,
        ...(classId ? { student: { classAssignments: { some: { classId } } } } : {}),
      },
      include: {
        student: {
          select: {
            id: true, studentId: true, firstName: true, lastName: true,
            classAssignments: {
              ...(term ? { where: { academicYearId: term.academicYearId } } : {}),
              select: { class: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
    });

    const now = Date.now();

    const outstanding = invoices
      .map((inv) => {
        const amount     = Number(inv.amount);
        const amountPaid = Number(inv.amountPaid);
        const overdueMs  = inv.dueDate ? now - inv.dueDate.getTime() : 0;
        return {
          invoiceId: inv.id,
          student: {
            id: inv.student.id,
            studentId: inv.student.studentId,
            firstName: inv.student.firstName,
            lastName: inv.student.lastName,
          },
          class: inv.student.classAssignments[0]?.class ?? null,
          amount,
          amountPaid,
          balance: amount - amountPaid,
          daysOverdue: inv.dueDate && overdueMs > 0 ? Math.floor(overdueMs / 86_400_000) : null,
          isPaid: amountPaid >= amount,
        };
      })
      .filter((inv) => !inv.isPaid)
      .sort((a, b) => b.balance - a.balance);

    const totalOutstanding = outstanding.reduce((sum, inv) => sum + inv.balance, 0);

    return {
      termId,
      totalStudents: invoices.length,
      studentsWithBalance: outstanding.length,
      totalOutstanding,
      invoices: outstanding,
    };
  }
}

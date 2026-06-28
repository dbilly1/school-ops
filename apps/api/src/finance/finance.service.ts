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
        items: { orderBy: { sequence: 'asc' } },
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
      items: invoice.items.map((it) => ({
        id: it.id,
        name: it.name,
        amount: Number(it.amount),
        feeComponentId: it.feeComponentId,
        isCarryForward: it.isCarryForward,
        sequence: it.sequence,
      })),
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

  // Chronological order key for a term: academic-year start (then term sequence)
  // so "previous term" works across year boundaries. Falls back to the year's
  // createdAt-less ordering via the term's own startDate when years lack dates.
  // Also returns termId → academicYearId (for "first invoice this year" checks).
  private async buildTermMaps(schoolId: string): Promise<{ order: Map<string, number>; termToYear: Map<string, string> }> {
    const terms = await this.prisma.term.findMany({
      where: { schoolId },
      select: {
        id: true, sequence: true, startDate: true, academicYearId: true,
        academicYear: { select: { startDate: true, name: true } },
      },
    });
    const sorted = terms.slice().sort((a, b) => {
      const ay = a.academicYear.startDate?.getTime() ?? 0;
      const by = b.academicYear.startDate?.getTime() ?? 0;
      if (ay !== by) return ay - by;
      const an = a.academicYear.name.localeCompare(b.academicYear.name, undefined, { numeric: true });
      if (an !== 0) return an;
      return a.sequence - b.sequence;
    });
    return {
      order: new Map(sorted.map((t, i) => [t.id, i])),
      termToYear: new Map(terms.map((t) => [t.id, t.academicYearId])),
    };
  }

  // Auto-generate invoices for all students in a term, breaking each bill into
  // its fee components plus a "Balance brought forward" line carrying the
  // student's unpaid balance from their previous term.
  async generateTermInvoices(schoolId: string, termId: string) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { academicYearId: term.academicYearId, class: { schoolId } },
      include: {
        student: { select: { id: true, studentId: true, studentCategoryId: true } },
        class: { select: { gradeLevelId: true } },
      },
    });

    // Preload the school's fee items (term-agnostic — the current "terminal" fee)
    // with overrides + component, grouped by category, so we don't query per
    // student. The component carries its billing frequency.
    const feeItems = await this.prisma.feeItem.findMany({
      where: { schoolId },
      include: {
        component: { select: { id: true, name: true, sequence: true, billingFrequency: true } },
        overrides: { select: { gradeLevelId: true, amount: true } },
      },
    });
    const itemsByCategory = new Map<string, typeof feeItems>();
    for (const item of feeItems) {
      const list = itemsByCategory.get(item.studentCategoryId) ?? [];
      list.push(item);
      itemsByCategory.set(item.studentCategoryId, list);
    }

    const { order, termToYear } = await this.buildTermMaps(schoolId);
    const currentOrder = order.get(termId) ?? 0;
    const studentIds = assignments.map((a) => a.student.id);
    const priorInvoices = await this.prisma.invoice.findMany({
      where: { schoolId, studentId: { in: studentIds } },
      select: { studentId: true, termId: true, amount: true, amountPaid: true },
    });

    // Per student: carry-forward (balance of the latest strictly-earlier term),
    // whether they've ever been invoiced (ONE_TIME components), and whether
    // they've been invoiced already this academic year (PER_YEAR components).
    const carryByStudent = new Map<string, number>();
    const carryMeta = new Map<string, number>(); // studentId → order index of chosen prior term
    const hasAnyInvoice = new Set<string>();
    const hasInvoiceThisYear = new Set<string>();
    for (const inv of priorInvoices) {
      hasAnyInvoice.add(inv.studentId);
      if (termToYear.get(inv.termId) === term.academicYearId) hasInvoiceThisYear.add(inv.studentId);
      const ord = order.get(inv.termId) ?? -1;
      if (ord < 0 || ord >= currentOrder) continue; // carry only from strictly-earlier terms
      const prevOrd = carryMeta.get(inv.studentId) ?? -1;
      if (ord > prevOrd) {
        const balance = Number(inv.amount) - Number(inv.amountPaid);
        carryByStudent.set(inv.studentId, balance > 0 ? balance : 0);
        carryMeta.set(inv.studentId, ord);
      }
    }

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

      // Build the fee component lines for this student's grade level, honouring
      // each component's billing frequency:
      //   ONE_TIME → only on the student's first invoice ever
      //   PER_YEAR → only on their first invoice of this academic year
      //   PER_TERM → every term
      const billedEver = hasAnyInvoice.has(student.id);
      const billedThisYear = hasInvoiceThisYear.has(student.id);
      const categoryItems = itemsByCategory.get(student.studentCategoryId) ?? [];
      const lines = categoryItems
        .filter((item) => {
          if (item.component.billingFrequency === 'ONE_TIME') return !billedEver;
          if (item.component.billingFrequency === 'PER_YEAR') return !billedThisYear;
          return true;
        })
        .map((item) => {
          const override = item.overrides.find((o) => o.gradeLevelId === cls.gradeLevelId);
          const amount = override ? Number(override.amount) : Number(item.defaultAmount);
          return { feeComponentId: item.feeComponentId, name: item.component.name, amount, sequence: item.component.sequence };
        })
        .filter((l) => l.amount > 0)
        .sort((a, b) => a.sequence - b.sequence);

      // Fallback to the flat FeeStructure total when no itemised setup exists
      // (legacy / simple schools), so generation keeps working unchanged.
      if (lines.length === 0) {
        const feeStructure = await this.prisma.feeStructure.findFirst({
          where: { schoolId, gradeLevelId: cls.gradeLevelId, studentCategoryId: student.studentCategoryId, termId },
        });
        if (feeStructure && Number(feeStructure.amount) > 0) {
          lines.push({ feeComponentId: null as any, name: 'School fees', amount: Number(feeStructure.amount), sequence: 0 });
        }
      }

      const carry = carryByStudent.get(student.id) ?? 0;
      if (lines.length === 0 && carry <= 0) {
        errors.push(`${student.studentId}: no fees set for grade level + category`);
        skipped++;
        continue;
      }

      const feesTotal = lines.reduce((sum, l) => sum + l.amount, 0);
      const total = feesTotal + carry;

      await this.prisma.invoice.create({
        data: {
          schoolId, studentId: student.id, termId, amount: total,
          items: {
            create: [
              ...(carry > 0
                ? [{ name: 'Balance brought forward', amount: carry, isCarryForward: true, sequence: -1 }]
                : []),
              ...lines.map((l, i) => ({
                feeComponentId: l.feeComponentId ?? undefined,
                name: l.name,
                amount: l.amount,
                sequence: i,
              })),
            ],
          },
        },
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

  // ── Recent Payments (transactions feed) ───────────────────

  async findRecentPayments(schoolId: string, limit = 50, termId?: string, method?: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        schoolId,
        ...(method ? { method } : {}),
        ...(termId ? { invoice: { termId } } : {}),
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        recordedByUser: { select: { firstName: true, lastName: true } },
        invoice: {
          select: {
            id: true,
            amount: true,
            amountPaid: true,
            term: { select: { id: true, name: true } },
            student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    return payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paymentDate: p.paymentDate,
      method: p.method,
      reference: p.reference,
      recordedBy: p.recordedByUser,
      invoice: {
        id: p.invoice.id,
        amount: Number(p.invoice.amount),
        amountPaid: Number(p.invoice.amountPaid),
        term: p.invoice.term,
        student: p.invoice.student,
      },
    }));
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

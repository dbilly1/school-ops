import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto, CreateExpenseDto, UpdateExpenseDto, SaveBudgetsDto } from './dto/expenses.dto';

const DEFAULT_CATEGORIES = ['Salaries', 'Utilities', 'Supplies', 'Rent', 'Maintenance', 'Transport', 'Other'];

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  // ── Categories ────────────────────────────────────────────

  // Seed the platform default categories the first time a school opens expenses.
  // Lazy (vs a migration) so existing live schools get them on first use too.
  private async ensureDefaultCategories(schoolId: string) {
    const count = await this.prisma.expenseCategory.count({ where: { schoolId } });
    if (count > 0) return;
    await this.prisma.expenseCategory.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({ schoolId, name })),
      skipDuplicates: true,
    });
  }

  async findCategories(schoolId: string) {
    await this.ensureDefaultCategories(schoolId);
    return this.prisma.expenseCategory.findMany({
      where: { schoolId },
      orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(schoolId: string, dto: CreateExpenseCategoryDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Category name is required');
    const existing = await this.prisma.expenseCategory.findFirst({ where: { schoolId, name } });
    if (existing) throw new ConflictException('A category with this name already exists');
    return this.prisma.expenseCategory.create({ data: { schoolId, name } });
  }

  async updateCategory(schoolId: string, id: string, dto: UpdateExpenseCategoryDto) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { id, schoolId } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Category name is required');
      const clash = await this.prisma.expenseCategory.findFirst({
        where: { schoolId, name, id: { not: id } },
      });
      if (clash) throw new ConflictException('A category with this name already exists');
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
    });
  }

  async deleteCategory(schoolId: string, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { id, schoolId } });
    if (!category) throw new NotFoundException('Category not found');

    const used = await this.prisma.expense.count({ where: { schoolId, categoryId: id } });
    if (used > 0) {
      // Preserve history — archive instead of hard-delete.
      const archived = await this.prisma.expenseCategory.update({
        where: { id },
        data: { isArchived: true },
      });
      return { archived: true, category: archived, message: 'Category has expenses, so it was archived instead of deleted.' };
    }

    await this.prisma.expenseBudget.deleteMany({ where: { schoolId, categoryId: id } });
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { archived: false, message: 'Category deleted.' };
  }

  // ── Expenses ──────────────────────────────────────────────

  async findExpenses(schoolId: string, termId?: string, categoryId?: string) {
    const expenses = await this.prisma.expense.findMany({
      where: { schoolId, ...(termId ? { termId } : {}), ...(categoryId ? { categoryId } : {}) },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        category: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        recordedByUser: { select: { firstName: true, lastName: true } },
      },
    });

    return expenses.map((e) => ({
      ...e,
      amount: Number(e.amount),
      recordedBy: e.recordedByUser,
    }));
  }

  async createExpense(schoolId: string, dto: CreateExpenseDto, recordedBy: string) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { id: dto.categoryId, schoolId } });
    if (!category) throw new NotFoundException('Category not found');

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    return this.prisma.expense.create({
      data: {
        schoolId,
        categoryId: dto.categoryId,
        termId: dto.termId,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        payee: dto.payee,
        method: dto.method,
        reference: dto.reference,
        notes: dto.notes,
        recordedBy,
      },
    });
  }

  async updateExpense(schoolId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({ where: { id, schoolId } });
    if (!expense) throw new NotFoundException('Expense not found');

    if (dto.categoryId) {
      const category = await this.prisma.expenseCategory.findFirst({ where: { id: dto.categoryId, schoolId } });
      if (!category) throw new NotFoundException('Category not found');
    }
    if (dto.termId) {
      const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
      if (!term) throw new NotFoundException('Term not found');
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.termId !== undefined ? { termId: dto.termId } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.expenseDate !== undefined ? { expenseDate: new Date(dto.expenseDate) } : {}),
        ...(dto.payee !== undefined ? { payee: dto.payee } : {}),
        ...(dto.method !== undefined ? { method: dto.method } : {}),
        ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }

  async deleteExpense(schoolId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, schoolId } });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.prisma.expense.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Budgets ───────────────────────────────────────────────

  async findBudgets(schoolId: string, termId: string) {
    const budgets = await this.prisma.expenseBudget.findMany({ where: { schoolId, termId } });
    return budgets.map((b) => ({ ...b, amount: Number(b.amount) }));
  }

  async saveBudgets(schoolId: string, dto: SaveBudgetsDto) {
    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const results = await Promise.all(
      dto.cells.map(async (cell) => {
        // A zero/blank budget means "no budget" — remove any existing row.
        if (!cell.amount || cell.amount <= 0) {
          await this.prisma.expenseBudget.deleteMany({
            where: { schoolId, categoryId: cell.categoryId, termId: dto.termId },
          });
          return null;
        }
        return this.prisma.expenseBudget.upsert({
          where: {
            schoolId_categoryId_termId: { schoolId, categoryId: cell.categoryId, termId: dto.termId },
          },
          create: { schoolId, categoryId: cell.categoryId, termId: dto.termId, amount: cell.amount },
          update: { amount: cell.amount },
        });
      }),
    );
    return { saved: results.filter(Boolean).length };
  }

  // ── Summary (income vs expense) ───────────────────────────

  async getSummary(schoolId: string, termId: string) {
    const term = await this.prisma.term.findFirst({
      where: { id: termId, schoolId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    // Income — school fees attributed by invoice term; feeding/transport cash
    // attributed by payment date falling inside the term window (those models
    // have no termId). When the term has no date range, we can't attribute the
    // daily-collection cash, so it stays 0.
    const dateWindow =
      term.startDate && term.endDate
        ? { paymentDate: { gte: term.startDate, lte: term.endDate } }
        : null;

    const [feeAgg, feedingAgg, transportAgg, expenses, budgets] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { schoolId, invoice: { termId } },
        _sum: { amount: true },
      }),
      dateWindow
        ? this.prisma.feedingPayment.aggregate({ where: { schoolId, ...dateWindow }, _sum: { amountPaid: true } })
        : Promise.resolve({ _sum: { amountPaid: null } } as any),
      dateWindow
        ? this.prisma.transportPayment.aggregate({ where: { schoolId, ...dateWindow }, _sum: { amountPaid: true } })
        : Promise.resolve({ _sum: { amountPaid: null } } as any),
      this.prisma.expense.findMany({
        where: { schoolId, termId },
        select: { amount: true, categoryId: true, category: { select: { name: true } } },
      }),
      this.prisma.expenseBudget.findMany({ where: { schoolId, termId } }),
    ]);

    const fees = Number(feeAgg._sum.amount ?? 0);
    const feeding = Number(feedingAgg._sum.amountPaid ?? 0);
    const transport = Number(transportAgg._sum.amountPaid ?? 0);
    const incomeTotal = fees + feeding + transport;

    // Expenses grouped by category
    const spentByCat = new Map<string, { name: string; spent: number }>();
    for (const e of expenses) {
      const entry = spentByCat.get(e.categoryId) ?? { name: e.category.name, spent: 0 };
      entry.spent += Number(e.amount);
      spentByCat.set(e.categoryId, entry);
    }
    const budgetByCat = new Map(budgets.map((b) => [b.categoryId, Number(b.amount)]));

    // Union of categories that have spend or a budget this term
    const catIds = new Set<string>([...spentByCat.keys(), ...budgetByCat.keys()]);
    const byCategory = [...catIds]
      .map((categoryId) => ({
        categoryId,
        name: spentByCat.get(categoryId)?.name ?? '',
        spent: spentByCat.get(categoryId)?.spent ?? 0,
        budget: budgetByCat.get(categoryId) ?? 0,
      }))
      .sort((a, b) => b.spent - a.spent);

    // Categories with a budget but no name resolved (no expenses) — fill names
    const missing = byCategory.filter((c) => !c.name).map((c) => c.categoryId);
    if (missing.length) {
      const cats = await this.prisma.expenseCategory.findMany({
        where: { schoolId, id: { in: missing } },
        select: { id: true, name: true },
      });
      const nameMap = new Map(cats.map((c) => [c.id, c.name]));
      for (const c of byCategory) if (!c.name) c.name = nameMap.get(c.categoryId) ?? '—';
    }

    const expenseTotal = byCategory.reduce((s, c) => s + c.spent, 0);

    return {
      term: { id: term.id, name: term.name },
      income: { fees, feeding, transport, total: incomeTotal },
      expenses: { total: expenseTotal, byCategory },
      net: incomeTotal - expenseTotal,
    };
  }
}

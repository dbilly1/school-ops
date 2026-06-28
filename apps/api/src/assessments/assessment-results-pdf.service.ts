import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsService } from './assessments.service';
import { StaffRole } from '@prisma/client';

type Caller = { id: string; roles: StaffRole[] };

const CATEGORY_LABEL: Record<string, string> = {
  CLASS_EXERCISE: 'Class Exercise', CLASS_TEST: 'Class Test', GROUP_WORK: 'Group Work',
  PROJECT: 'Project Work', HOMEWORK: 'Homework', MID_TERM: 'Mid-Term', END_OF_TERM_EXAM: 'End-of-Term Exam',
};

// Renders one exam batch as a results sheet: a landscape broadsheet (students ×
// subjects, with average + position) and, optionally, a per-student slip page
// each. Distinct from the terminal report card — this is an internal results
// snapshot for a single assessment batch.
@Injectable()
export class AssessmentResultsPdfService {
  constructor(
    private prisma: PrismaService,
    private assessments: AssessmentsService,
  ) {}

  async generate(
    schoolId: string,
    batchId: string,
    caller: Caller,
    opts: { slips?: boolean } = {},
  ): Promise<Buffer> {
    const data = await this.assessments.getBatchResults(schoolId, batchId, caller);
    const school = await this.loadSchool(schoolId);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const done = this.collect(doc);

    this.renderBroadsheet(doc, data, school);
    if (opts.slips) {
      for (const row of data.students) {
        doc.addPage({ size: 'A4', layout: 'portrait', margin: 50 });
        this.renderSlip(doc, data, row, school);
      }
    }

    doc.end();
    return done;
  }

  // ── Broadsheet (landscape) ──────────────────────────────────
  private renderBroadsheet(doc: PDFKit.PDFDocument, data: any, school: School) {
    const accent = school?.primaryColor || '#1a56db';
    const pageW = doc.page.width;
    const left = 40;
    const right = pageW - 40;
    const usable = right - left;

    // Header band
    this.drawHeader(doc, data, school, accent, usable, left, right);

    // Column layout: name + scored subjects (capped to keep the sheet readable),
    // then Avg / Grade / Position. With many subjects, columns simply narrow.
    const subjects = data.subjects as { subjectId: string; name: string }[];
    const nameW = 150;
    const tailW = 60 + 50 + 50; // Avg + Grade + Pos
    const subjW = subjects.length ? Math.max(34, (usable - nameW - tailW) / subjects.length) : 0;

    let y = doc.y + 4;
    const rowH = 20;

    const drawHeaderRow = () => {
      doc.rect(left, y, usable, rowH).fill(accent);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
      doc.text('Student', left + 5, y + 6, { width: nameW - 10 });
      let x = left + nameW;
      for (const s of subjects) {
        doc.text(this.abbrev(s.name, subjW), x + 2, y + 6, { width: subjW - 4, align: 'center' });
        x += subjW;
      }
      doc.text('Avg', x + 2, y + 6, { width: 56, align: 'center' }); x += 60;
      doc.text('Grade', x + 2, y + 6, { width: 46, align: 'center' }); x += 50;
      doc.text('Pos', x + 2, y + 6, { width: 46, align: 'center' });
      y += rowH;
    };
    drawHeaderRow();

    doc.font('Helvetica').fontSize(8);
    data.students.forEach((r: any, i: number) => {
      if (y + rowH > doc.page.height - 40) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
        y = 40;
        drawHeaderRow();
        doc.font('Helvetica').fontSize(8);
      }
      if (i % 2 === 1) doc.rect(left, y, usable, rowH).fill('#f3f4f6');
      doc.fillColor('#111').font('Helvetica').fontSize(8);
      doc.text(`${r.student.lastName}, ${r.student.firstName}`, left + 5, y + 6, { width: nameW - 10, ellipsis: true });
      let x = left + nameW;
      for (const c of r.cells) {
        const val = c.rawScore != null ? `${c.rawScore}` : '—';
        doc.fillColor(c.rawScore == null ? '#9ca3af' : '#111')
          .text(val, x + 2, y + 6, { width: subjW - 4, align: 'center' });
        x += subjW;
      }
      doc.fillColor('#111').font('Helvetica-Bold');
      doc.text(r.average != null ? `${r.average}%` : '—', x + 2, y + 6, { width: 56, align: 'center' }); x += 60;
      doc.font('Helvetica').text(r.overallGrade ?? '—', x + 2, y + 6, { width: 46, align: 'center' }); x += 50;
      doc.text(r.position != null ? this.ordinal(r.position) : '—', x + 2, y + 6, { width: 46, align: 'center' });
      doc.rect(left, y, usable, rowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += rowH;
    });

    // Footer summary
    doc.y = y + 10;
    const s = data.summary;
    doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(
      `${s.studentCount} students · ${s.subjectCount} subjects · Class average: ${s.classAverage != null ? `${s.classAverage}%` : '—'}`
      + (s.fullyScored ? '' : '  ·  Provisional — not all subjects scored yet'),
      left, doc.y, { width: usable },
    );
  }

  private drawHeader(
    doc: PDFKit.PDFDocument, data: any, school: School, accent: string,
    usable: number, left: number, right: number,
  ) {
    const logoBuf = this.dataUrlToBuffer(school?.logoUrl);
    let tx = left;
    if (logoBuf) {
      try { doc.image(logoBuf, left, doc.y, { fit: [40, 40] }); tx = left + 50; } catch { /* ignore */ }
    }
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(16)
      .text((school?.name ?? 'School'), tx, 40, { width: usable - 50 });
    if (school?.address) doc.fillColor('#555').font('Helvetica').fontSize(8).text(school.address, tx, doc.y);
    doc.moveDown(0.4);
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(12)
      .text(`${data.class.name} — ${data.title}`, left, doc.y, { width: usable });
    doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(
      `${CATEGORY_LABEL[data.category] ?? data.category} · ${data.term.name}`
      + (data.assessmentDate ? ` · ${this.fmtDate(data.assessmentDate)}` : ''),
      left, doc.y, { width: usable },
    );
    doc.moveDown(0.4);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(accent).lineWidth(1.5).stroke();
    doc.moveDown(0.4);
  }

  // ── Per-student slip (portrait) ─────────────────────────────
  private renderSlip(doc: PDFKit.PDFDocument, data: any, row: any, school: School) {
    const accent = school?.primaryColor || '#1a56db';
    const left = 50;
    const right = doc.page.width - 50;
    const usable = right - left;

    const logoBuf = this.dataUrlToBuffer(school?.logoUrl);
    if (logoBuf) {
      try {
        const size = 50;
        doc.image(logoBuf, (doc.page.width - size) / 2, doc.y, { fit: [size, size] });
        doc.y += size + 4;
      } catch { /* ignore */ }
    }
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(18).text(school?.name ?? 'School', { align: 'center' });
    if (school?.address) doc.fillColor('#555').font('Helvetica').fontSize(9).text(school.address, { align: 'center' });
    doc.moveDown(0.4);
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(13).text('Examination Result Slip', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(accent).lineWidth(2).stroke();
    doc.moveDown(0.8);

    const top = doc.y;
    doc.fillColor('#111').fontSize(10).font('Helvetica-Bold')
      .text('Name: ', left, top, { continued: true }).font('Helvetica').text(`${row.student.firstName} ${row.student.lastName}`);
    doc.font('Helvetica-Bold').text('Student ID: ', { continued: true }).font('Helvetica').text(row.student.studentId);
    doc.font('Helvetica-Bold').text('Class: ', { continued: true }).font('Helvetica').text(data.class.name);
    doc.font('Helvetica-Bold').text(`${CATEGORY_LABEL[data.category] ?? data.category}: `, 320, top, { continued: true })
      .font('Helvetica').text(data.title);
    doc.font('Helvetica-Bold').text('Term: ', 320, doc.y, { continued: true }).font('Helvetica').text(data.term.name);
    if (data.assessmentDate) {
      doc.font('Helvetica-Bold').text('Date: ', 320, doc.y, { continued: true }).font('Helvetica').text(this.fmtDate(data.assessmentDate));
    }
    doc.moveDown(1.2);

    // Subjects table
    const cols = [
      { label: 'Subject', width: usable - 90 - 70 - 80 },
      { label: 'Score', width: 90 },
      { label: '%', width: 70 },
      { label: 'Grade', width: 80 },
    ];
    let y = doc.y;
    const rowH = 22;
    doc.rect(left, y, usable, rowH).fill(accent);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9.5);
    let hx = left;
    for (const c of cols) { doc.text(c.label, hx + 6, y + 6, { width: c.width - 12 }); hx += c.width; }
    y += rowH;

    const subjectName = new Map<string, string>(data.subjects.map((s: any) => [s.subjectId, s.name]));
    doc.font('Helvetica').fontSize(9.5);
    row.cells.forEach((c: any, i: number) => {
      if (i % 2 === 1) doc.rect(left, y, usable, rowH).fill('#f3f4f6');
      doc.fillColor('#111').font('Helvetica').fontSize(9.5);
      let x = left;
      const vals = [
        subjectName.get(c.subjectId) ?? '',
        c.rawScore != null ? `${c.rawScore} / ${c.totalScore}` : '—',
        c.percent != null ? `${c.percent}%` : '—',
        c.grade ?? '—',
      ];
      cols.forEach((col, ci) => { doc.text(vals[ci], x + 6, y + 6, { width: col.width - 12 }); x += col.width; });
      doc.rect(left, y, usable, rowH).strokeColor('#d1d5db').lineWidth(0.5).stroke();
      y += rowH;
    });

    doc.y = y + 12;
    const parts = [`Total: ${row.totalRaw} / ${row.totalPossible}`, `Average: ${row.average != null ? `${row.average}%` : '—'}`];
    if (row.overallGrade) parts.push(`Grade: ${row.overallGrade}`);
    if (row.position != null) parts.push(`Position: ${this.ordinal(row.position)} of ${data.summary.rankedCount}`);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111').text(parts.join('     •     '), left, doc.y);
  }

  // ── Shared helpers ──────────────────────────────────────────
  private loadSchool(schoolId: string) {
    return this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, primaryColor: true, address: true, phone: true, email: true, logoUrl: true },
    });
  }

  private collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    return new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  }

  private dataUrlToBuffer(value?: string | null): Buffer | null {
    if (!value) return null;
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(value);
    if (!match) return null;
    try { return Buffer.from(match[1], 'base64'); } catch { return null; }
  }

  // Trim a subject name to roughly fit a narrow column.
  private abbrev(name: string, width: number): string {
    const max = Math.max(4, Math.floor(width / 4.2));
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
  }

  private fmtDate(value?: string | Date | null): string {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
  }
}

type School = Awaited<ReturnType<AssessmentResultsPdfService['loadSchool']>>;

import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { ReportCardsService } from './report-cards.service';

@Injectable()
export class ReportCardPdfService {
  constructor(
    private prisma: PrismaService,
    private reportCards: ReportCardsService,
  ) {}

  async generate(schoolId: string, studentId: string, termId: string): Promise<Buffer> {
    const data = await this.reportCards.getStudentReportCard(schoolId, studentId, termId);
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, primaryColor: true, address: true, phone: true, logoUrl: true },
    });

    const config = data.config;
    const showGradeLabel = config?.showGradeLabel ?? true;
    const showPosition = config?.showPosition ?? true;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const accent = school?.primaryColor || '#1a56db';

    // ── Header ──────────────────────────────────────────────
    // Centered logo (if an inline/base64 logo is set), then the school name.
    const logoBuf = this.dataUrlToBuffer(school?.logoUrl);
    if (logoBuf) {
      try {
        const size = 56;
        doc.image(logoBuf, (doc.page.width - size) / 2, doc.y, { fit: [size, size], align: 'center' });
        doc.y += size + 6;
      } catch {
        // ignore a malformed image — never let it break the report
      }
    }
    doc.fillColor(accent).fontSize(20).font('Helvetica-Bold')
      .text(school?.name ?? 'School', { align: 'center' });
    if (school?.address) {
      doc.fillColor('#555').fontSize(9).font('Helvetica').text(school.address, { align: 'center' });
    }
    if (school?.phone) {
      doc.fillColor('#555').fontSize(9).font('Helvetica').text(school.phone, { align: 'center' });
    }
    doc.moveDown(0.5);
    doc.fillColor('#000').fontSize(13).font('Helvetica-Bold')
      .text('Terminal Report Card', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(accent).lineWidth(2).stroke();
    doc.moveDown(1);

    // ── Student / Term Info ─────────────────────────────────
    const infoTop = doc.y;
    doc.fillColor('#000').fontSize(10).font('Helvetica-Bold')
      .text(`Name: `, 50, infoTop, { continued: true })
      .font('Helvetica').text(`${data.student.firstName} ${data.student.lastName}`);
    doc.font('Helvetica-Bold')
      .text(`Student ID: `, { continued: true })
      .font('Helvetica').text(data.student.studentId);

    if (data.className) {
      doc.font('Helvetica-Bold')
        .text(`Class: `, 50, doc.y, { continued: true })
        .font('Helvetica').text(data.className);
    }

    doc.font('Helvetica-Bold')
      .text(`Academic Year: `, 320, infoTop, { continued: true })
      .font('Helvetica').text(data.term.academicYear.name);
    doc.font('Helvetica-Bold')
      .text(`Term: `, 320, doc.y, { continued: true })
      .font('Helvetica').text(data.term.name);
    doc.moveDown(1.5);

    // ── Subjects Table ──────────────────────────────────────
    this.drawSubjectsTable(doc, data.subjects, accent, showGradeLabel);
    doc.moveDown(0.8);

    // ── Overall summary ─────────────────────────────────────
    const summaryParts = [`Overall: ${data.aggregate}%`];
    if (showGradeLabel && data.overallGrade) summaryParts.push(`Grade: ${data.overallGrade}`);
    if (showPosition && data.position) summaryParts.push(`Position: ${data.position}${data.classSize ? ` of ${data.classSize}` : ''}`);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text(summaryParts.join('    •    '));
    doc.moveDown(1);

    // ── Attendance Summary ──────────────────────────────────
    if (config?.showAttendanceSummary ?? true) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(accent).text('Attendance Summary');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#000')
        .text(`Days Present: ${data.attendance.presentDays} / ${data.attendance.totalDays}   •   Absent: ${data.attendance.absentDays}   •   Rate: ${data.attendance.rate}%`);
      doc.moveDown(1);
    }

    // ── Attitudes / Interests / Conduct ─────────────────────
    const cd = data.conduct;
    if ((config?.showBehaviourScores ?? false) && cd && (cd.attitudes || cd.interests || cd.conduct)) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(accent).text('Attitudes, Interests & Conduct');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#000');
      if (cd.attitudes) doc.font('Helvetica-Bold').text('Attitudes: ', { continued: true }).font('Helvetica').text(cd.attitudes);
      if (cd.interests) doc.font('Helvetica-Bold').text('Interests: ', { continued: true }).font('Helvetica').text(cd.interests);
      if (cd.conduct) doc.font('Helvetica-Bold').text('Conduct: ', { continued: true }).font('Helvetica').text(cd.conduct);
      doc.moveDown(1);
    }

    // ── Comments ────────────────────────────────────────────
    if (config?.showTeacherComments) {
      this.drawCommentBox(doc, "Class Teacher's Comments", accent, cd?.teacherRemarks);
    }
    if (config?.showPrincipalComments) {
      this.drawCommentBox(doc, "Head Teacher's Comments", accent, cd?.headTeacherRemarks);
    }

    // ── Custom Sections ─────────────────────────────────────
    for (const section of config?.customSections ?? []) {
      this.drawCommentBox(doc, section.label, accent);
    }

    // ── Next Term Info ──────────────────────────────────────
    if (config?.showNextTermInfo) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor(accent)
        .text('Next Term Begins: ', { continued: true })
        .font('Helvetica').fillColor('#000').text('__________________________');
      doc.moveDown(1);
    }

    // ── Footer ──────────────────────────────────────────────
    if (config?.footerText) {
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#777')
        .text(config.footerText, 50, 780, { align: 'center', width: 495 });
    }

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  // Parse a base64 image data URL into a Buffer pdfkit can render. Returns null
  // for empty values or remote URLs (pdfkit can't fetch those).
  private dataUrlToBuffer(value?: string | null): Buffer | null {
    if (!value) return null;
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(value);
    if (!match) return null;
    try {
      return Buffer.from(match[1], 'base64');
    } catch {
      return null;
    }
  }

  private drawSubjectsTable(
    doc: PDFKit.PDFDocument,
    subjects: any[],
    accent: string,
    showGradeLabel: boolean,
  ) {
    const startX = 50;
    let y = doc.y;
    const rowHeight = 22;

    const cols: { label: string; width: number; key: string }[] = [
      { label: 'Subject', width: showGradeLabel ? 175 : 220, key: 'subject' },
      { label: 'Class (SBA)', width: 90, key: 'sba' },
      { label: 'Exam', width: 90, key: 'exam' },
      { label: 'Total', width: 65, key: 'total' },
    ];
    if (showGradeLabel) cols.push({ label: 'Grade', width: 75, key: 'gradeLabel' });

    // Header row
    doc.rect(startX, y, 495, rowHeight).fill(accent);
    doc.fillColor('#fff').fontSize(9.5).font('Helvetica-Bold');
    let x = startX;
    for (const col of cols) {
      doc.text(col.label, x + 6, y + 6, { width: col.width - 12 });
      x += col.width;
    }
    y += rowHeight;

    // Data rows
    doc.font('Helvetica').fontSize(9.5);
    subjects.forEach((s, i) => {
      if (i % 2 === 1) {
        doc.rect(startX, y, 495, rowHeight).fill('#f3f4f6');
      }
      doc.fillColor('#000');
      x = startX;
      for (const col of cols) {
        let value = '';
        if (col.key === 'subject') value = s.subject;
        else if (col.key === 'sba') value = s.sbaPercent != null ? `${s.sbaScore}` : '—';
        else if (col.key === 'exam') value = s.examPercent != null ? `${s.examScore}` : '—';
        else if (col.key === 'total') value = `${s.total}`;
        else if (col.key === 'gradeLabel') value = s.gradeLabel ?? '-';
        doc.text(value, x + 6, y + 6, { width: col.width - 12 });
        x += col.width;
      }
      y += rowHeight;
    });

    // Border
    doc.rect(startX, doc.y - subjects.length * rowHeight - rowHeight, 495, (subjects.length + 1) * rowHeight)
      .strokeColor('#d1d5db').lineWidth(1).stroke();

    doc.y = y + 4;
  }

  private drawCommentBox(doc: PDFKit.PDFDocument, label: string, accent: string, text?: string | null) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor(accent).text(label);
    doc.moveDown(0.3);
    const boxY = doc.y;
    doc.rect(50, boxY, 495, 40).strokeColor('#d1d5db').lineWidth(1).stroke();
    if (text) {
      doc.fontSize(10).font('Helvetica').fillColor('#000').text(text, 56, boxY + 6, { width: 483 });
    }
    doc.y = boxY + 50;
  }
}

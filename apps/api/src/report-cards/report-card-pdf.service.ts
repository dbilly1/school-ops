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
      select: { name: true, primaryColor: true, address: true, phone: true, email: true, logoUrl: true },
    });

    const config = data.config;
    const showGradeLabel = config?.showGradeLabel ?? true;
    const showPosition = config?.showPosition ?? true;
    const holisticLayout = config?.reportCardLayout === 'HOLISTIC';
    const showScale = config?.showAssessmentScale ?? false;
    const showMetrics = config?.showMetricsTable ?? false;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const accent = school?.primaryColor || '#1a56db';

    const logoBuf = this.dataUrlToBuffer(school?.logoUrl);

    if (holisticLayout) {
      // ── Branded header band ───────────────────────────────
      const bandH = 72;
      doc.save();
      doc.rect(0, 0, doc.page.width, bandH).fill(accent);
      doc.rect(0, 0, 8, bandH).fill('#f59e0b');
      let tx = 56;
      if (logoBuf) {
        try {
          doc.circle(80, bandH / 2, 24).fill('#fff');
          doc.image(logoBuf, 60, bandH / 2 - 18, { fit: [40, 40] });
          tx = 116;
        } catch { /* ignore bad image */ }
      }
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16)
        .text((school?.name ?? 'School').toUpperCase(), tx, 18, { width: 300 });
      if (school?.address) doc.font('Helvetica').fontSize(8).fillColor('#fff').text(school.address, tx, 44, { width: 300 });
      doc.font('Helvetica').fontSize(8.5).fillColor('#fff');
      let cy = 20;
      if (school?.phone) { doc.text(school.phone, 380, cy, { width: 165, align: 'right' }); cy += 12; }
      if (school?.email) { doc.text(school.email, 380, cy, { width: 165, align: 'right' }); }
      doc.restore();
      doc.fillColor('#000');
      doc.y = bandH + 16;
      doc.x = 50;

      // ── Student info box ──────────────────────────────────
      this.drawInfoBox(doc, data);
      doc.moveDown(1);
    } else {
      // ── Standard centered header ──────────────────────────
      if (logoBuf) {
        try {
          const size = 56;
          doc.image(logoBuf, (doc.page.width - size) / 2, doc.y, { fit: [size, size], align: 'center' });
          doc.y += size + 6;
        } catch { /* ignore bad image */ }
      }
      doc.fillColor(accent).fontSize(20).font('Helvetica-Bold')
        .text(school?.name ?? 'School', { align: 'center' });
      if (school?.address) doc.fillColor('#555').fontSize(9).font('Helvetica').text(school.address, { align: 'center' });
      if (school?.phone) doc.fillColor('#555').fontSize(9).font('Helvetica').text(school.phone, { align: 'center' });
      doc.moveDown(0.5);
      doc.fillColor('#000').fontSize(13).font('Helvetica-Bold').text('Terminal Report Card', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(accent).lineWidth(2).stroke();
      doc.moveDown(1);

      const infoTop = doc.y;
      doc.fillColor('#000').fontSize(10).font('Helvetica-Bold')
        .text(`Name: `, 50, infoTop, { continued: true })
        .font('Helvetica').text(`${data.student.firstName} ${data.student.lastName}`);
      doc.font('Helvetica-Bold').text(`Student ID: `, { continued: true })
        .font('Helvetica').text(data.student.studentId);
      if (data.className) {
        doc.font('Helvetica-Bold').text(`Class: `, 50, doc.y, { continued: true })
          .font('Helvetica').text(data.className);
      }
      doc.font('Helvetica-Bold').text(`Academic Year: `, 320, infoTop, { continued: true })
        .font('Helvetica').text(data.term.academicYear.name);
      doc.font('Helvetica-Bold').text(`Term: `, 320, doc.y, { continued: true })
        .font('Helvetica').text(data.term.name);
      if (data.vacationDate) {
        doc.font('Helvetica-Bold').text(`Vacation: `, 320, doc.y, { continued: true })
          .font('Helvetica').text(this.fmtDate(data.vacationDate));
      }
      if (data.nextTermReopens) {
        doc.font('Helvetica-Bold').text(`Next Term Begins: `, 320, doc.y, { continued: true })
          .font('Helvetica').text(this.fmtDate(data.nextTermReopens));
      }
      doc.moveDown(1.5);
    }

    // ── Assessment scale (holistic layout shows it before subjects) ─────────
    if (holisticLayout && showScale) {
      this.drawAssessmentScale(doc, data, accent);
    }

    // ── Subjects Table ──────────────────────────────────────
    this.drawSubjectsTable(doc, data.subjects, accent, showGradeLabel);
    doc.moveDown(0.8);

    // ── Overall summary ─────────────────────────────────────
    const summaryParts = [`Overall: ${data.aggregate}%`];
    if (showGradeLabel && data.overallGrade) summaryParts.push(`Grade: ${data.overallGrade}`);
    if (showPosition && data.position) summaryParts.push(`Position: ${this.ordinal(data.position)}`);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text(summaryParts.join('    •    '));
    doc.moveDown(1);

    // ── Metrics (holistic layout shows the grade key right after subjects) ──
    if (holisticLayout && showMetrics) {
      this.drawMetrics(doc, data, accent);
    }

    // ── Attendance Summary ──────────────────────────────────
    if (config?.showAttendanceSummary ?? true) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor(accent).text('Attendance Summary');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#000')
        .text(`Days Present: ${data.attendance.presentDays} / ${data.attendance.totalDays}   •   Absent: ${data.attendance.absentDays}   •   Rate: ${data.attendance.rate}%`);
      doc.moveDown(1);
    }

    // ── Assessment scale + Metrics (standard layout appends them) ───────────
    if (!holisticLayout && showScale) {
      this.drawAssessmentScale(doc, data, accent);
    }
    if (!holisticLayout && showMetrics) {
      this.drawMetrics(doc, data, accent);
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
    if (holisticLayout) {
      const bandH = 28;
      const fy = doc.page.height - bandH;
      doc.save();
      doc.rect(0, fy, doc.page.width, bandH).fill(accent);
      doc.rect(0, fy, 8, bandH).fill('#f59e0b');
      if (config?.footerText) {
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
          .text(config.footerText.toUpperCase(), 50, fy + 9, { align: 'center', width: 495, characterSpacing: 2 });
      }
      doc.restore();
    } else if (config?.footerText) {
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

  // Assessment Scale: proficiency legend + Holistic Development ratings table.
  private drawAssessmentScale(doc: PDFKit.PDFDocument, data: any, accent: string) {
    const scale = data.assessmentScale;
    if (!scale?.levels?.length || !scale?.skills?.length) return;
    const ratings: Record<string, string> = data.holistic ?? {};

    doc.fontSize(11).font('Helvetica-Bold').fillColor(accent).text('Assessment Scale');
    doc.moveDown(0.3);
    doc.fontSize(8.5).fillColor('#000');
    for (const l of scale.levels) {
      doc.font('Helvetica-Bold').text(`${l.code} ${l.label}`, { continued: !!l.description });
      doc.font('Helvetica').text(l.description ? ` — ${l.description}` : '');
    }
    doc.moveDown(0.4);

    const group = scale.skills[0]?.groupLabel || 'Holistic Development';
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#000').text(group);
    doc.moveDown(0.2);

    const startX = 50;
    const levelW = 34;
    const skillW = 495 - scale.levels.length * levelW;
    let y = doc.y;

    // Header row
    const headH = 18;
    doc.rect(startX, y, 495, headH).fill('#f3f4f6');
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold');
    doc.text('Skill', startX + 4, y + 5, { width: skillW - 8 });
    let x = startX + skillW;
    for (const l of scale.levels) { doc.text(l.code, x, y + 5, { width: levelW, align: 'center' }); x += levelW; }
    y += headH;

    doc.font('Helvetica').fontSize(8.5).fillColor('#000');
    for (const sk of scale.skills) {
      const rowH = Math.max(16, doc.heightOfString(sk.label, { width: skillW - 8 }) + 8);
      doc.fillColor('#000').text(sk.label, startX + 4, y + 4, { width: skillW - 8 });
      x = startX + skillW;
      const chosen = ratings[sk.id];
      for (const l of scale.levels) {
        if (chosen === l.code) {
          doc.fillColor(accent).text('X', x, y + 4, { width: levelW, align: 'center' });
          doc.fillColor('#000');
        }
        x += levelW;
      }
      doc.moveTo(startX, y + rowH).lineTo(545, y + rowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += rowH;
    }
    doc.y = y + 8;
  }

  // Metrics: the grade-band key (from the school's grading scale) as a boxed table.
  private drawMetrics(doc: PDFKit.PDFDocument, data: any, accent: string) {
    const bands = data.gradingBands ?? [];
    if (!bands.length) return;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(accent).text('Metrics');
    doc.moveDown(0.3);
    const startX = 50, w1 = 36, w2 = 86, w3 = 180, rowH = 16;
    let y = doc.y;
    doc.fontSize(8.5).fillColor('#000');
    for (const b of bands) {
      doc.rect(startX, y, w1, rowH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.rect(startX + w1, y, w2, rowH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.rect(startX + w1 + w2, y, w3, rowH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.font('Helvetica-Bold').text(b.label, startX + 4, y + 4, { width: w1 - 8 });
      doc.font('Helvetica').text(`${b.minScore}–${b.maxScore}%`, startX + w1 + 4, y + 4, { width: w2 - 8 });
      doc.text(b.remark ?? '', startX + w1 + w2 + 4, y + 4, { width: w3 - 8 });
      y += rowH;
    }
    doc.y = y + 8;
  }

  // Student info box for the holistic layout (bordered 2-column grid).
  private drawInfoBox(doc: PDFKit.PDFDocument, data: any) {
    const rows: [string, string][] = [
      [`Name: ${data.student.firstName} ${data.student.lastName}`, `Class: ${data.className ?? '-'}`],
      [`Academic Year/Term: ${data.term.academicYear.name} - ${data.term.name}`, `Vacation: ${this.fmtDate(data.vacationDate) || '-'}`],
      [`Class Teacher: ${data.classTeacherName ?? '-'}`, `Next Term Begins: ${this.fmtDate(data.nextTermReopens) || '-'}`],
    ];
    const startX = 50, colW = 247.5, rowH = 18;
    let y = doc.y;
    doc.fontSize(9).font('Helvetica').fillColor('#000');
    for (const [left, right] of rows) {
      doc.rect(startX, y, colW, rowH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.rect(startX + colW, y, colW, rowH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.text(left, startX + 4, y + 5, { width: colW - 8 });
      doc.text(right, startX + colW + 4, y + 5, { width: colW - 8 });
      y += rowH;
    }
    doc.y = y;
  }

  private fmtDate(value?: string | Date | null): string {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  private ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
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
        else if (col.key === 'total') value = s.total != null ? `${s.total}` : '—';
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

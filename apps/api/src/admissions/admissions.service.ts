import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { retryOnUniqueViolation } from '../common/retry-unique';
import { nextStudentId } from '../common/student-id';
import { generateTempPassword } from '../common/password.util';
import {
  CreateAdmissionDto, UpdateAdmissionStageDto,
  AddFollowUpDto, AdmissionFieldConfigDto, SetAdmissionOfferDto,
} from './dto/admissions.dto';

@Injectable()
export class AdmissionsService {
  constructor(private prisma: PrismaService) {}

  // ── Field Configuration ───────────────────────────────────

  async getFieldConfigs(schoolId: string) {
    return this.prisma.admissionFieldConfig.findMany({
      where: { schoolId },
      orderBy: { position: 'asc' },
    });
  }

  async upsertFieldConfig(schoolId: string, dto: AdmissionFieldConfigDto) {
    return this.prisma.admissionFieldConfig.upsert({
      where: { schoolId_fieldKey: { schoolId, fieldKey: dto.fieldKey } },
      update: {
        label: dto.label, fieldType: dto.fieldType,
        isRequired: dto.isRequired, isHidden: dto.isHidden,
        carryToProfile: dto.carryToProfile, position: dto.position,
      },
      create: { schoolId, ...dto },
    });
  }

  // ── Admission Records ─────────────────────────────────────

  async findAll(schoolId: string, stage?: string) {
    return this.prisma.admissionRecord.findMany({
      where: { schoolId, ...(stage ? { stage: stage as any } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(schoolId: string, id: string) {
    const record = await this.prisma.admissionRecord.findFirst({
      where: { id, schoolId },
      include: {
        followUps: { orderBy: { createdAt: 'desc' } },
        student: true,
        admittedClass: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });
    if (!record) throw new NotFoundException('Admission record not found');
    return record;
  }

  // Set/clear the admission-offer details (admitted class, academic year,
  // reporting date) that back the admission letter. Each field is independent:
  // undefined leaves it unchanged, an empty string clears it. Class/year are
  // validated against the school to keep tenants isolated.
  async setOffer(schoolId: string, id: string, dto: SetAdmissionOfferDto) {
    const record = await this.prisma.admissionRecord.findFirst({ where: { id, schoolId } });
    if (!record) throw new NotFoundException('Admission record not found');

    const data: Record<string, any> = {};

    if (dto.admittedClassId !== undefined) {
      const classId = dto.admittedClassId || null;
      if (classId) {
        const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
        if (!cls) throw new BadRequestException('Invalid class');
      }
      data.admittedClassId = classId;
    }

    if (dto.academicYearId !== undefined) {
      const yearId = dto.academicYearId || null;
      if (yearId) {
        const year = await this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId } });
        if (!year) throw new BadRequestException('Invalid academic year');
      }
      data.academicYearId = yearId;
    }

    if (dto.reportingDate !== undefined) {
      data.reportingDate = dto.reportingDate ? new Date(dto.reportingDate) : null;
    }

    await this.prisma.admissionRecord.update({ where: { id }, data });
    return this.findOne(schoolId, id);
  }

  async create(schoolId: string, dto: CreateAdmissionDto, userId: string) {
    return this.prisma.admissionRecord.create({
      data: {
        schoolId,
        stage: dto.stage ?? 'APPLICATION',
        formData: dto.formData,
        notes: dto.notes,
      },
    });
  }

  async updateStage(schoolId: string, id: string, dto: UpdateAdmissionStageDto, userId: string) {
    const record = await this.prisma.admissionRecord.findFirst({ where: { id, schoolId } });
    if (!record) throw new NotFoundException('Admission record not found');

    if (dto.stage === 'ENROLLED' && record.stage !== 'ENROLLED') {
      // Auto-create student profile on enrollment
      return this.enrollStudent(schoolId, record, dto.notes, userId);
    }

    return this.prisma.admissionRecord.update({
      where: { id },
      data: { stage: dto.stage, notes: dto.notes ?? record.notes },
    });
  }

  async addFollowUp(schoolId: string, id: string, dto: AddFollowUpDto, userId: string) {
    const record = await this.prisma.admissionRecord.findFirst({ where: { id, schoolId } });
    if (!record) throw new NotFoundException('Admission record not found');

    return this.prisma.admissionFollowUp.create({
      data: {
        admissionRecordId: id,
        note: dto.note,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        createdBy: userId,
      },
    });
  }

  async getConversionStats(schoolId: string) {
    const stages = ['LEAD', 'INQUIRY', 'APPLICATION', 'INTERVIEW', 'ACCEPTED', 'ENROLLED', 'WITHDRAWN'];
    const counts = await this.prisma.admissionRecord.groupBy({
      by: ['stage'],
      where: { schoolId },
      _count: { id: true },
    });

    return stages.map((stage) => ({
      stage,
      count: counts.find((c) => c.stage === stage)?._count.id ?? 0,
    }));
  }

  // ── Enrollment → Student Profile ──────────────────────────

  private async enrollStudent(
    schoolId: string,
    admissionRecord: any,
    notes: string | undefined,
    userId: string,
  ) {
    const formData = admissionRecord.formData as Record<string, any>;

    // Carry over fields configured for profile
    const fieldConfigs = await this.prisma.admissionFieldConfig.findMany({
      where: { schoolId, carryToProfile: true },
    });
    const carryOverKeys = fieldConfigs.map((f) => f.fieldKey);
    const customFields: Record<string, any> = {};
    for (const key of carryOverKeys) {
      if (formData[key] !== undefined) customFields[key] = formData[key];
    }

    // Generate portal password
    const tempPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Allocate the human-readable student ID inside a retried transaction. The
    // sequence is an atomic counter on the school, so this is collision-free;
    // the retry only guards the rare case of a manually-edited prefix clashing.
    return retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
      const studentId = await nextStudentId(tx, schoolId);

      // Mark admission as enrolled
      await tx.admissionRecord.update({
        where: { id: admissionRecord.id },
        data: { stage: 'ENROLLED', notes: notes ?? admissionRecord.notes },
      });

      // Create student
      const student = await tx.student.create({
        data: {
          schoolId,
          admissionRecordId: admissionRecord.id,
          studentId,
          firstName: formData.firstName ?? '',
          lastName: formData.lastName ?? '',
          dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth) : null,
          gender: formData.gender ?? null,
          phone: formData.phone ?? null,
          address: formData.address ?? null,
          medicalNotes: formData.medicalNotes ?? null,
          customFields,
          portalCredential: {
            create: { passwordHash, mustChange: true },
          },
        },
      });

      return {
        admission: { id: admissionRecord.id, stage: 'ENROLLED' },
        student: {
          id: student.id, studentId,
          firstName: student.firstName, lastName: student.lastName,
          tempPassword, // Remove once email is wired up
        },
      };
      }),
    );
  }

  private generatePassword(): string {
    return generateTempPassword(8);
  }
}

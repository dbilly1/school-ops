import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { retryOnUniqueViolation } from '../common/retry-unique';
import {
  InviteUserDto, AssignRolesDto,
  RolePermissionOverrideDto, UserPermissionOverrideDto,
} from './dto/user.dto';
import { StaffRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  // ── Actor capability checks (defense-in-depth — no global authz guard yet) ──
  //
  // These enforce the Owner/Admin rules from the role model server-side, since
  // the permission system is otherwise only applied in the frontend.

  private async getActorCapabilities(schoolId: string, actorId: string) {
    const actor = await this.prisma.user.findFirst({
      where: { id: actorId, schoolId },
      include: { roles: true },
    });
    if (!actor) throw new ForbiddenException('Actor not found in this school');
    const roles = actor.roles.map((r) => r.role);
    return {
      isOwner: roles.includes('SCHOOL_OWNER' as StaffRole),
      isAdmin: roles.includes('SCHOOL_ADMIN' as StaffRole),
    };
  }

  private assertCanManageUsers(actor: { isOwner: boolean; isAdmin: boolean }) {
    if (!actor.isOwner && !actor.isAdmin)
      throw new ForbiddenException('Only the School Owner or a School Admin can manage users');
  }

  // SCHOOL_OWNER can never be granted; SCHOOL_ADMIN only by the Owner.
  private assertCanGrantRoles(
    actor: { isOwner: boolean; isAdmin: boolean },
    requestedRoles: StaffRole[],
  ) {
    if (requestedRoles.includes('SCHOOL_OWNER' as StaffRole))
      throw new ForbiddenException('The School Owner role cannot be granted');
    if (requestedRoles.includes('SCHOOL_ADMIN' as StaffRole) && !actor.isOwner)
      throw new ForbiddenException('Only the School Owner can appoint a School Admin');
  }

  // Acting on (delete/deactivate/reset) a School Admin is Owner-only.
  private assertCanActOnTarget(
    actor: { isOwner: boolean; isAdmin: boolean },
    targetRoles: StaffRole[],
  ) {
    if (targetRoles.includes('SCHOOL_ADMIN' as StaffRole) && !actor.isOwner)
      throw new ForbiddenException('Only the School Owner can manage a School Admin');
  }

  private async assertCanManagePermissions(schoolId: string, actorId: string) {
    const actor = await this.getActorCapabilities(schoolId, actorId);
    if (actor.isOwner) return;
    if (actor.isAdmin) {
      const school = await this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { adminCanManagePermissions: true },
      });
      if (school?.adminCanManagePermissions) return;
    }
    throw new ForbiddenException('You are not permitted to manage permissions');
  }

  async findAll(schoolId: string) {
    return this.prisma.user.findMany({
      where: { schoolId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        isActive: true, createdAt: true,
        roles: { select: { role: true } },
        staffProfile: { select: { id: true, staffId: true, designation: true } },
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async findOne(schoolId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        isActive: true, tempPassword: true, mustChange: true, createdAt: true,
        roles: { select: { role: true } },
        staffProfile: {
          include: {
            qualifications: true,
            classAssignments: { include: { class: { select: { id: true, name: true } } } },
            subjectAssignments: { include: { subject: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Resolve class names for subject assignments (no Prisma relation on TeacherSubjectAssignment)
    if (user.staffProfile?.subjectAssignments?.length) {
      const classIds = [...new Set(user.staffProfile.subjectAssignments.map(sa => sa.classId))];
      const classes  = await this.prisma.class.findMany({
        where:  { id: { in: classIds } },
        select: { id: true, name: true },
      });
      const classMap = new Map(classes.map(c => [c.id, c]));

      return {
        ...user,
        staffProfile: {
          ...user.staffProfile,
          subjectAssignments: user.staffProfile.subjectAssignments.map(sa => ({
            ...sa,
            class: classMap.get(sa.classId) ?? { id: sa.classId, name: 'Unknown' },
          })),
        },
      };
    }

    return user;
  }

  async invite(schoolId: string, dto: InviteUserDto, invitedBy: string) {
    const actor = await this.getActorCapabilities(schoolId, invitedBy);
    this.assertCanManageUsers(actor);
    this.assertCanGrantRoles(actor, dto.roles);

    const existing = await this.prisma.user.findFirst({
      where: { schoolId, email: dto.email },
    });
    if (existing) throw new ConflictException('A user with this email already exists in this school');

    // Generate temp password — in production this would be emailed
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Generate the STF-#### staff ID inside a retried transaction so a unique
    // collision under concurrent invites recomputes instead of failing.
    const user = await retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const count = await tx.user.count({ where: { schoolId } });
        const staffId = `STF-${String(count + 1).padStart(4, '0')}`;

        const newUser = await tx.user.create({
          data: {
            schoolId,
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            passwordHash,
            tempPassword,
            mustChange: true,
            roles: { create: dto.roles.map((role) => ({ role })) },
            staffProfile: {
              create: {
                schoolId,
                staffId,
              },
            },
          },
          include: { roles: true, staffProfile: true },
        });
        return newUser;
      }),
    );

    await this.audit.log({
      schoolId, actorId: invitedBy,
      action: 'CREATE', entityType: 'user', entityId: user.id,
      afterValue: { email: user.email, roles: dto.roles },
    });

    // Fetch school name for the email
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });

    await this.mail.sendStaffInvite({
      to: user.email,
      firstName: user.firstName,
      schoolName: school?.name ?? 'your school',
      tempPassword,
      loginUrl: `${this.config.get('APP_URL') ?? 'http://localhost:3000'}/login`,
    });

    return {
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      roles: user.roles.map((r) => r.role),
      staffId: user.staffProfile?.staffId,
    };
  }

  async deleteUser(schoolId: string, userId: string, actorId: string) {
    const actor = await this.getActorCapabilities(schoolId, actorId);
    this.assertCanManageUsers(actor);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId },
      include: { roles: true, staffProfile: { select: { id: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    // Protect the School Owner — they cannot be deleted
    if (user.roles.some(r => r.role === 'SCHOOL_OWNER'))
      throw new ForbiddenException('The School Owner account cannot be deleted');

    this.assertCanActOnTarget(actor, user.roles.map((r) => r.role));

    await this.prisma.$transaction(async (tx) => {
      // Delete staff profile and all nested records first
      if (user.staffProfile) {
        const profileId = user.staffProfile.id;
        await tx.teacherSubjectAssignment.deleteMany({ where: { staffProfileId: profileId } });
        await tx.teacherClassAssignment.deleteMany({ where: { staffProfileId: profileId } });
        await tx.staffQualification.deleteMany({ where: { staffProfileId: profileId } });
        await tx.staffProfile.delete({ where: { id: profileId } });
      }

      // Delete user-level records without cascade
      await tx.userPermissionOverride.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });

      // Finally delete the user
      await tx.user.delete({ where: { id: userId } });
    });

    await this.audit.log({
      schoolId, actorId,
      action: 'DELETE', entityType: 'user', entityId: userId,
      beforeValue: { email: user.email },
    });

    return { deleted: true };
  }

  async setActive(schoolId: string, userId: string, isActive: boolean, actorId: string) {
    const actor = await this.getActorCapabilities(schoolId, actorId);
    this.assertCanManageUsers(actor);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // The School Owner can never be deactivated
    if (user.roles.some((r) => r.role === 'SCHOOL_OWNER'))
      throw new ForbiddenException('The School Owner account cannot be deactivated');

    this.assertCanActOnTarget(actor, user.roles.map((r) => r.role));

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, isActive: true },
    });

    await this.audit.log({
      schoolId, actorId, action: 'UPDATE',
      entityType: 'user', entityId: userId,
      beforeValue: { isActive: user.isActive },
      afterValue: { isActive },
    });

    return updated;
  }

  async assignRoles(schoolId: string, userId: string, dto: AssignRolesDto, actorId: string) {
    const actor = await this.getActorCapabilities(schoolId, actorId);
    this.assertCanManageUsers(actor);
    this.assertCanGrantRoles(actor, dto.roles);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Protect Owner role
    if (user.roles.some((r) => r.role === 'SCHOOL_OWNER'))
      throw new ForbiddenException('Cannot modify roles of a School Owner');

    // Appointing/removing a School Admin is Owner-only — block non-Owners from
    // changing the roles of anyone who is currently a School Admin.
    if (user.roles.some((r) => r.role === 'SCHOOL_ADMIN') && !actor.isOwner)
      throw new ForbiddenException('Only the School Owner can modify a School Admin');

    const before = user.roles.map((r) => r.role);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: dto.roles.map((role) => ({ userId, role })) });
    });

    await this.audit.logPermissionChange({
      schoolId, actorId,
      entityType: 'user_roles', entityId: userId,
      before: { roles: before }, after: { roles: dto.roles },
    });

    return { userId, roles: dto.roles };
  }

  async resetPassword(schoolId: string, userId: string, actorId: string) {
    const actor = await this.getActorCapabilities(schoolId, actorId);
    this.assertCanManageUsers(actor);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    this.assertCanActOnTarget(actor, user.roles.map((r) => r.role));

    const tempPassword = this.generateTempPassword();
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(tempPassword, 10), tempPassword, mustChange: true },
    });

    await this.audit.log({
      schoolId, actorId, action: 'UPDATE',
      entityType: 'user_password', entityId: userId,
    });

    await this.mail.sendPasswordReset({
      to: user.email,
      firstName: user.firstName,
      tempPassword,
      loginUrl: `${this.config.get('APP_URL') ?? 'http://localhost:3000'}/login`,
    });

    return { tempPassword, message: 'Password reset. Temporary password issued.' };
  }

  // ── Permission Overrides ──────────────────────────────────

  async upsertRoleOverride(schoolId: string, dto: RolePermissionOverrideDto, actorId: string) {
    await this.assertCanManagePermissions(schoolId, actorId);

    const existing = await this.prisma.rolePermissionOverride.findFirst({
      where: {
        schoolId, role: dto.role,
        featureKey: dto.featureKey,
        subFeatureKey: dto.subFeatureKey ?? null,
        action: dto.action,
      },
    });

    const data = {
      schoolId, role: dto.role,
      featureKey: dto.featureKey,
      subFeatureKey: dto.subFeatureKey ?? null,
      action: dto.action,
      granted: dto.granted,
      updatedBy: actorId,
    };

    const result = existing
      ? await this.prisma.rolePermissionOverride.update({ where: { id: existing.id }, data })
      : await this.prisma.rolePermissionOverride.create({ data });

    await this.audit.logPermissionChange({
      schoolId, actorId,
      entityType: 'role_permission_override', entityId: result.id,
      before: existing ? { granted: existing.granted } : {},
      after: { granted: dto.granted },
    });

    return result;
  }

  async upsertUserOverride(schoolId: string, userId: string, dto: UserPermissionOverrideDto, actorId: string) {
    await this.assertCanManagePermissions(schoolId, actorId);

    const user = await this.prisma.user.findFirst({ where: { id: userId, schoolId } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.userPermissionOverride.findFirst({
      where: {
        schoolId, userId,
        featureKey: dto.featureKey,
        subFeatureKey: dto.subFeatureKey ?? null,
        action: dto.action,
      },
    });

    const data = {
      schoolId, userId,
      featureKey: dto.featureKey,
      subFeatureKey: dto.subFeatureKey ?? null,
      action: dto.action,
      granted: dto.granted,
      updatedBy: actorId,
    };

    const result = existing
      ? await this.prisma.userPermissionOverride.update({ where: { id: existing.id }, data })
      : await this.prisma.userPermissionOverride.create({ data });

    await this.audit.logPermissionChange({
      schoolId, actorId,
      entityType: 'user_permission_override', entityId: result.id,
      before: existing ? { granted: existing.granted } : {},
      after: { granted: dto.granted },
    });

    return result;
  }

  async getRoleOverrides(schoolId: string, role: StaffRole) {
    return this.prisma.rolePermissionOverride.findMany({
      where: { schoolId, role },
    });
  }

  async deleteRoleOverride(
    schoolId: string,
    role: StaffRole,
    featureKey: string,
    subFeatureKey: string | null,
    action: string,
    actorId: string,
  ) {
    await this.assertCanManagePermissions(schoolId, actorId);

    const record = await this.prisma.rolePermissionOverride.findFirst({
      where: { schoolId, role, featureKey, subFeatureKey: subFeatureKey ?? null, action: action as any },
    });
    if (!record) return { deleted: false };
    await this.prisma.rolePermissionOverride.delete({ where: { id: record.id } });
    return { deleted: true };
  }

  async getUserOverrides(schoolId: string, userId: string) {
    return this.prisma.userPermissionOverride.findMany({
      where: { schoolId, userId },
    });
  }

  async deleteUserOverride(
    schoolId: string,
    userId: string,
    featureKey: string,
    subFeatureKey: string | null,
    action: string,
    actorId: string,
  ) {
    await this.assertCanManagePermissions(schoolId, actorId);

    const record = await this.prisma.userPermissionOverride.findFirst({
      where: { schoolId, userId, featureKey, subFeatureKey: subFeatureKey ?? null, action: action as any },
    });
    if (!record) return { deleted: false };
    await this.prisma.userPermissionOverride.delete({ where: { id: record.id } });
    return { deleted: true };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}

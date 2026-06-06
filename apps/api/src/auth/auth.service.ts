import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { StudentLoginDto } from './dto/student-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ── Staff Auth ────────────────────────────────────────────

  async staffLogin(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: {
        roles: true,
        school: { select: { onboardingComplete: true } },
      },
    });

    if (!user || !user.isActive)
      throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch)
      throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateStaffTokens(user);
    return {
      ...tokens,
      user: {
        ...this.sanitizeUser(user),
        onboardingComplete: user.school?.onboardingComplete ?? false,
      },
    };
  }

  async staffMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: true,
        school: { select: { onboardingComplete: true } },
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found');
    return {
      ...this.sanitizeUser(user),
      onboardingComplete: user.school?.onboardingComplete ?? false,
    };
  }

  async portalMe(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        portalCredential: true,
        classAssignments: {
          orderBy: { assignedAt: 'desc' },
          take: 1,
          include: { class: { select: { name: true } } },
        },
      },
    });
    if (!student) throw new UnauthorizedException('Student not found');
    return {
      id: student.id,
      schoolId: student.schoolId,
      studentId: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.classAssignments[0]?.class?.name ?? null,
      mustChangePassword: student.portalCredential?.mustChange ?? false,
    };
  }

  async staffRefresh(refreshToken: string) {
    const prefix = refreshToken.slice(0, 16);

    // Narrow the search to just the one record that could match this token
    const candidates = await this.prisma.refreshToken.findMany({
      where: {
        expiresAt: { gt: new Date() },
        // tokenPrefix may be null for tokens created before this fix
        OR: [{ tokenPrefix: prefix }, { tokenPrefix: null }],
      },
      include: { user: { include: { roles: true } } },
    });

    for (const record of candidates) {
      const match = await bcrypt.compare(refreshToken, record.tokenHash);
      if (match) {
        await this.prisma.refreshToken.delete({ where: { id: record.id } });
        return this.generateStaffTokens(record.user);
      }
    }

    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  async staffLogout(refreshToken: string) {
    const prefix = refreshToken.slice(0, 16);

    const candidates = await this.prisma.refreshToken.findMany({
      where: {
        expiresAt: { gt: new Date() },
        OR: [{ tokenPrefix: prefix }, { tokenPrefix: null }],
      },
    });

    for (const record of candidates) {
      const match = await bcrypt.compare(refreshToken, record.tokenHash);
      if (match) {
        await this.prisma.refreshToken.delete({ where: { id: record.id } });
        return { success: true };
      }
    }

    return { success: true };
  }

  // ── Student Portal Auth ───────────────────────────────────

  async portalLogin(dto: StudentLoginDto) {
    const student = await this.prisma.student.findFirst({
      where: { studentId: dto.studentId },
      include: { portalCredential: true },
    });

    if (!student || !student.portalCredential)
      throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(
      dto.password,
      student.portalCredential.passwordHash,
    );
    if (!passwordMatch)
      throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generatePortalTokens(student);
    return {
      ...tokens,
      mustChangePassword: student.portalCredential.mustChange,
      student: {
        id: student.id,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        schoolId: student.schoolId,
      },
    };
  }

  async portalRefresh(refreshToken: string) {
    const prefix = refreshToken.slice(0, 16);

    const candidates = await this.prisma.studentRefreshToken.findMany({
      where: {
        expiresAt: { gt: new Date() },
        OR: [{ tokenPrefix: prefix }, { tokenPrefix: null }],
      },
      include: { student: true },
    });

    for (const record of candidates) {
      const match = await bcrypt.compare(refreshToken, record.tokenHash);
      if (match) {
        await this.prisma.studentRefreshToken.delete({ where: { id: record.id } });
        return this.generatePortalTokens(record.student);
      }
    }

    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  async portalLogout(refreshToken: string) {
    const prefix = refreshToken.slice(0, 16);

    const candidates = await this.prisma.studentRefreshToken.findMany({
      where: {
        expiresAt: { gt: new Date() },
        OR: [{ tokenPrefix: prefix }, { tokenPrefix: null }],
      },
    });

    for (const record of candidates) {
      const match = await bcrypt.compare(refreshToken, record.tokenHash);
      if (match) {
        await this.prisma.studentRefreshToken.delete({ where: { id: record.id } });
        return { success: true };
      }
    }

    return { success: true };
  }

  // ── Token generation ──────────────────────────────────────

  async generateStaffTokens(user: any) {
    const payload = {
      sub: user.id,
      schoolId: user.schoolId,
      roles: user.roles.map((r: any) => r.role),
      type: 'staff',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_EXPIRES_IN'),
      }),
      this.generateOpaqueToken(),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId:      user.id,
        tokenPrefix: refreshToken.slice(0, 16),
        tokenHash:   await bcrypt.hash(refreshToken, 10),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private async generatePortalTokens(student: any) {
    const payload = {
      sub: student.id,
      schoolId: student.schoolId,
      type: 'portal',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_EXPIRES_IN'),
      }),
      this.generateOpaqueToken(),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.studentRefreshToken.create({
      data: {
        studentId:   student.id,
        tokenPrefix: refreshToken.slice(0, 16),
        tokenHash:   await bcrypt.hash(refreshToken, 10),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private generateOpaqueToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('hex');
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id,
      schoolId: user.schoolId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles.map((r: any) => r.role),
    };
  }
}

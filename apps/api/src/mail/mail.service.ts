import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private readonly brevo: BrevoClient;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('BREVO_API_KEY') ?? '';
    this.fromEmail = this.config.get<string>('MAIL_FROM_EMAIL') ?? 'noreply@schoolops.app';
    this.fromName  = this.config.get<string>('MAIL_FROM_NAME')  ?? 'SchoolOps';

    this.logger.log(`MailService init — API key loaded: ${apiKey ? 'YES (' + apiKey.slice(0, 8) + '…)' : 'NO (empty!)'}`);
    this.logger.log(`MailService init — sender: ${this.fromName} <${this.fromEmail}>`);

    this.brevo = new BrevoClient({ apiKey });
  }

  // ── Staff invite ──────────────────────────────────────────────────────────

  async sendStaffInvite(params: {
    to: string;
    firstName: string;
    schoolName: string;
    tempPassword: string;
    loginUrl: string;
  }) {
    const { to, firstName, schoolName, tempPassword, loginUrl } = params;

    await this.send({
      to,
      subject: `You've been added to ${schoolName} on SchoolOps`,
      html: `
        <p>Hi ${firstName},</p>
        <p>You have been added as a staff member on <strong>${schoolName}</strong> via SchoolOps.</p>
        <p>Your login details:</p>
        <ul>
          <li><strong>Email:</strong> ${to}</li>
          <li><strong>Temporary password:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${tempPassword}</code></li>
        </ul>
        <p>Please sign in and change your password immediately.</p>
        <p><a href="${loginUrl}" style="color:#065f46;">Sign in to SchoolOps →</a></p>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
          If you were not expecting this email, please ignore it.
        </p>
      `,
    });
  }

  // ── Staff password reset ──────────────────────────────────────────────────

  async sendPasswordReset(params: {
    to: string;
    firstName: string;
    tempPassword: string;
    loginUrl: string;
  }) {
    const { to, firstName, tempPassword, loginUrl } = params;

    await this.send({
      to,
      subject: 'Your SchoolOps password has been reset',
      html: `
        <p>Hi ${firstName},</p>
        <p>Your SchoolOps password has been reset by your school administrator.</p>
        <p>Your new temporary password:</p>
        <p><code style="background:#f1f5f9;padding:4px 10px;border-radius:4px;font-size:16px;">${tempPassword}</code></p>
        <p>Please sign in and change your password immediately.</p>
        <p><a href="${loginUrl}" style="color:#065f46;">Sign in →</a></p>
      `,
    });
  }

  // ── Student portal credentials ────────────────────────────────────────────

  async sendPortalCredentials(params: {
    to: string;
    studentName: string;
    schoolName: string;
    studentId: string;
    tempPassword: string;
    portalUrl: string;
  }) {
    const { to, studentName, schoolName, studentId, tempPassword, portalUrl } = params;

    await this.send({
      to,
      subject: `${studentName}'s SchoolOps portal access`,
      html: `
        <p>Hello,</p>
        <p>
          Portal access has been set up for <strong>${studentName}</strong>
          at <strong>${schoolName}</strong>.
        </p>
        <p>Login details for the student portal:</p>
        <ul>
          <li><strong>Student ID:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${studentId}</code></li>
          <li><strong>Temporary password:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${tempPassword}</code></li>
        </ul>
        <p>The password must be changed on first login.</p>
        <p><a href="${portalUrl}" style="color:#065f46;">Access the student portal →</a></p>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
          This email was sent on behalf of ${schoolName}.
        </p>
      `,
    });
  }

  // ── Core send ─────────────────────────────────────────────────────────────

  private async send(params: { to: string; subject: string; html: string }) {
    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        sender:  { name: this.fromName, email: this.fromEmail },
        to:      [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
      });
    } catch (err) {
      // Log but never throw — email failure must not break the primary operation
      this.logger.error(`Failed to send email to ${params.to}: ${JSON.stringify(err)}`);
    }
  }
}

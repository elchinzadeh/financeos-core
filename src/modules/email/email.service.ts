import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Ümumi email göndərmə xidməti (Resend). Xəta atmır — email çatdırılması "best-effort"dür,
 * çağıran endpoint-in nəticəsi provider-in etibarlılığına bağlanmasın deyə (bax
 * docs/decisions/0019-email-infrastructure.md).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);

  async send(params: SendEmailParams): Promise<void> {
    const from = process.env.EMAIL_FROM ?? 'FinanceOS <onboarding@resend.dev>';
    try {
      const { error } = await this.resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (error) {
        this.logger.error(`Email göndərilmədi (to=${params.to}): ${error.message}`);
      }
    } catch (err) {
      this.logger.error(`Email göndərilmədi (to=${params.to}): ${(err as Error).message}`);
    }
  }
}

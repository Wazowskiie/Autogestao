import { Global, Injectable, Logger, Module } from '@nestjs/common';

export interface MailMessage { to: string; subject: string; html: string; text: string }

/**
 * Envio de e-mail pelo Resend (https://resend.com), pela API HTTP.
 * Configuração no .env:
 *   RESEND_API_KEY=re_...
 *   MAIL_FROM="AutoGestão <nao-responda@chronosauto.com.br>"   (domínio verificado no Resend)
 * Sem RESEND_API_KEY, nada é enviado e isEnabled() responde false.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('E-mail');

  isEnabled() {
    return !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
  }

  async send(msg: MailMessage): Promise<boolean> {
    if (!this.isEnabled()) {
      this.log.warn('Envio de e-mail não configurado (RESEND_API_KEY / MAIL_FROM)');
      return false;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.log.error(`Resend respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.error(`Falha ao enviar e-mail: ${(e as Error).message}`);
      return false;
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}

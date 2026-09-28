import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { SmtpMailer } from '../src/modules/mail/mailer';
import { passwordResetEmail } from '../src/modules/mail/templates';

interface MailpitList {
  messages: { Subject: string; To: { Address: string }[] }[];
}

describe('SmtpMailer (Mailpit real)', () => {
  let mailpit: StartedTestContainer;

  beforeAll(async () => {
    mailpit = await new GenericContainer('axllent/mailpit:v1.29')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/readyz', 8025))
      .start();
  });

  afterAll(async () => {
    await mailpit.stop();
  });

  it('envía el correo de recuperación por SMTP', async () => {
    const mailer = new SmtpMailer({
      SMTP_HOST: mailpit.getHost(),
      SMTP_PORT: mailpit.getMappedPort(1025),
      SMTP_SECURE: false,
      MAIL_FROM: 'AndERP <no-reply@anderp.test>',
    } as Env);

    await mailer.send(
      passwordResetEmail({
        to: 'ana@empresa.co',
        firstName: 'Ana <script>',
        link: 'http://localhost:5173/restablecer?token=abc',
        expiresInMinutes: 30,
      }),
    );

    const api = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`;
    const list = (await (await fetch(`${api}/messages`)).json()) as MailpitList;
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0]).toMatchObject({
      Subject: 'Restablece tu contraseña de AndERP',
      To: [{ Address: 'ana@empresa.co' }],
    });

    const html = (await (await fetch(`${api}/message/latest`)).json()) as { HTML: string };
    // El nombre se escapa: nada de HTML inyectado desde datos del usuario.
    expect(html.HTML).toContain('Ana &lt;script&gt;');
    expect(html.HTML).toContain('http://localhost:5173/restablecer?token=abc');
  });
});

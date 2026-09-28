import type { MailMessage } from './mailer';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 520px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 20px;">${escapeHtml(title)}</h1>
      ${body}
      <p style="color: #6b7280; font-size: 12px;">Este correo fue enviado por AndERP. Si no esperabas recibirlo, ignóralo.</p>
    </div>
  </body>
</html>`;
}

export function passwordResetEmail(input: {
  to: string;
  firstName: string;
  link: string;
  expiresInMinutes: number;
}): MailMessage {
  const title = 'Restablece tu contraseña de AndERP';
  return {
    to: input.to,
    subject: title,
    text: [
      `Hola ${input.firstName}:`,
      '',
      'Recibimos una solicitud para restablecer tu contraseña. Abre este enlace para elegir una nueva:',
      input.link,
      '',
      `El enlace vence en ${input.expiresInMinutes} minutos y solo se puede usar una vez.`,
      'Si no lo solicitaste, ignora este correo; tu contraseña no cambiará.',
    ].join('\n'),
    html: layout(
      title,
      `<p>Hola ${escapeHtml(input.firstName)}:</p>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${escapeHtml(input.link)}" style="display: inline-block; background: #111827; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">Elegir una nueva contraseña</a></p>
      <p>El enlace vence en ${input.expiresInMinutes} minutos y solo se puede usar una vez. Si no lo solicitaste, ignora este correo; tu contraseña no cambiará.</p>`,
    ),
  };
}

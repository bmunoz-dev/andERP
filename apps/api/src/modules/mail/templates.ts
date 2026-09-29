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

function button(link: string, label: string): string {
  return `<p><a href="${escapeHtml(link)}" style="display: inline-block; background: #111827; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">${escapeHtml(label)}</a></p>`;
}

/** Invitación a una persona que aún no tiene contraseña (F02 CA-11). */
export function invitationEmail(input: {
  to: string;
  firstName: string;
  organizationName: string;
  link: string;
  expiresInHours: number;
}): MailMessage {
  const title = 'Te invitaron a AndERP';
  return {
    to: input.to,
    subject: `${title} — ${input.organizationName}`,
    text: [
      `Hola ${input.firstName}:`,
      '',
      `Te invitaron a usar AndERP en ${input.organizationName}. Abre este enlace para elegir tu contraseña y activar tu cuenta:`,
      input.link,
      '',
      `El enlace vence en ${input.expiresInHours} horas y solo se puede usar una vez.`,
    ].join('\n'),
    html: layout(
      title,
      `<p>Hola ${escapeHtml(input.firstName)}:</p>
      <p>Te invitaron a usar AndERP en <strong>${escapeHtml(input.organizationName)}</strong>.</p>
      ${button(input.link, 'Activar mi cuenta')}
      <p>El enlace vence en ${input.expiresInHours} horas y solo se puede usar una vez.</p>`,
    ),
  };
}

/** Aviso a alguien que ya tiene cuenta y fue agregado a otra organización. */
export function addedToOrganizationEmail(input: {
  to: string;
  firstName: string;
  organizationName: string;
  loginUrl: string;
}): MailMessage {
  const title = `Ahora tienes acceso a ${input.organizationName}`;
  return {
    to: input.to,
    subject: `${title} en AndERP`,
    text: [
      `Hola ${input.firstName}:`,
      '',
      `Te agregaron a ${input.organizationName} en AndERP. Entra con tu correo y tu contraseña de siempre:`,
      input.loginUrl,
    ].join('\n'),
    html: layout(
      title,
      `<p>Hola ${escapeHtml(input.firstName)}:</p>
      <p>Te agregaron a <strong>${escapeHtml(input.organizationName)}</strong> en AndERP. Entra con tu correo y tu contraseña de siempre.</p>
      ${button(input.loginUrl, 'Ir a AndERP')}`,
    ),
  };
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

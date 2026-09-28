import nodemailer from "nodemailer";
import {
  smtpFrom,
  smtpHost,
  smtpPassword,
  smtpPort,
  smtpSecure,
  smtpUser,
} from "../config/env.js";

export class EmailConfigurationError extends Error {}

let transport;

export function getContactReplyEmailConfigIssue() {
  const hasValidPort = Number.isInteger(smtpPort) && smtpPort > 0 && smtpPort <= 65535;
  const hasCompleteAuth = Boolean(smtpUser) === Boolean(smtpPassword);
  if (!smtpHost || !smtpFrom || !hasValidPort || !hasCompleteAuth) {
    return "Chưa cấu hình SMTP đầy đủ. Kiểm tra SMTP_HOST, SMTP_PORT, SMTP_FROM và cặp SMTP_USER/SMTP_PASSWORD.";
  }
  if (/example\.(com|net|org)|your[-_ ]smtp/i.test(smtpHost)) {
    return "SMTP_HOST vẫn đang là giá trị mẫu. Hãy thay bằng máy chủ SMTP thật do nhà cung cấp email cung cấp.";
  }
  if (/example\.(com|net|org)/i.test(smtpFrom)) {
    return "SMTP_FROM vẫn đang là địa chỉ mẫu. Hãy thay bằng địa chỉ gửi email thật.";
  }
  return null;
}

export function isContactReplyEmailConfigured() {
  return getContactReplyEmailConfigIssue() === null;
}

export async function sendContactReply({ recipient, recipientName, contactSubject, message }) {
  const configurationIssue = getContactReplyEmailConfigIssue();
  if (configurationIssue) throw new EmailConfigurationError(configurationIssue);

  if (!transport) {
    transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  await transport.sendMail({
    from: smtpFrom,
    to: recipient,
    subject: "Phản hồi từ nhà trường",
    text: `Xin chào ${recipientName},\n\n${message}\n\n---\nNội dung liên hệ của bạn: ${contactSubject}\n\nTrân trọng,\nNhà trường`,
  });
}

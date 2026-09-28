import "dotenv/config";

export const jwtSecret = process.env.JWT_SECRET?.trim();
if (!jwtSecret) throw new Error("JWT_SECRET chưa được cấu hình");

export const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";
export const port = Number(process.env.PORT ?? 3000);

export const r2Endpoint = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();
export const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
export const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
export const r2BucketName = process.env.CLOUDFLARE_R2_BUCKET?.trim();
export const r2Enabled = Boolean(r2Endpoint && r2AccessKeyId && r2SecretAccessKey && r2BucketName);

export const smtpHost = process.env.SMTP_HOST?.trim();
export const smtpPort = Number(process.env.SMTP_PORT || 587);
export const smtpSecure = process.env.SMTP_SECURE?.trim().toLowerCase() === "true" || smtpPort === 465;
export const smtpUser = process.env.SMTP_USER?.trim();
export const smtpPassword = process.env.SMTP_PASSWORD;
export const smtpFrom = process.env.SMTP_FROM?.trim();

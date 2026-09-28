import "dotenv/config";
import bcrypt from "bcrypt";
import pg from "pg";

const { Pool } = pg;
const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME?.trim() || "Quản trị viên";
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
const role = process.env.ADMIN_ROLE?.trim().toLowerCase() || "admin";

if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL trong .env");
if (!username || !/^[a-z0-9._-]{3,100}$/.test(username)) {
  throw new Error("ADMIN_USERNAME phải có 3-100 ký tự thường, số, dấu chấm, gạch dưới hoặc gạch ngang");
}
if (!password || password.length < 8) throw new Error("ADMIN_PASSWORD phải có ít nhất 8 ký tự");
if (!["admin", "principal"].includes(role)) throw new Error("ADMIN_ROLE chỉ được là admin hoặc principal");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO school.users
      (username, email, password_hash, full_name, role, status, must_change_password, password_changed_at)
     VALUES ($1, $2, $3, $4, $5, 'active', false, now())
     ON CONFLICT (username) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       status = 'active',
       must_change_password = false,
       password_changed_at = now(),
       disabled_at = NULL
     RETURNING id, username, role, status`,
    [username, email, passwordHash, fullName, role],
  );
  console.log(`Admin ready: ${rows[0].username} (${rows[0].role}, ${rows[0].status})`);
} finally {
  await pool.end();
}

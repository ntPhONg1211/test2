import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export default function registerPublicRoutes(app, { pool, jwtSecret, authenticate }) {
app.get("/api/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok" }); } catch { res.status(503).json({ status: "unavailable" }); }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Thiếu tài khoản hoặc mật khẩu" });
    const { rows } = await pool.query("SELECT id, username, full_name, password_hash, role, status, must_change_password FROM school.users WHERE username = $1", [username.toLowerCase()]);
    const user = rows[0];
    if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ message: "Tài khoản hoặc mật khẩu không đúng" });
    const token = jwt.sign({ sub: user.id, role: user.role, username: user.username }, jwtSecret, { expiresIn: "8h" });
    await pool.query("UPDATE school.users SET last_login_at = now() WHERE id = $1", [user.id]);
    res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, mustChangePassword: user.must_change_password } });
  } catch (error) {
    if (error.code === "28P01" || error.code === "3D000" || error.code === "ENOTFOUND") {
      return res.status(503).json({ message: "Không thể kết nối cơ sở dữ liệu. Kiểm tra DATABASE_URL trong file .env." });
    }
    next(error);
  }
});
app.get("/api/news", async (_req, res, next) => { try { const { rows } = await pool.query("SELECT id, type, title, slug, excerpt, cover_url, is_featured, published_at FROM school.contents WHERE status = 'published' ORDER BY is_featured DESC, published_at DESC NULLS LAST LIMIT 12"); res.json(rows); } catch (error) { next(error); } });
app.get("/api/pages", async (_req, res, next) => { try { const { rows } = await pool.query("SELECT slug, title, body, updated_at FROM school.school_pages ORDER BY id"); res.json(rows); } catch (error) { next(error); } });
app.get("/api/admissions/campaigns", async (_req, res, next) => { try { const { rows } = await pool.query("SELECT id, name, slug, description, opens_at, closes_at, appointment_start_date, daily_queue_limit FROM school.admission_campaigns WHERE is_open = true AND now() BETWEEN opens_at AND closes_at ORDER BY opens_at"); res.json(rows); } catch (error) { next(error); } });
app.post("/api/admissions/applications", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { firstName, lastName, dateOfBirth, gender = null, address, parentName, parentPhone, parentEmail = null, desiredGradeId = null, campaignId = null } = req.body;
    if (!firstName || !lastName || !dateOfBirth || !address || !parentName || !parentPhone) return res.status(400).json({ message: "Vui lòng nhập đủ thông tin bắt buộc" });
    await client.query("BEGIN");
    const campaign = await client.query("SELECT id, appointment_start_date, daily_queue_limit FROM school.admission_campaigns WHERE is_open = true AND now() BETWEEN opens_at AND closes_at AND ($1::uuid IS NULL OR id = $1) ORDER BY opens_at LIMIT 1 FOR UPDATE", [campaignId || null]);
    if (!campaign.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Hiện chưa có đợt tuyển sinh đang mở" });
    }
    const code = `HS-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const applicant = await client.query("INSERT INTO school.admission_applicants (campaign_id, applicant_code, first_name, last_name, date_of_birth, gender, address, desired_grade_id, parent_name, parent_phone, parent_email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, applicant_code, status, submitted_at", [campaign.rows[0].id, code, firstName, lastName, dateOfBirth, gender, address, desiredGradeId || null, parentName, parentPhone, parentEmail]);
    const dailyLimit = campaign.rows[0].daily_queue_limit || 200;
    const queue = await client.query(`
      WITH dates AS (
        SELECT GREATEST(
          COALESCE(MAX(appointment_date), '0001-01-01'::date),
          $2::date,
          CURRENT_DATE
        ) AS appointment_date
        FROM school.admission_appointments a
        JOIN school.admission_applicants p ON p.id = a.applicant_id
        WHERE p.campaign_id = $1
      )
      SELECT appointment_date::text AS appointment_date, COALESCE((
        SELECT MAX(a.queue_number) FROM school.admission_appointments a
        JOIN school.admission_applicants p ON p.id = a.applicant_id
        WHERE p.campaign_id = $1 AND a.appointment_date = dates.appointment_date
      ), 0) + 1 AS number
      FROM dates
    `, [campaign.rows[0].id, campaign.rows[0].appointment_start_date]);
    let appointmentDate = queue.rows[0].appointment_date;
    let queueNumber = Number(queue.rows[0].number);
    while (queueNumber > dailyLimit) {
      appointmentDate = new Date(`${appointmentDate}T00:00:00Z`);
      appointmentDate.setUTCDate(appointmentDate.getUTCDate() + 1);
      appointmentDate = appointmentDate.toISOString().slice(0, 10);
      const nextQueue = await client.query("SELECT COALESCE(MAX(a.queue_number), 0) + 1 AS number FROM school.admission_appointments a JOIN school.admission_applicants p ON p.id = a.applicant_id WHERE p.campaign_id = $1 AND a.appointment_date = $2", [campaign.rows[0].id, appointmentDate]);
      queueNumber = Number(nextQueue.rows[0].number);
    }
    const appointment = await client.query("INSERT INTO school.admission_appointments (applicant_id, appointment_date, queue_number) VALUES ($1,$2,$3) RETURNING appointment_date::text AS appointment_date, queue_number, status", [applicant.rows[0].id, appointmentDate, queueNumber]);
    await client.query("COMMIT");
    res.status(201).json({ applicant: applicant.rows[0], appointment: appointment.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && error.constraint === "admission_applicants_no_duplicate_idx") {
      return res.status(409).json({ message: "Hồ sơ này đã được gửi trước đó. Vui lòng kiểm tra lại mã hồ sơ hoặc thông tin đã đăng ký." });
    }
    next(error);
  } finally { client.release(); }
});
app.post("/api/contacts", async (req, res, next) => {
  try {
    const { senderName, senderEmail = null, senderPhone = null, subject, message } = req.body;
    const name = typeof senderName === "string" ? senderName.trim() : "";
    const email = typeof senderEmail === "string" && senderEmail.trim() ? senderEmail.trim() : null;
    const phone = typeof senderPhone === "string" && senderPhone.trim() ? senderPhone.trim() : null;
    const contactSubject = typeof subject === "string" ? subject.trim() : "";
    const contactMessage = typeof message === "string" ? message.trim() : "";
    if (!name || !contactSubject || !contactMessage) {
      return res.status(400).json({ message: "Vui lòng nhập họ tên, chủ đề và nội dung" });
    }
    if (name.length > 200 || email?.length > 320 || phone?.length > 30 || contactSubject.length > 300) {
      return res.status(400).json({ message: "Thông tin liên hệ vượt quá độ dài cho phép." });
    }
    const { rows } = await pool.query(
      "INSERT INTO school.contacts (sender_name, sender_email, sender_phone, subject, message) VALUES ($1,$2,$3,$4,$5) RETURNING id, status, created_at",
      [name, email, phone, contactSubject, contactMessage],
    );
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});
app.get("/api/me", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, email, full_name, phone, role, status FROM school.users WHERE id = $1",
      [req.user.sub]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng." });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/account/change-password", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) return res.status(400).json({ message: "Vui lòng nhập đầy đủ các trường mật khẩu." });
    if (newPassword.length < 6) return res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự." });
    if (newPassword !== confirmPassword) return res.status(400).json({ message: "Mật khẩu mới và xác nhận mật khẩu không khớp." });

    const { rows } = await pool.query("SELECT password_hash, must_change_password FROM school.users WHERE id = $1", [req.user.sub]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng." });
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ message: "Mật khẩu hiện tại không đúng." });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE school.users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2", [passwordHash, req.user.sub]);
    res.json({ message: "Đổi mật khẩu thành công." });
  } catch (error) {
    next(error);
  }
});
}

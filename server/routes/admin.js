import bcrypt from "bcrypt";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import pdfmake from "pdfmake";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  EmailConfigurationError,
  getContactReplyEmailConfigIssue,
  sendContactReply,
} from "../services/email.js";
import { parseStudentRoster } from "../utils/student-roster.js";
import { r2AccessKeyId, r2BucketName, r2Enabled, r2Endpoint, r2SecretAccessKey } from "../config/env.js";

const contactIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const credentialsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../storage/student-credential-files",
);
const r2Client = r2Enabled ? new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
}) : null;
const pdfFontDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/pdfmake/fonts/Roboto",
);
pdfmake.setFonts({
  Roboto: {
    normal: path.join(pdfFontDirectory, "Roboto-Regular.ttf"),
    bold: path.join(pdfFontDirectory, "Roboto-Medium.ttf"),
    italics: path.join(pdfFontDirectory, "Roboto-Italic.ttf"),
    bolditalics: path.join(pdfFontDirectory, "Roboto-MediumItalic.ttf"),
  },
});
const allowedPdfFontPaths = new Set([
  "Roboto-Regular.ttf",
  "Roboto-Medium.ttf",
  "Roboto-Italic.ttf",
  "Roboto-MediumItalic.ttf",
].map((fontFile) => path.resolve(pdfFontDirectory, fontFile)));
pdfmake.setLocalAccessPolicy((resourcePath) => (
  typeof resourcePath === "string" && allowedPdfFontPaths.has(path.resolve(resourcePath))
));
pdfmake.setUrlAccessPolicy(() => false);
const importFileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const studentRosterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      callback(new Error("Chỉ chấp nhận file Excel .xlsx."));
      return;
    }
    callback(null, true);
  },
});

function handleStudentRosterUpload(req, res, next) {
  studentRosterUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        message: error.code === "LIMIT_FILE_SIZE"
          ? "File Excel vượt quá giới hạn 5 MB."
          : "Yêu cầu tải file không hợp lệ.",
      });
    }
    if (error.message === "Chỉ chấp nhận file Excel .xlsx.") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  });
}

function normalizeRosterValue(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function extractAcademicYearPrefix(academicYearName) {
  if (!academicYearName) {
    const year = new Date().getFullYear();
    return `${String(year).slice(2)}${String(year + 1).slice(2)}`;
  }
  const match = String(academicYearName).match(/(\d{4})\s*-\s*(\d{4})/);
  if (match) {
    return `${match[1].slice(2)}${match[2].slice(2)}`;
  }
  const singleYearMatch = String(academicYearName).match(/(\d{4})/);
  if (singleYearMatch) {
    return `${singleYearMatch[1].slice(2)}${String(Number(singleYearMatch[1]) + 1).slice(2)}`;
  }
  const year = new Date().getFullYear();
  return `${String(year).slice(2)}${String(year + 1).slice(2)}`;
}

function generateStudentCode(academicYearName, sequence) {
  return `HS${extractAcademicYearPrefix(academicYearName)}-${String(sequence).padStart(4, "0")}`;
}

async function getNextStudentSequence(client, academicYearName) {
  const prefix = extractAcademicYearPrefix(academicYearName);
  const { rows } = await client.query(
    `SELECT COALESCE(MAX((REGEXP_REPLACE(student_code, '^HS' || $1 || '-', '', 'i'))::int), 0) + 1 AS next_sequence
     FROM school.students
     WHERE student_code ~ ('^HS' || $1 || '-[0-9]{4}$')`,
    [prefix],
  );
  return Number(rows[0]?.next_sequence ?? 1);
}

async function createStudentCredentialsPdf(credentials, academicYearName) {
  const body = [
    [
      { text: "Mã học sinh", style: "tableHeader" },
      { text: "Họ và tên", style: "tableHeader" },
      { text: "Tên đăng nhập", style: "tableHeader" },
      { text: "Mật khẩu tạm", style: "tableHeader" },
    ],
    ...credentials.map((item) => [
      item.studentCode,
      item.fullName,
      item.username,
      item.temporaryPassword,
    ]),
  ];
  const document = pdfmake.createPdf({
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 34, 28, 34],
    defaultStyle: { font: "Roboto", fontSize: 9 },
    content: [
      { text: "TÀI KHOẢN HỌC SINH", style: "title" },
      { text: `Năm học: ${academicYearName}`, margin: [0, 0, 0, 4] },
      { text: `Số tài khoản: ${credentials.length}`, margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: [145, "*", 150, 160],
          body,
        },
        layout: "lightHorizontalLines",
      },
      {
        text: "Tài liệu chứa mật khẩu tạm. Chỉ cung cấp cho người nhận phù hợp và xóa file khi không còn cần sử dụng.",
        fontSize: 8,
        margin: [0, 14, 0, 0],
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
      tableHeader: { bold: true, fillColor: "#e8f8ef" },
    },
    footer: (currentPage, pageCount) => ({
      text: `Trang ${currentPage} / ${pageCount}`,
      alignment: "right",
      fontSize: 8,
      margin: [0, 12, 28, 0],
    }),
  });
  return document.getBuffer();
}

async function uploadStudentCredentialPdf(fileId, pdfBuffer, pdfFileName) {
  if (!r2Enabled || !r2Client) {
    await mkdir(credentialsDirectory, { recursive: true });
    const savedPath = path.join(credentialsDirectory, `${fileId}.pdf`);
    await writeFile(savedPath, pdfBuffer, { flag: "wx", mode: 0o600 });
    return { storedLocally: true, savedPath };
  }

  const key = `student-credentials/${new Date().getFullYear()}/${fileId}.pdf`;
  await r2Client.send(new PutObjectCommand({
    Bucket: r2BucketName,
    Key: key,
    Body: pdfBuffer,
    ContentType: "application/pdf",
    Metadata: {
      pdfFileName,
      source: "student-import",
    },
  }));
  return { storedLocally: false, key };
}

async function downloadR2StudentCredentialPdf(fileId) {
  if (!r2Enabled || !r2Client) {
    return {
      filePath: path.join(credentialsDirectory, `${fileId}.pdf`),
      contentType: "application/pdf",
      isR2: false,
    };
  }

  const key = `student-credentials/${new Date().getFullYear()}/${fileId}.pdf`;
  const object = await r2Client.send(new GetObjectCommand({
    Bucket: r2BucketName,
    Key: key,
  }));

  return {
    body: object.Body,
    contentType: object.ContentType || "application/pdf",
    isR2: true,
    key,
  };
}

async function deleteR2StudentCredentialPdf(fileId) {
  if (!r2Enabled || !r2Client) {
    const filePath = path.join(credentialsDirectory, `${fileId}.pdf`);
    try {
      await unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return;
  }

  const key = `student-credentials/${new Date().getFullYear()}/${fileId}.pdf`;
  await r2Client.send(new DeleteObjectCommand({
    Bucket: r2BucketName,
    Key: key,
  }));
}

export default function registerAdminRoutes(app, { pool, authenticate, allow }) {
app.get("/api/admin/admission-applicants", authenticate, allow("admin", "principal"), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.applicant_code, a.first_name, a.last_name, a.date_of_birth,
             a.gender, a.address, a.desired_grade_id, g.name AS desired_grade_name,
             a.parent_name, a.parent_phone, a.parent_email, a.status, a.submitted_at,
             c.name AS campaign_name, ap.appointment_date::text AS appointment_date,
             ap.queue_number, ap.status AS appointment_status
      FROM school.admission_applicants a
      JOIN school.admission_campaigns c ON c.id = a.campaign_id
      LEFT JOIN school.grades g ON g.id = a.desired_grade_id
      LEFT JOIN school.admission_appointments ap ON ap.applicant_id = a.id
      ORDER BY a.submitted_at DESC
    `);
    res.json(rows);
  } catch (error) { next(error); }
});
app.get("/api/admin/users", authenticate, allow("admin"), async (_req, res, next) => { try { const { rows } = await pool.query("SELECT id, username, email, full_name, role, status, created_at FROM school.users ORDER BY created_at DESC"); res.json(rows); } catch (error) { next(error); } });
app.get("/api/admin/students", authenticate, allow("admin"), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT st.id, st.student_code, st.first_name, st.last_name, st.date_of_birth,
             st.gender, st.guardian_name, st.guardian_phone, st.guardian_email,
             st.previous_class_name, st.student_category, st.notes,
             u.username, u.full_name, u.status AS account_status,
             active_class.id AS current_class_id,
             active_class.name AS current_class_name,
             active_class.academic_year_name
      FROM school.users u
      JOIN school.students st ON st.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT c.id, c.name, ay.name AS academic_year_name, ay.starts_on
        FROM school.class_students cs
        JOIN school.classes c ON c.id = cs.class_id
        JOIN school.academic_years ay ON ay.id = c.academic_year_id
        WHERE cs.student_id = st.id AND cs.left_at IS NULL
        ORDER BY ay.starts_on DESC
        LIMIT 1
      ) active_class ON true
      WHERE u.role = 'student'
      ORDER BY u.full_name, st.student_code
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});
app.get("/api/admin/student-import-files", authenticate, allow("admin"), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id, f.source_file, f.pdf_file_name, f.student_count, f.storage_key, f.created_at,
             ay.name AS academic_year_name, u.full_name AS created_by_name
      FROM school.student_import_files f
      JOIN school.academic_years ay ON ay.id = f.academic_year_id
      JOIN school.users u ON u.id = f.created_by
      ORDER BY f.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});
app.get("/api/admin/student-import-files/:id/download", authenticate, allow("admin"), async (req, res, next) => {
  try {
    if (!importFileIdPattern.test(req.params.id)) {
      return res.status(404).json({ message: "Không tìm thấy file thông tin đăng nhập." });
    }
    const { rows } = await pool.query(
      "SELECT id, pdf_file_name FROM school.student_import_files WHERE id = $1",
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ message: "Không tìm thấy file thông tin đăng nhập." });

    const fileInfo = await downloadR2StudentCredentialPdf(rows[0].id);
    res.setHeader("Cache-Control", "private, no-store");
    if (fileInfo.isR2 && fileInfo.body) {
      res.setHeader("Content-Type", fileInfo.contentType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${rows[0].pdf_file_name}"`);
      return res.send(Buffer.from(await fileInfo.body.arrayBuffer()));
    }

    res.download(fileInfo.filePath, rows[0].pdf_file_name, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});
app.delete("/api/admin/student-import-files/:id", authenticate, allow("admin"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!importFileIdPattern.test(req.params.id)) {
      return res.status(404).json({ message: "Không tìm thấy file thông tin đăng nhập." });
    }
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id FROM school.student_import_files WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy file thông tin đăng nhập." });
    }
    try {
      await deleteR2StudentCredentialPdf(rows[0].id);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await client.query("DELETE FROM school.student_import_files WHERE id = $1", [rows[0].id]);
    await client.query("COMMIT");
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});
app.post("/api/admin/students/import", authenticate, allow("admin"), handleStudentRosterUpload, async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: "Vui lòng chọn file Excel .xlsx." });
  if (!req.body.academicYearId) return res.status(400).json({ message: "Vui lòng chọn năm học để tạo lớp và yêu cầu xếp lớp." });

  let parsed;
  try {
    parsed = await parseStudentRoster(req.file.buffer);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Không thể đọc file Excel." });
  }

  const errors = [...parsed.errors];
  if (!parsed.records.length) {
    return res.json({
      importedCount: 0,
      failedCount: errors.length,
      classesCreated: 0,
      credentials: [],
      errors,
    });
  }

  const client = await pool.connect();
  const credentials = [];
  let classesCreated = 0;
  let savedPdfPath = null;
  try {
    await client.query("BEGIN");
    const yearResult = await client.query(
      "SELECT id, name FROM school.academic_years WHERE id = $1",
      [req.body.academicYearId],
    );
    if (!yearResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Năm học được chọn không tồn tại." });
    }

    const gradesResult = await client.query("SELECT id, code, name FROM school.grades");
    const classIds = new Map();
    const classErrors = new Map();
    const nextStudentSequence = await getNextStudentSequence(client, yearResult.rows[0].name);
    let currentStudentSequence = nextStudentSequence;
    const classCodes = [...new Set(parsed.records.map((record) => record.classCode))];
    for (const classCode of classCodes) {
      const gradeNumber = classCode.match(/^(\d{1,2})/)?.[1];
      const grade = gradesResult.rows.find((item) => {
        const normalizedName = normalizeRosterValue(item.name);
        const normalizedCode = normalizeRosterValue(item.code);
        return normalizedName === `khoi ${gradeNumber}`
          || normalizedCode === gradeNumber
          || normalizedCode === `g${gradeNumber}`
          || normalizedCode === `grade${gradeNumber}`;
      });
      if (!grade) {
        classErrors.set(classCode, `Không tìm thấy khối ${gradeNumber} để tạo lớp ${classCode}.`);
        continue;
      }

      const existingClass = await client.query(
        "SELECT id, grade_id FROM school.classes WHERE academic_year_id = $1 AND upper(code) = $2",
        [req.body.academicYearId, classCode],
      );
      if (existingClass.rows[0]) {
        if (existingClass.rows[0].grade_id !== grade.id) {
          classErrors.set(classCode, `Mã lớp ${classCode} đã tồn tại nhưng thuộc khối khác.`);
        } else {
          classIds.set(classCode, existingClass.rows[0].id);
        }
        continue;
      }

      const createdClass = await client.query(
        `INSERT INTO school.classes (academic_year_id, grade_id, code, name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (academic_year_id, code) DO NOTHING
         RETURNING id`,
        [req.body.academicYearId, grade.id, classCode, `Lớp ${classCode}`],
      );
      if (createdClass.rows[0]) {
        classIds.set(classCode, createdClass.rows[0].id);
        classesCreated += 1;
      } else {
        const concurrentClass = await client.query(
          "SELECT id, grade_id FROM school.classes WHERE academic_year_id = $1 AND upper(code) = $2",
          [req.body.academicYearId, classCode],
        );
        if (concurrentClass.rows[0]?.grade_id === grade.id) {
          classIds.set(classCode, concurrentClass.rows[0].id);
        } else {
          classErrors.set(classCode, `Không thể tạo lớp ${classCode} trong năm học đã chọn.`);
        }
      }
    }

    const seenStudents = new Set();
    for (const record of parsed.records) {
      if (classErrors.has(record.classCode)) {
        errors.push({ sheet: record.sheet, row: record.row, message: classErrors.get(record.classCode) });
        continue;
      }
      const duplicateKey = `${normalizeRosterValue(record.fullName)}|${record.dateOfBirth}`;
      if (seenStudents.has(duplicateKey)) {
        errors.push({ sheet: record.sheet, row: record.row, message: "Học sinh bị lặp trong file (trùng họ tên và ngày sinh)." });
        continue;
      }
      seenStudents.add(duplicateKey);

      await client.query("SAVEPOINT import_student");
      try {
        const duplicate = await client.query(
          `SELECT st.id
           FROM school.students st
           JOIN school.users u ON u.id = st.user_id
           WHERE u.role = 'student'
             AND lower(trim(u.full_name)) = lower(trim($1))
             AND st.date_of_birth = $2::date
           LIMIT 1`,
          [record.fullName, record.dateOfBirth],
        );
        if (duplicate.rows[0]) {
          await client.query("ROLLBACK TO SAVEPOINT import_student");
          await client.query("RELEASE SAVEPOINT import_student");
          errors.push({ sheet: record.sheet, row: record.row, message: "Học sinh đã tồn tại trong hệ thống." });
          continue;
        }

        const username = `hs.${randomBytes(8).toString("hex")}`;
        const temporaryPassword = `Truonghoc-${randomBytes(6).toString("hex")}`;
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        const studentCode = generateStudentCode(yearResult.rows[0].name, currentStudentSequence);
        currentStudentSequence += 1;
        const nameParts = record.fullName.split(/\s+/);
        const firstName = nameParts.pop();
        const userResult = await client.query(
          `INSERT INTO school.users
             (username, password_hash, full_name, role, status, must_change_password)
           VALUES ($1, $2, $3, 'student', 'active', true)
           RETURNING id, username`,
          [username, passwordHash, record.fullName],
        );
        const studentResult = await client.query(
          `INSERT INTO school.students
             (user_id, student_code, first_name, last_name, date_of_birth, gender,
              previous_class_name, student_category, notes)
           VALUES
             ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, student_code`,
          [
            userResult.rows[0].id,
            studentCode,
            firstName,
            nameParts.join(" "),
            record.dateOfBirth,
            record.gender,
            record.previousClass || null,
            record.category || null,
            record.notes || null,
          ],
        );
        await client.query(
          `INSERT INTO school.student_class_requests
             (student_id, request_type, requested_class_id, requested_by)
           VALUES ($1, 'enroll', $2, $3)`,
          [studentResult.rows[0].id, classIds.get(record.classCode), req.user.sub],
        );
        await client.query("RELEASE SAVEPOINT import_student");
        credentials.push({
          studentCode: studentResult.rows[0].student_code,
          fullName: record.fullName,
          username: userResult.rows[0].username,
          temporaryPassword,
        });
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT import_student");
        await client.query("RELEASE SAVEPOINT import_student");
        if (error.code === "23505") {
          errors.push({ sheet: record.sheet, row: record.row, message: "Trùng tài khoản hoặc hồ sơ đã tồn tại." });
          continue;
        }
        throw error;
      }
    }

    if (!credentials.length) {
      await client.query("ROLLBACK");
      return res.json({
        importedCount: 0,
        failedCount: errors.length,
        classesCreated: 0,
        credentials: [],
        errors,
      });
    }

    const fileId = randomUUID();
    const pdfFileName = `tai-khoan-hoc-sinh-${fileId.slice(0, 8)}.pdf`;
    const sourceFile = req.file.originalname.replace(/\\/g, "/").split("/").pop().slice(0, 255) || "DSHS.xlsx";
    const pdfBuffer = await createStudentCredentialsPdf(credentials, yearResult.rows[0].name);
    const uploadResult = await uploadStudentCredentialPdf(fileId, pdfBuffer, pdfFileName);
    if (uploadResult.storedLocally) {
      savedPdfPath = uploadResult.savedPath;
    }
    const fileResult = await client.query(
      `INSERT INTO school.student_import_files
         (id, academic_year_id, created_by, source_file, pdf_file_name, storage_key, student_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, source_file, pdf_file_name, storage_key, student_count, created_at`,
      [
        fileId,
        req.body.academicYearId,
        req.user.sub,
        sourceFile,
        pdfFileName,
        uploadResult.storedLocally ? null : uploadResult.key,
        credentials.length,
      ],
    );
    await client.query("COMMIT");
    res.json({
      importedCount: credentials.length,
      failedCount: errors.length,
      classesCreated,
      credentials,
      credentialFile: {
        ...fileResult.rows[0],
        academic_year_name: yearResult.rows[0].name,
      },
      errors,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (savedPdfPath) {
      try {
        await unlink(savedPdfPath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error("Không thể xóa PDF thông tin đăng nhập sau khi import thất bại.", cleanupError);
        }
      }
    }
    if (error.code === "22P02") {
      return res.status(400).json({ message: "Năm học được chọn không hợp lệ." });
    }
    next(error);
  } finally {
    client.release();
  }
});
app.get("/api/admin/student-class-requests", authenticate, allow("admin", "principal"), async (req, res, next) => {
  try {
    const { type = null, status = null } = req.query;
    if (type && !["enroll", "transfer"].includes(type)) {
      return res.status(400).json({ message: "Loại yêu cầu không hợp lệ." });
    }
    if (status && !["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái duyệt không hợp lệ." });
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.student_id, r.request_type, r.requested_class_id,
              r.status, r.decision_note, r.created_at, r.decided_at,
              st.student_code, st.first_name, st.last_name,
              c.name AS requested_class_name, ay.name AS academic_year_name,
              requested_by.full_name AS requested_by_name,
              decided_by.full_name AS decided_by_name,
              current_class.name AS current_class_name
       FROM school.student_class_requests r
       JOIN school.students st ON st.id = r.student_id
       JOIN school.classes c ON c.id = r.requested_class_id
       JOIN school.academic_years ay ON ay.id = c.academic_year_id
       JOIN school.users requested_by ON requested_by.id = r.requested_by
       LEFT JOIN school.users decided_by ON decided_by.id = r.decided_by
       LEFT JOIN LATERAL (
         SELECT old_class.name
         FROM school.class_students cs
         JOIN school.classes old_class ON old_class.id = cs.class_id
         WHERE cs.student_id = r.student_id
           AND old_class.academic_year_id = c.academic_year_id
         ORDER BY CASE WHEN cs.left_at IS NULL THEN 0 ELSE 1 END, cs.left_at DESC
         LIMIT 1
       ) current_class ON true
       WHERE ($1::varchar IS NULL OR r.request_type = $1)
         AND ($2::varchar IS NULL OR r.status = $2)
       ORDER BY (r.status = 'pending') DESC, r.created_at DESC`,
      [type, status],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});
app.post("/api/admin/student-class-requests", authenticate, allow("admin"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { studentId, classId } = req.body;
    if (!studentId || !classId) {
      return res.status(400).json({ message: "Vui lòng chọn học sinh và lớp cần đăng ký." });
    }
    await client.query("BEGIN");
    const studentResult = await client.query(
      "SELECT id FROM school.students WHERE id = $1 FOR UPDATE",
      [studentId],
    );
    if (!studentResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy học sinh." });
    }
    const classResult = await client.query(
      "SELECT id, academic_year_id FROM school.classes WHERE id = $1 FOR UPDATE",
      [classId],
    );
    if (!classResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy lớp học." });
    }
    const activeClasses = await client.query(
      `SELECT c.id, c.name
       FROM school.class_students cs
       JOIN school.classes c ON c.id = cs.class_id
       WHERE cs.student_id = $1 AND cs.left_at IS NULL
         AND c.academic_year_id = $2
       FOR UPDATE OF cs`,
      [studentId, classResult.rows[0].academic_year_id],
    );
    if (activeClasses.rows.length > 1) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Học sinh đang có nhiều lớp trong cùng năm học; cần xử lý dữ liệu lớp hiện tại trước." });
    }
    if (activeClasses.rows[0]?.id === classId) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Học sinh đã thuộc lớp này trong năm học đã chọn." });
    }

    const requestType = activeClasses.rows.length ? "transfer" : "enroll";
    const { rows } = await client.query(
      `INSERT INTO school.student_class_requests
         (student_id, request_type, requested_class_id, requested_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, student_id, request_type, requested_class_id, status, created_at`,
      [studentId, requestType, classId, req.user.sub],
    );
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ message: "Đã có yêu cầu chờ duyệt cho học sinh và lớp này." });
    }
    if (error.code === "23503" || error.code === "22P02") {
      return res.status(400).json({ message: "Học sinh hoặc lớp học không hợp lệ." });
    }
    next(error);
  } finally {
    client.release();
  }
});
app.patch("/api/admin/student-class-requests/:id/decision", authenticate, allow("principal"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { status, note = "" } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Quyết định duyệt không hợp lệ." });
    }
    await client.query("BEGIN");
    const requestResult = await client.query(
      `SELECT r.*, c.academic_year_id, c.capacity
       FROM school.student_class_requests r
       JOIN school.classes c ON c.id = r.requested_class_id
       WHERE r.id = $1 AND r.status = 'pending'
       FOR UPDATE OF r`,
      [req.params.id],
    );
    const request = requestResult.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy yêu cầu đang chờ duyệt." });
    }

    if (status === "approved") {
      const targetClassResult = await client.query(
        "SELECT id, capacity FROM school.classes WHERE id = $1 FOR UPDATE",
        [request.requested_class_id],
      );
      const currentClasses = await client.query(
        `SELECT cs.class_id
         FROM school.class_students cs
         JOIN school.classes c ON c.id = cs.class_id
         WHERE cs.student_id = $1 AND cs.left_at IS NULL
           AND c.academic_year_id = $2
         FOR UPDATE OF cs`,
        [request.student_id, request.academic_year_id],
      );
      if (currentClasses.rows.length > 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Học sinh đang có nhiều lớp trong năm học này." });
      }
      if (request.request_type === "enroll" && currentClasses.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Học sinh đã được xếp vào lớp trong lúc yêu cầu chờ duyệt; hãy tạo yêu cầu chuyển lớp mới." });
      }
      if (request.request_type === "transfer" && !currentClasses.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Học sinh không còn lớp hiện tại để chuyển; hãy tạo yêu cầu vào lớp mới." });
      }
      if (currentClasses.rows[0]?.class_id === request.requested_class_id) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Học sinh đã ở lớp được yêu cầu." });
      }
      const countResult = await client.query(
        "SELECT count(*)::integer AS total FROM school.class_students WHERE class_id = $1 AND left_at IS NULL",
        [request.requested_class_id],
      );
      if (targetClassResult.rows[0].capacity !== null
        && countResult.rows[0].total >= targetClassResult.rows[0].capacity) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Lớp đã đủ sĩ số; không thể duyệt thêm học sinh." });
      }
      if (request.request_type === "transfer") {
        await client.query(
          `UPDATE school.class_students
           SET left_at = CURRENT_DATE
           WHERE student_id = $1 AND class_id = $2 AND left_at IS NULL`,
          [request.student_id, currentClasses.rows[0].class_id],
        );
      }
      await client.query(
        `INSERT INTO school.class_students (class_id, student_id, enrolled_at, left_at)
         VALUES ($1, $2, CURRENT_DATE, NULL)
         ON CONFLICT (class_id, student_id)
         DO UPDATE SET enrolled_at = CURRENT_DATE, left_at = NULL`,
        [request.requested_class_id, request.student_id],
      );
    }

    const { rows } = await client.query(
      `UPDATE school.student_class_requests
       SET status = $1, decision_note = NULLIF($2, ''), decided_by = $3, decided_at = now()
       WHERE id = $4
       RETURNING id, student_id, request_type, requested_class_id, status, decision_note, decided_at`,
      [status, String(note).trim().slice(0, 1000), req.user.sub, request.id],
    );
    await client.query("COMMIT");
    res.json({ request: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23503" || error.code === "22P02") {
      return res.status(400).json({ message: "Yêu cầu hoặc lớp học không hợp lệ." });
    }
    next(error);
  } finally {
    client.release();
  }
});
app.get("/api/admin/classes", authenticate, allow("admin"), async (_req, res, next) => {
  try {
    const [classes, years, grades] = await Promise.all([
      pool.query("SELECT c.id, c.code, c.name, c.capacity, ay.id AS academic_year_id, ay.name AS academic_year_name, g.id AS grade_id, g.name AS grade_name, u.full_name AS homeroom_teacher_name FROM school.classes c JOIN school.academic_years ay ON ay.id = c.academic_year_id JOIN school.grades g ON g.id = c.grade_id LEFT JOIN school.teachers t ON t.id = c.homeroom_teacher_id LEFT JOIN school.users u ON u.id = t.user_id ORDER BY ay.starts_on DESC, g.sort_order, c.code"),
      pool.query("SELECT id, name, starts_on, ends_on, is_current FROM school.academic_years ORDER BY starts_on DESC"),
      pool.query("SELECT id, code, name FROM school.grades ORDER BY sort_order"),
    ]);
    res.json({ classes: classes.rows, academicYears: years.rows, grades: grades.rows });
  } catch (error) { next(error); }
});
app.get("/api/admin/teaching-assignments", authenticate, allow("admin"), async (_req, res, next) => {
  try {
    const [assignments, teachers, classes, subjects, academicYears] = await Promise.all([
      pool.query(
        `SELECT ta.id, ta.teacher_id, ta.class_id, ta.subject_id, ta.academic_year_id,
                u.full_name AS teacher_name, c.name AS class_name,
                s.name AS subject_name, ay.name AS academic_year_name
         FROM school.teaching_assignments ta
         JOIN school.teachers t ON t.id = ta.teacher_id
         JOIN school.users u ON u.id = t.user_id
         JOIN school.classes c ON c.id = ta.class_id
         JOIN school.subjects s ON s.id = ta.subject_id
         JOIN school.academic_years ay ON ay.id = ta.academic_year_id
         ORDER BY ay.starts_on DESC, c.name, s.name`,
      ),
      pool.query(
        `SELECT t.id, u.full_name
         FROM school.teachers t JOIN school.users u ON u.id = t.user_id
         WHERE u.status = 'active' ORDER BY u.full_name`,
      ),
      pool.query(
        `SELECT c.id, c.name, c.academic_year_id, ay.name AS academic_year_name
         FROM school.classes c
         JOIN school.academic_years ay ON ay.id = c.academic_year_id
         ORDER BY ay.starts_on DESC, c.name`,
      ),
      pool.query("SELECT id, name FROM school.subjects WHERE is_active = true ORDER BY name"),
      pool.query("SELECT id, name FROM school.academic_years ORDER BY starts_on DESC"),
    ]);
    res.json({
      assignments: assignments.rows,
      teachers: teachers.rows,
      classes: classes.rows,
      subjects: subjects.rows,
      academicYears: academicYears.rows,
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/admin/teaching-assignments", authenticate, allow("admin"), async (req, res, next) => {
  try {
    const { teacherId, classId, subjectId, academicYearId } = req.body;
    if (!teacherId || !classId || !subjectId || !academicYearId) {
      return res.status(400).json({ message: "Vui lòng chọn giáo viên, lớp, môn học và năm học." });
    }
    const validAssignment = await pool.query(
      `SELECT t.id
       FROM school.teachers t
       JOIN school.users u ON u.id = t.user_id
       JOIN school.classes c ON c.id = $2 AND c.academic_year_id = $4
       JOIN school.subjects s ON s.id = $3 AND s.is_active = true
       WHERE t.id = $1 AND u.role = 'teacher' AND u.status = 'active'`,
      [teacherId, classId, subjectId, academicYearId],
    );
    if (!validAssignment.rows[0]) {
      return res.status(400).json({ message: "Thông tin phân công không hợp lệ hoặc giáo viên chưa được kích hoạt." });
    }

    const { rows } = await pool.query(
      `INSERT INTO school.teaching_assignments (teacher_id, class_id, subject_id, academic_year_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, teacher_id, class_id, subject_id, academic_year_id`,
      [teacherId, classId, subjectId, academicYearId],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Lớp đã có phân công cho môn học này trong năm học đã chọn." });
    }
    if (error.code === "23503") {
      return res.status(400).json({ message: "Giáo viên, lớp, môn học hoặc năm học không tồn tại." });
    }
    next(error);
  }
});
app.post("/api/admin/classes", authenticate, allow("admin"), async (req, res, next) => {
  try {
    const { academicYearId, gradeId, code, name, capacity = null } = req.body;
    if (!academicYearId || !gradeId || !code || !name) return res.status(400).json({ message: "Vui lòng nhập đủ năm học, khối, mã và tên lớp" });
    if (capacity !== null && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) return res.status(400).json({ message: "Sĩ số tối đa phải là số nguyên dương" });
    const { rows } = await pool.query("INSERT INTO school.classes (academic_year_id, grade_id, code, name, capacity) VALUES ($1,$2,$3,$4,$5) RETURNING id, academic_year_id, grade_id, code, name, capacity", [academicYearId, gradeId, code.trim(), name.trim(), capacity === "" ? null : capacity]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Mã lớp này đã tồn tại trong năm học đã chọn" });
    if (error.code === "23503") return res.status(400).json({ message: "Năm học hoặc khối lớp không tồn tại" });
    next(error);
  }
});
app.get("/api/admin/admission-campaigns", authenticate, allow("admin"), async (_req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT id, name, slug, description, opens_at, closes_at, appointment_start_date, daily_queue_limit, is_open FROM school.admission_campaigns ORDER BY opens_at DESC");
    res.json(rows);
  } catch (error) { next(error); }
});
app.post("/api/admin/admission-campaigns", authenticate, allow("admin"), async (req, res, next) => {
  try {
    const { name, slug, description = "", opensAt, closesAt, appointmentStartDate, dailyQueueLimit = 200, isOpen = false, academicYearId } = req.body;
    if (!name || !slug || !opensAt || !closesAt || !appointmentStartDate || !academicYearId) return res.status(400).json({ message: "Vui lòng nhập đủ thông tin đợt tuyển sinh" });
    if (!Number.isInteger(Number(dailyQueueLimit)) || Number(dailyQueueLimit) < 1) return res.status(400).json({ message: "Giới hạn hồ sơ mỗi ngày phải là số nguyên dương" });
    const { rows } = await pool.query("INSERT INTO school.admission_campaigns (academic_year_id, name, slug, description, opens_at, closes_at, appointment_start_date, daily_queue_limit, is_open) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [academicYearId, name, slug, description, opensAt, closesAt, appointmentStartDate, dailyQueueLimit, isOpen]);
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});
app.patch("/api/admin/admission-campaigns/:id", authenticate, allow("admin"), async (req, res, next) => {
  try {
    const { name, description, opensAt, closesAt, appointmentStartDate, dailyQueueLimit, isOpen } = req.body;
    if (dailyQueueLimit !== undefined && (!Number.isInteger(Number(dailyQueueLimit)) || Number(dailyQueueLimit) < 1)) return res.status(400).json({ message: "Giới hạn hồ sơ mỗi ngày phải là số nguyên dương" });
    const { rows } = await pool.query(`UPDATE school.admission_campaigns
      SET name = COALESCE($1, name), description = COALESCE($2, description),
          opens_at = COALESCE($3, opens_at), closes_at = COALESCE($4, closes_at),
          appointment_start_date = COALESCE($5, appointment_start_date),
          daily_queue_limit = COALESCE($6, daily_queue_limit), is_open = COALESCE($7, is_open)
      WHERE id = $8 RETURNING *`, [name, description, opensAt, closesAt, appointmentStartDate, dailyQueueLimit, isOpen, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Không tìm thấy đợt tuyển sinh" });
    res.json(rows[0]);
  } catch (error) { next(error); }
});
app.get("/api/admin/contents", authenticate, allow("admin"), async (_req, res, next) => { try { const { rows } = await pool.query("SELECT id, type, title, slug, excerpt, body, status, is_featured, published_at, event_starts_at, event_ends_at FROM school.contents ORDER BY created_at DESC"); res.json(rows); } catch (error) { next(error); } });
app.post("/api/admin/contents", authenticate, allow("admin"), async (req, res, next) => {
  try {
    const { type, title, slug, excerpt = "", body, status = "draft", isFeatured = false, eventStartsAt = null, eventEndsAt = null } = req.body;
    if (!["news", "announcement", "event"].includes(type) || !title || !slug || !body) return res.status(400).json({ message: "Thiếu loại, tiêu đề, slug hoặc nội dung" });
    const { rows } = await pool.query("INSERT INTO school.contents (type, title, slug, excerpt, body, status, is_featured, published_at, event_starts_at, event_ends_at, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $6::school.publication_status = 'published' THEN now() END,$8,$9,$10) RETURNING *", [type, title, slug, excerpt, body, status, isFeatured, eventStartsAt, eventEndsAt, req.user.sub]);
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});
app.patch("/api/admin/contents/:id", authenticate, allow("admin"), async (req, res, next) => {
  try {
    const { type, title, excerpt = "", body, status, isFeatured = false } = req.body;
    if (type !== undefined && !["news", "announcement", "event"].includes(type)) {
      return res.status(400).json({ message: "Loại nội dung không hợp lệ" });
    }
    const { rows } = await pool.query("UPDATE school.contents SET type = COALESCE($1,type), title = COALESCE($2,title), excerpt = $3, body = COALESCE($4,body), status = COALESCE($5,status), is_featured = $6, published_at = CASE WHEN $5::school.publication_status = 'published' AND published_at IS NULL THEN now() ELSE published_at END WHERE id = $7 RETURNING *", [type, title, excerpt, body, status, isFeatured, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Không tìm thấy nội dung" });
    res.json(rows[0]);
  } catch (error) { next(error); }
});
app.delete("/api/admin/contents/:id", authenticate, allow("admin"), async (req, res, next) => { try { const result = await pool.query("DELETE FROM school.contents WHERE id = $1", [req.params.id]); if (!result.rowCount) return res.status(404).json({ message: "Không tìm thấy nội dung" }); res.status(204).end(); } catch (error) { next(error); } });
app.get("/api/admin/pages", authenticate, allow("admin"), async (_req, res, next) => { try { const { rows } = await pool.query("SELECT id, slug, title, body, updated_at FROM school.school_pages ORDER BY id"); res.json(rows); } catch (error) { next(error); } });
app.patch("/api/admin/pages/:id", authenticate, allow("admin"), async (req, res, next) => { try { const { rows } = await pool.query("UPDATE school.school_pages SET title = COALESCE($1,title), body = COALESCE($2,body), updated_by = $3, updated_at = now() WHERE id = $4 RETURNING *", [req.body.title, req.body.body, req.user.sub, req.params.id]); if (!rows[0]) return res.status(404).json({ message: "Không tìm thấy trang" }); res.json(rows[0]); } catch (error) { next(error); } });
app.get("/api/admin/contact-messages", authenticate, allow("admin"), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.sender_name, c.sender_email, c.sender_phone, c.subject,
             c.message, c.created_at,
             count(r.id) FILTER (WHERE r.email_status = 'sent')::integer AS reply_count
      FROM school.contacts c
      LEFT JOIN school.contact_replies r ON r.contact_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});
app.get("/api/admin/contact-messages/:id", authenticate, allow("admin"), async (req, res, next) => {
  try {
    if (!contactIdPattern.test(req.params.id)) {
      return res.status(404).json({ message: "Không tìm thấy liên hệ." });
    }
    const { rows } = await pool.query(
      "SELECT id, sender_name, sender_email, sender_phone, subject, message, created_at FROM school.contacts WHERE id = $1",
      [req.params.id],
    );
    const contact = rows[0];
    if (!contact) return res.status(404).json({ message: "Không tìm thấy liên hệ." });

    const replies = await pool.query(
      `SELECT id, message, email_status, email_error, sent_at, created_at
       FROM school.contact_replies
       WHERE contact_id = $1
       ORDER BY created_at`,
      [contact.id],
    );
    res.json({ contact, replies: replies.rows });
  } catch (error) {
    next(error);
  }
});
app.post("/api/admin/contact-messages/:id/replies", authenticate, allow("admin"), async (req, res, next) => {
  try {
    if (!contactIdPattern.test(req.params.id)) {
      return res.status(404).json({ message: "Không tìm thấy liên hệ." });
    }
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ message: "Vui lòng nhập nội dung phản hồi." });
    if (message.length > 10000) {
      return res.status(400).json({ message: "Nội dung phản hồi không được vượt quá 10.000 ký tự." });
    }
    const smtpConfigIssue = getContactReplyEmailConfigIssue();
    if (smtpConfigIssue) {
      return res.status(503).json({ message: smtpConfigIssue });
    }

    const contactResult = await pool.query(
      "SELECT id, sender_name, sender_email, subject FROM school.contacts WHERE id = $1",
      [req.params.id],
    );
    const contact = contactResult.rows[0];
    if (!contact) return res.status(404).json({ message: "Không tìm thấy liên hệ." });
    if (!contact.sender_email) {
      return res.status(400).json({ message: "Người liên hệ chưa cung cấp địa chỉ email." });
    }

    const pendingResult = await pool.query(
      `INSERT INTO school.contact_replies (contact_id, replied_by, message, email_status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, message, email_status, email_error, sent_at, created_at`,
      [contact.id, req.user.sub, message],
    );
    const pendingReply = pendingResult.rows[0];

    try {
      await sendContactReply({
        recipient: contact.sender_email,
        recipientName: contact.sender_name,
        contactSubject: contact.subject,
        message,
      });
    } catch (error) {
      const deliveryCode = error.code || error.name || "EMAIL_DELIVERY_FAILED";
      await pool.query(
        "UPDATE school.contact_replies SET email_status = 'failed', email_error = $1 WHERE id = $2",
        [deliveryCode, pendingReply.id],
      );
      console.error("Contact reply email delivery failed:", deliveryCode);
      const deliveryMessage = error instanceof EmailConfigurationError
        ? error.message
        : ["EDNS", "ENOTFOUND", "EAI_AGAIN"].includes(deliveryCode)
          ? "Không tìm thấy máy chủ SMTP qua DNS. Kiểm tra SMTP_HOST có phải máy chủ thật hay vẫn là giá trị mẫu smtp.example.com."
          : deliveryCode === "EAUTH"
            ? "SMTP từ chối xác thực. Kiểm tra SMTP_USER và SMTP_PASSWORD; Gmail cần mật khẩu ứng dụng."
            : ["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET"].includes(deliveryCode)
              ? "Không kết nối được máy chủ SMTP. Kiểm tra SMTP_HOST, SMTP_PORT, SMTP_SECURE và mạng của máy chủ."
              : "Không gửi được email phản hồi. Kiểm tra cấu hình SMTP rồi thử lại.";
      return res.status(error instanceof EmailConfigurationError ? 503 : 502).json({
        message: deliveryMessage,
      });
    }

    const sentResult = await pool.query(
      `UPDATE school.contact_replies
       SET email_status = 'sent', email_error = NULL, sent_at = now()
       WHERE id = $1
       RETURNING id, message, email_status, email_error, sent_at, created_at`,
      [pendingReply.id],
    );
    res.status(201).json(sentResult.rows[0]);
  } catch (error) {
    next(error);
  }
});
app.get("/api/admin/account-requests", authenticate, allow("admin", "principal"), async (_req, res, next) => { try { const { rows } = await pool.query("SELECT r.*, u.full_name AS requester_name FROM school.account_management_requests r JOIN school.users u ON u.id = r.requested_by ORDER BY r.created_at DESC"); res.json(rows); } catch (error) { next(error); } });
app.post("/api/admin/account-requests", authenticate, allow("admin"), async (req, res, next) => {
  try {
    const { action, targetUserId = null, payload = {} } = req.body;
    if (action !== "create") return res.status(400).json({ message: "Tác vụ tài khoản không hợp lệ" });
    const { username, fullName, email = null, phone = null, role = "teacher", academicYearName = null } = payload;
    if (!username || !fullName || !["principal", "teacher", "student", "parent"].includes(role)) return res.status(400).json({ message: "Vui lòng nhập tài khoản, họ tên và vai trò hợp lệ" });
    if (role === "student" && !academicYearName) return res.status(400).json({ message: "Vui lòng chọn năm học trước khi gửi yêu cầu tạo tài khoản học sinh." });
    const { rows } = await pool.query("INSERT INTO school.account_management_requests (requested_by, action, target_user_id, payload) VALUES ($1,$2,$3,$4) RETURNING id, action, payload, status, created_at", [req.user.sub, action, targetUserId, { username: username.trim().toLowerCase(), fullName: fullName.trim(), email: email?.trim().toLowerCase() || null, phone: phone?.trim() || null, role, academicYearName: academicYearName?.trim() || null }]);
    res.status(201).json({ request: rows[0], payload: rows[0].payload });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Tài khoản đã có yêu cầu trùng hoặc đã tồn tại" });
    next(error);
  }
});
app.patch("/api/admin/account-requests/:id/decision", authenticate, allow("principal"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const status = req.body.status;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "Quyết định không hợp lệ" });
    await client.query("BEGIN");
    const request = await client.query("SELECT * FROM school.account_management_requests WHERE id = $1 AND status = 'pending' FOR UPDATE", [req.params.id]);
    if (!request.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Yêu cầu không tồn tại hoặc đã xử lý" }); }
    const { rows } = await client.query("UPDATE school.account_management_requests SET status = $1, approved_by = $2, decision_note = $3, decided_at = now() WHERE id = $4 RETURNING id, action, payload, status, approved_by, decided_at", [status, req.user.sub, req.body.note || null, req.params.id]);
    await client.query("COMMIT");
    res.json({ request: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "Tên đăng nhập hoặc email đã tồn tại" });
    next(error);
  } finally { client.release(); }
});
app.post("/api/admin/account-requests/:id/create", authenticate, allow("admin"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query("SELECT * FROM school.account_management_requests WHERE id = $1 AND action = 'create' AND status = 'approved' AND target_user_id IS NULL FOR UPDATE", [req.params.id]);
    if (!request.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Yêu cầu chưa được phê duyệt hoặc tài khoản đã được tạo" });
    }
    const data = request.rows[0].payload;
    const existing = await client.query("SELECT username, email FROM school.users WHERE username = $1 OR ($2::text IS NOT NULL AND email = $2)", [data.username, data.email]);
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: `Tên đăng nhập hoặc email đã tồn tại (${existing.rows[0].username})` });
    }
    const temporaryPassword = `Truonghoc-${randomBytes(5).toString("hex")}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const user = await client.query("INSERT INTO school.users (username, email, password_hash, full_name, phone, role, status, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,'active',true) RETURNING id, username, full_name, role", [data.username, data.email, passwordHash, data.fullName, data.phone, data.role]);
    if (user.rows[0].role === "teacher") {
      await client.query(
        "INSERT INTO school.teachers (user_id, employee_code) VALUES ($1, $2)",
        [user.rows[0].id, `T-${user.rows[0].id.replaceAll("-", "")}`],
      );
    }
    if (user.rows[0].role === "student") {
      const academicYearName = data.academicYearName || "";
      const nextSequence = await client.query(
        `SELECT COALESCE(MAX((REGEXP_REPLACE(student_code, '^HS' || $1 || '-', '', 'i'))::int), 0) + 1 AS next_sequence
         FROM school.students
         WHERE student_code ~ ('^HS' || $1 || '-[0-9]{4}$')`,
        [extractAcademicYearPrefix(academicYearName)],
      );
      const studentCode = generateStudentCode(academicYearName, Number(nextSequence.rows[0]?.next_sequence ?? 1));
      const nameParts = data.fullName.trim().split(/\s+/);
      const firstName = nameParts.pop() || data.fullName.trim();
      await client.query(
        `INSERT INTO school.students (user_id, student_code, first_name, last_name)
         VALUES ($1::uuid, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.rows[0].id, studentCode, firstName, nameParts.join(" ")],
      );
    }
    await client.query("UPDATE school.account_management_requests SET target_user_id = $1 WHERE id = $2", [user.rows[0].id, req.params.id]);
    await client.query("COMMIT");
    res.status(201).json({ request: { ...request.rows[0], target_user_id: user.rows[0].id }, user: user.rows[0], temporaryPassword });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "Tên đăng nhập hoặc email đã tồn tại" });
    next(error);
  } finally { client.release(); }
});
}

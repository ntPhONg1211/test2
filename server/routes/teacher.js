import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const uploadDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../storage/teacher-resources",
);
const maxFileSize = 25 * 1024 * 1024;
const allowedExtensions = new Set([
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt",
  ".jpg", ".jpeg", ".png",
]);
const mimeTypes = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

await mkdir(uploadDirectory, { recursive: true });

const resourceUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: maxFileSize, files: 1, fields: 5 },
  fileFilter: (_req, file, callback) => {
    if (!allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      callback(new Error("Chỉ chấp nhận PDF, Office, TXT, JPG hoặc PNG."));
      return;
    }
    callback(null, true);
  },
});

function handleResourceUpload(req, res, next) {
  resourceUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({
        message: error.code === "LIMIT_FILE_SIZE"
          ? "Tệp vượt quá giới hạn 25 MB."
          : "Yêu cầu tải tệp không hợp lệ.",
      });
    }
    if (error.message === "Chỉ chấp nhận PDF, Office, TXT, JPG hoặc PNG.") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  });
}

async function getTeacherAssignment(pool, userId, assignmentId) {
  const { rows } = await pool.query(
    `SELECT ta.id, ta.teacher_id, ta.class_id, ta.subject_id, ta.academic_year_id,
            c.name AS class_name, c.grade_id, g.name AS grade_name,
            s.name AS subject_name
     FROM school.teaching_assignments ta
     JOIN school.teachers t ON t.id = ta.teacher_id
     JOIN school.classes c ON c.id = ta.class_id
     JOIN school.grades g ON g.id = c.grade_id
     JOIN school.subjects s ON s.id = ta.subject_id
     WHERE ta.id = $1 AND t.user_id = $2`,
    [assignmentId, userId],
  );
  return rows[0];
}

async function getStudentResourceAccess(pool, studentUserId) {
  const { rows } = await pool.query(
    `SELECT cs.class_id,
            ARRAY_AGG(DISTINCT ta.subject_id) FILTER (WHERE ta.subject_id IS NOT NULL) AS subject_ids
     FROM school.students st
     JOIN school.class_students cs ON cs.student_id = st.id
     JOIN school.teaching_assignments ta ON ta.class_id = cs.class_id
     WHERE st.user_id = $1 AND cs.left_at IS NULL
     GROUP BY cs.class_id`,
    [studentUserId],
  );
  return rows;
}

export default function registerTeacherRoutes(app, { pool, authenticate, allow }) {
  app.get("/api/teacher/assignments", authenticate, allow("teacher"), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT ta.id, ta.class_id, ta.subject_id, ta.academic_year_id,
                c.name AS class_name, g.name AS grade_name,
                s.name AS subject_name, ay.name AS academic_year_name
         FROM school.teaching_assignments ta
         JOIN school.teachers t ON t.id = ta.teacher_id
         JOIN school.classes c ON c.id = ta.class_id
         JOIN school.grades g ON g.id = c.grade_id
         JOIN school.subjects s ON s.id = ta.subject_id
         JOIN school.academic_years ay ON ay.id = ta.academic_year_id
         WHERE t.user_id = $1
         ORDER BY ay.starts_on DESC, g.sort_order, c.name, s.name`,
        [req.user.sub],
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/teacher/assignments/:assignmentId/gradebook", authenticate, allow("teacher"), async (req, res, next) => {
    try {
      const assignment = await getTeacherAssignment(pool, req.user.sub, req.params.assignmentId);
      if (!assignment) return res.status(404).json({ message: "Không tìm thấy phân công giảng dạy." });

      const [semesters, components, students] = await Promise.all([
        pool.query(
          "SELECT id, code, starts_on, ends_on FROM school.semesters WHERE academic_year_id = $1 ORDER BY starts_on",
          [assignment.academic_year_id],
        ),
        pool.query("SELECT id, code, name, weight FROM school.grade_components ORDER BY weight, id"),
        pool.query(
          `SELECT st.id, st.student_code, st.first_name, st.last_name,
                  sc.component_id, sc.score, sc.note, gc.weight
           FROM school.class_students cs
           JOIN school.students st ON st.id = cs.student_id
           LEFT JOIN school.scores sc
             ON sc.student_id = st.id AND sc.assignment_id = $2 AND sc.semester_id = $3
           LEFT JOIN school.grade_components gc ON gc.id = sc.component_id
           WHERE cs.class_id = $1 AND cs.left_at IS NULL
           ORDER BY st.last_name, st.first_name, st.student_code`,
          [assignment.class_id, assignment.id, req.query.semesterId || null],
        ),
      ]);

      res.json({
        assignment,
        semesters: semesters.rows,
        components: components.rows,
        students: students.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/teacher/assignments/:assignmentId/scores", authenticate, allow("teacher"), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { semesterId, scores } = req.body;
      if (!uuidPattern.test(semesterId || "") || !Array.isArray(scores) || scores.length === 0 || scores.length > 500) {
        return res.status(400).json({ message: "Chọn học kỳ và nhập ít nhất một điểm hợp lệ." });
      }

      await client.query("BEGIN");
      const teacherResult = await client.query(
        "SELECT id FROM school.teachers WHERE user_id = $1",
        [req.user.sub],
      );
      const teacher = teacherResult.rows[0];
      if (!teacher) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "Tài khoản chưa được liên kết với hồ sơ giáo viên." });
      }

      const assignmentResult = await client.query(
        `SELECT ta.id, ta.class_id, ta.academic_year_id
         FROM school.teaching_assignments ta
         WHERE ta.id = $1 AND ta.teacher_id = $2
         FOR UPDATE`,
        [req.params.assignmentId, teacher.id],
      );
      const assignment = assignmentResult.rows[0];
      if (!assignment) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy phân công giảng dạy." });
      }

      const semesterResult = await client.query(
        "SELECT id FROM school.semesters WHERE id = $1 AND academic_year_id = $2",
        [semesterId, assignment.academic_year_id],
      );
      if (!semesterResult.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Học kỳ không thuộc năm học của phân công này." });
      }

      const parsedScores = scores.map((entry) => ({
        studentId: entry.studentId,
        componentId: Number(entry.componentId),
        score: entry.score === "" || entry.score === null ? null : Number(entry.score),
        note: typeof entry.note === "string" ? entry.note.trim() : null,
      }));
      if (parsedScores.some((entry) =>
        typeof entry.studentId !== "string"
        || !uuidPattern.test(entry.studentId)
        || !Number.isInteger(entry.componentId)
        || (entry.score !== null && (!Number.isFinite(entry.score) || entry.score < 0 || entry.score > 10))
      )) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Điểm phải nằm trong khoảng từ 0 đến 10." });
      }

      const studentIds = [...new Set(parsedScores.map((entry) => entry.studentId))];
      const studentsResult = await client.query(
        "SELECT student_id FROM school.class_students WHERE class_id = $1 AND left_at IS NULL AND student_id = ANY($2::uuid[])",
        [assignment.class_id, studentIds],
      );
      if (studentsResult.rowCount !== studentIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Có học sinh không thuộc lớp được phân công." });
      }

      const componentIds = [...new Set(parsedScores.map((entry) => entry.componentId))];
      const componentsResult = await client.query(
        "SELECT id FROM school.grade_components WHERE id = ANY($1::smallint[])",
        [componentIds],
      );
      if (componentsResult.rowCount !== componentIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Loại điểm không hợp lệ." });
      }

      let savedCount = 0;
      let deletedCount = 0;
      for (const entry of parsedScores) {
        if (entry.score === null) {
          const result = await client.query(
            `DELETE FROM school.scores
             WHERE student_id = $1 AND assignment_id = $2
               AND semester_id = $3 AND component_id = $4`,
            [entry.studentId, assignment.id, semesterId, entry.componentId],
          );
          deletedCount += result.rowCount;
          continue;
        }

        await client.query(
          `INSERT INTO school.scores
             (student_id, assignment_id, semester_id, component_id, score, note, entered_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (student_id, assignment_id, semester_id, component_id)
           DO UPDATE SET score = EXCLUDED.score, note = EXCLUDED.note,
                         entered_by = EXCLUDED.entered_by, updated_at = now()`,
          [entry.studentId, assignment.id, semesterId, entry.componentId, entry.score, entry.note, teacher.id],
        );
        savedCount += 1;
      }

      await client.query("COMMIT");
      res.json({ savedCount, deletedCount });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  app.get("/api/teacher/schedule", authenticate, allow("teacher"), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT sch.id, sch.day_of_week, sch.period_number, sch.starts_at, sch.ends_at,
                sch.semester, sch.effective_from, sch.effective_to,
                c.name AS class_name, s.name AS subject_name, r.name AS room_name,
                r.code AS room_code, ay.name AS academic_year_name
         FROM school.schedules sch
         JOIN school.teachers t ON t.id = sch.teacher_id
         JOIN school.classes c ON c.id = sch.class_id
         JOIN school.subjects s ON s.id = sch.subject_id
         JOIN school.academic_years ay ON ay.id = sch.academic_year_id
         LEFT JOIN school.rooms r ON r.id = sch.room_id
         WHERE t.user_id = $1
           AND ($2::uuid IS NULL OR sch.academic_year_id = $2)
         ORDER BY sch.day_of_week, sch.starts_at`,
        [req.user.sub, req.query.academicYearId || null],
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/teacher/resources", authenticate, allow("teacher"), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT lr.id, lr.title, lr.description, lr.original_name, lr.mime_type,
                lr.file_size, lr.created_at, lr.class_id, c.name AS class_name,
                s.name AS subject_name, ay.name AS academic_year_name
         FROM school.learning_resources lr
         LEFT JOIN school.classes c ON c.id = lr.class_id
         LEFT JOIN school.subjects s ON s.id = lr.subject_id
         LEFT JOIN school.academic_years ay ON ay.id = c.academic_year_id
         WHERE lr.uploaded_by = $1
         ORDER BY lr.created_at DESC`,
        [req.user.sub],
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/student/resources", authenticate, allow("student"), async (req, res, next) => {
    try {
      const accessRows = await getStudentResourceAccess(pool, req.user.sub);
      if (!accessRows.length) {
        return res.json([]);
      }
      const classIds = accessRows.map((row) => row.class_id);
      const subjectIds = [...new Set(accessRows.flatMap((row) => row.subject_ids || []))];
      if (!subjectIds.length) {
        return res.json([]);
      }
      const { rows } = await pool.query(
        `SELECT lr.id, lr.title, lr.description, lr.original_name, lr.mime_type,
                lr.file_size, lr.created_at, lr.class_id, c.name AS class_name,
                s.name AS subject_name, ay.name AS academic_year_name
         FROM school.learning_resources lr
         JOIN school.classes c ON c.id = lr.class_id
         JOIN school.subjects s ON s.id = lr.subject_id
         JOIN school.academic_years ay ON ay.id = c.academic_year_id
         WHERE lr.class_id = ANY($1::uuid[])
           AND lr.subject_id = ANY($2::smallint[])
           AND lr.visibility IN ('class_only', 'authenticated')
           AND lr.subject_id IS NOT NULL
         ORDER BY lr.created_at DESC`,
        [classIds, subjectIds],
      );
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/student/resources/:id/download", authenticate, allow("student"), async (req, res, next) => {
    try {
      const accessRows = await getStudentResourceAccess(pool, req.user.sub);
      if (!accessRows.length) {
        return res.status(403).json({ message: "Bạn không thuộc lớp nào để xem tài liệu này." });
      }
      const classIds = accessRows.map((row) => row.class_id);
      const subjectIds = [...new Set(accessRows.flatMap((row) => row.subject_ids || []))];
      if (!subjectIds.length) {
        return res.status(403).json({ message: "Bạn chưa có môn học nào được phép xem tài liệu." });
      }

      const { rows } = await pool.query(
        `SELECT lr.storage_key, lr.original_name
         FROM school.learning_resources lr
         WHERE lr.id = $1
           AND lr.class_id = ANY($2::uuid[])
           AND lr.subject_id = ANY($3::smallint[])
           AND lr.visibility IN ('class_only', 'authenticated')`,
        [req.params.id, classIds, subjectIds],
      );
      const resource = rows[0];
      if (!resource) {
        return res.status(404).json({ message: "Không tìm thấy tài liệu cho lớp và môn của bạn." });
      }

      const filePath = path.join(uploadDirectory, path.basename(resource.storage_key));
      await pool.query(
        "UPDATE school.learning_resources SET download_count = download_count + 1 WHERE id = $1",
        [req.params.id],
      );
      res.download(filePath, resource.original_name, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/teacher/resources",
    authenticate,
    allow("teacher"),
    handleResourceUpload,
    async (req, res, next) => {
      if (!req.file) return res.status(400).json({ message: "Vui lòng chọn tệp tài liệu." });
      try {
        const { assignmentId, title, description = "" } = req.body;
        if (!assignmentId || !title?.trim()) {
          await unlink(req.file.path);
          return res.status(400).json({ message: "Vui lòng chọn lớp/môn và nhập tiêu đề tài liệu." });
        }

        const assignment = await getTeacherAssignment(pool, req.user.sub, assignmentId);
        if (!assignment) {
          await unlink(req.file.path);
          return res.status(404).json({ message: "Không tìm thấy phân công giảng dạy." });
        }

        const extension = path.extname(req.file.originalname).toLowerCase();
        const originalName = path.basename(req.file.originalname).slice(0, 300);
        const { rows } = await pool.query(
          `INSERT INTO school.learning_resources
             (uploaded_by, subject_id, grade_id, class_id, title, description,
              storage_key, original_name, mime_type, file_size, visibility, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'class_only', now())
           RETURNING id, title, description, original_name, mime_type, file_size, created_at`,
          [
            req.user.sub,
            assignment.subject_id,
            assignment.grade_id,
            assignment.class_id,
            title.trim().slice(0, 300),
            description.trim(),
            req.file.filename,
            originalName,
            mimeTypes[extension],
            req.file.size,
          ],
        );
        res.status(201).json(rows[0]);
      } catch (error) {
        await unlink(req.file.path).catch((unlinkError) => {
          if (unlinkError.code !== "ENOENT") console.error("Could not remove failed upload", unlinkError);
        });
        next(error);
      }
    },
  );

  app.get("/api/teacher/resources/:id/download", authenticate, allow("teacher"), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT lr.storage_key, lr.original_name
         FROM school.learning_resources lr
         WHERE lr.id = $1 AND lr.uploaded_by = $2`,
        [req.params.id, req.user.sub],
      );
      const resource = rows[0];
      if (!resource) return res.status(404).json({ message: "Không tìm thấy tài liệu." });

      const filePath = path.join(uploadDirectory, path.basename(resource.storage_key));
      await pool.query(
        "UPDATE school.learning_resources SET download_count = download_count + 1 WHERE id = $1",
        [req.params.id],
      );
      res.download(filePath, resource.original_name, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  });
}

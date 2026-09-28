import express from "express";
import cors from "cors";
import registerPublicRoutes from "./routes/public.js";
import registerAdminRoutes from "./routes/admin.js";
import registerTeacherRoutes from "./routes/teacher.js";
import { clientUrl, jwtSecret, port } from "./config/env.js";
import { pool } from "./db/pool.js";
import {
  ensureAdmissionScheduleSchema,
  ensureAccountManagementSchema,
  ensureAcademicYearSemesters,
  ensureContactRepliesSchema,
  ensureStudentImportFiles,
  ensureStudentClassRequests,
  ensureStudentProfiles,
  ensureScoreValidation,
  ensureTeacherProfiles,
} from "./db/schema.js";
import { createAuthMiddleware } from "./middleware/auth.js";

const app = express();
const { authenticate, allow } = createAuthMiddleware(jwtSecret);

app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: "1mb" }));

registerPublicRoutes(app, { pool, jwtSecret, authenticate });
registerAdminRoutes(app, { pool, authenticate, allow });
registerTeacherRoutes(app, { pool, authenticate, allow });

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Đã xảy ra lỗi máy chủ" });
});

Promise.all([
  ensureAdmissionScheduleSchema(pool),
  ensureAccountManagementSchema(pool),
  ensureAcademicYearSemesters(pool),
  ensureContactRepliesSchema(pool),
  ensureStudentImportFiles(pool),
  ensureStudentClassRequests(pool),
  ensureStudentProfiles(pool),
  ensureScoreValidation(pool),
  ensureTeacherProfiles(pool),
])
  .then(() => app.listen(port, () => console.log(`API listening on http://localhost:${port}`)))
  .catch((error) => {
    console.error("Không thể khởi tạo schema tuyển sinh", error);
    process.exitCode = 1;
  });

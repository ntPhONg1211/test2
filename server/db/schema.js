export async function ensureAdmissionScheduleSchema(pool) {
  await pool.query("ALTER TABLE school.admission_campaigns ADD COLUMN IF NOT EXISTS appointment_start_date date NOT NULL DEFAULT CURRENT_DATE");
}

export async function ensureAccountManagementSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school.account_management_requests (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      requested_by   uuid NOT NULL REFERENCES school.users(id),
      approved_by    uuid REFERENCES school.users(id),
      action         varchar(30) NOT NULL CHECK (action IN ('create', 'disable', 'reset_password')),
      target_user_id uuid REFERENCES school.users(id) ON DELETE CASCADE,
      payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
      status         varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      decision_note  text,
      created_at     timestamptz NOT NULL DEFAULT now(),
      decided_at     timestamptz
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS account_requests_status_idx ON school.account_management_requests (status, created_at DESC)");
}

export async function ensureTeacherProfiles(pool) {
  await pool.query(`
    INSERT INTO school.teachers (user_id, employee_code)
    SELECT u.id, 'T-' || replace(u.id::text, '-', '')
    FROM school.users u
    LEFT JOIN school.teachers t ON t.user_id = u.id
    WHERE u.role = 'teacher' AND t.id IS NULL
    ON CONFLICT (user_id) DO NOTHING
  `);
}

export async function ensureStudentProfiles(pool) {
  await pool.query("ALTER TABLE school.students ALTER COLUMN date_of_birth DROP NOT NULL");
  await pool.query("ALTER TABLE school.students ADD COLUMN IF NOT EXISTS previous_class_name varchar(100)");
  await pool.query("ALTER TABLE school.students ADD COLUMN IF NOT EXISTS student_category varchar(80)");
  await pool.query("ALTER TABLE school.students ADD COLUMN IF NOT EXISTS notes text");
  await pool.query(`
    INSERT INTO school.students (user_id, student_code, first_name, last_name)
    SELECT
      u.id,
      'S-' || upper(replace(u.id::text, '-', '')),
      COALESCE(NULLIF(substring(trim(u.full_name) FROM '[^ ]+$'), ''), trim(u.full_name)),
      COALESCE(substring(trim(u.full_name) FROM '^(.+)\\s+[^ ]+$'), '')
    FROM school.users u
    LEFT JOIN school.students st ON st.user_id = u.id
    WHERE u.role = 'student' AND st.id IS NULL
    ON CONFLICT (user_id) DO NOTHING
  `);
}

export async function ensureStudentClassRequests(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school.student_class_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES school.students(id) ON DELETE CASCADE,
      request_type varchar(20) NOT NULL CHECK (request_type IN ('enroll', 'transfer')),
      requested_class_id uuid NOT NULL REFERENCES school.classes(id) ON DELETE RESTRICT,
      requested_by uuid NOT NULL REFERENCES school.users(id),
      decided_by uuid REFERENCES school.users(id),
      status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      decision_note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      decided_at timestamptz
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS student_class_requests_pending_unique
    ON school.student_class_requests (student_id, requested_class_id)
    WHERE status = 'pending'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS student_class_requests_status_idx
    ON school.student_class_requests (status, request_type, created_at DESC)
  `);
}

export async function ensureStudentImportFiles(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school.student_import_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      academic_year_id uuid NOT NULL REFERENCES school.academic_years(id) ON DELETE RESTRICT,
      created_by uuid NOT NULL REFERENCES school.users(id) ON DELETE RESTRICT,
      source_file varchar(255) NOT NULL,
      pdf_file_name varchar(255) NOT NULL,
      storage_key varchar(500),
      student_count integer NOT NULL CHECK (student_count > 0),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE school.student_import_files
      ADD COLUMN IF NOT EXISTS storage_key varchar(500)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS student_import_files_created_idx
    ON school.student_import_files (created_at DESC)
  `);
}

export async function ensureContactRepliesSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school.contact_replies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contact_id uuid NOT NULL REFERENCES school.contacts(id) ON DELETE CASCADE,
      replied_by uuid NOT NULL REFERENCES school.users(id),
      message text NOT NULL,
      email_status varchar(20) NOT NULL DEFAULT 'sent',
      email_error text,
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE school.contact_replies
      ADD COLUMN IF NOT EXISTS email_status varchar(20) NOT NULL DEFAULT 'sent',
      ADD COLUMN IF NOT EXISTS email_error text,
      ADD COLUMN IF NOT EXISTS sent_at timestamptz
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS contact_replies_contact_idx
      ON school.contact_replies (contact_id, created_at DESC)
  `);
}

export async function ensureAcademicYearSemesters(pool) {
  await pool.query(`
    INSERT INTO school.semesters (academic_year_id, code, starts_on, ends_on)
    SELECT
      ay.id,
      term.code,
      CASE
        WHEN term.code = 'first' THEN ay.starts_on
        ELSE ay.starts_on + ((ay.ends_on - ay.starts_on) / 2) + 1
      END,
      CASE
        WHEN term.code = 'first' THEN ay.starts_on + ((ay.ends_on - ay.starts_on) / 2)
        ELSE ay.ends_on
      END
    FROM school.academic_years ay
    CROSS JOIN (VALUES
      ('first'::school.semester_code),
      ('second'::school.semester_code)
    ) AS term(code)
    WHERE ay.ends_on - ay.starts_on >= 2
    ON CONFLICT (academic_year_id, code) DO NOTHING
  `);
}

export async function ensureScoreValidation(pool) {
  await pool.query(`
    CREATE OR REPLACE FUNCTION school.validate_score_student_assignment()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM school.class_students cs
        JOIN school.teaching_assignments ta ON ta.class_id = cs.class_id
        WHERE cs.student_id = NEW.student_id
          AND ta.id = NEW.assignment_id
          AND (cs.left_at IS NULL OR cs.left_at >= CURRENT_DATE)
      ) THEN
        RAISE EXCEPTION 'Student % is not enrolled in the assigned class', NEW.student_id;
      END IF;
      RETURN NEW;
    END;
    $$
  `);
}

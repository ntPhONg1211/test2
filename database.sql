-- Website quản lý trường học - PostgreSQL / Neon
-- Chạy toàn bộ file này trên một database Neon mới.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS school;
SET search_path TO school, public;

CREATE TYPE user_role AS ENUM ('admin', 'principal', 'teacher', 'student', 'parent');
CREATE TYPE account_status AS ENUM ('active', 'disabled', 'locked');
CREATE TYPE publication_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE content_type AS ENUM ('news', 'announcement', 'event');
CREATE TYPE enrollment_status AS ENUM ('draft', 'pending_review', 'needs_supplement',
  'accepted', 'rejected', 'cancelled');
CREATE TYPE document_type AS ENUM ('birth_certificate', 'transcript', 'identity_document',
  'household_registration', 'portrait', 'other');
CREATE TYPE contact_status AS ENUM ('new', 'in_progress', 'resolved', 'spam');
CREATE TYPE score_type AS ENUM ('oral', 'fifteen_minutes', 'forty_five_minutes', 'midterm', 'final');
CREATE TYPE semester_code AS ENUM ('first', 'second');
CREATE TYPE resource_visibility AS ENUM ('public', 'authenticated', 'class_only', 'teacher_only');
CREATE TYPE queue_status AS ENUM ('waiting', 'called', 'served', 'missed', 'cancelled');
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'in_app');

CREATE TABLE roles (
  id          smallserial PRIMARY KEY,
  code        user_role NOT NULL UNIQUE,
  name        varchar(100) NOT NULL,
  description text
);

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username              varchar(100) NOT NULL UNIQUE,
  email                 varchar(320) UNIQUE,
  password_hash         text NOT NULL,
  full_name             varchar(200) NOT NULL,
  phone                 varchar(30),
  role                  user_role NOT NULL,
  status                account_status NOT NULL DEFAULT 'active',
  must_change_password  boolean NOT NULL DEFAULT true,
  last_login_at         timestamptz,
  password_changed_at   timestamptz,
  disabled_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email IS NULL OR email = lower(email))
);

CREATE TABLE account_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by    uuid NOT NULL REFERENCES users(id),
  academic_year_id uuid,
  source_file    varchar(500),
  total_rows     integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  success_rows   integer NOT NULL DEFAULT 0 CHECK (success_rows >= 0),
  failed_rows    integer NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account_batch_errors (
  id          bigserial PRIMARY KEY,
  batch_id    uuid NOT NULL REFERENCES account_batches(id) ON DELETE CASCADE,
  row_number  integer NOT NULL,
  code        varchar(100) NOT NULL,
  message     text NOT NULL,
  raw_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academic_years (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(20) NOT NULL UNIQUE,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  is_current  boolean NOT NULL DEFAULT false,
  CHECK (ends_on > starts_on)
);

ALTER TABLE account_batches
  ADD CONSTRAINT account_batches_year_fk FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);

CREATE UNIQUE INDEX one_current_academic_year ON academic_years (is_current) WHERE is_current;

CREATE TABLE grades (
  id          smallserial PRIMARY KEY,
  code        varchar(20) NOT NULL UNIQUE,
  name        varchar(100) NOT NULL,
  sort_order  smallint NOT NULL UNIQUE
);

CREATE TABLE classes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  grade_id        smallint NOT NULL REFERENCES grades(id),
  code            varchar(30) NOT NULL,
  name            varchar(100) NOT NULL,
  homeroom_teacher_id uuid,
  capacity        smallint CHECK (capacity IS NULL OR capacity > 0),
  UNIQUE (academic_year_id, code)
);

CREATE TABLE teachers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_code  varchar(50) NOT NULL UNIQUE,
  date_of_birth  date,
  gender         varchar(20),
  specialization varchar(150),
  employment_date date
);

CREATE TABLE students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  student_code   varchar(50) NOT NULL UNIQUE,
  first_name     varchar(100) NOT NULL,
  last_name      varchar(100) NOT NULL,
  date_of_birth  date,
  gender         varchar(20),
  address        text,
  guardian_name  varchar(200),
  guardian_phone varchar(30),
  guardian_email varchar(320),
  birth_place    varchar(200),
  previous_class_name varchar(100),
  student_category varchar(80),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE classes
  ADD CONSTRAINT classes_homeroom_teacher_fk FOREIGN KEY (homeroom_teacher_id) REFERENCES teachers(id);

CREATE TABLE class_students (
  class_id     uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrolled_at  date NOT NULL DEFAULT CURRENT_DATE,
  left_at      date,
  PRIMARY KEY (class_id, student_id),
  CHECK (left_at IS NULL OR left_at >= enrolled_at)
);

CREATE TABLE student_class_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  request_type       varchar(20) NOT NULL CHECK (request_type IN ('enroll', 'transfer')),
  requested_class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  requested_by       uuid NOT NULL REFERENCES users(id),
  decided_by         uuid REFERENCES users(id),
  status             varchar(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz
);

CREATE UNIQUE INDEX student_class_requests_pending_unique
  ON student_class_requests (student_id, requested_class_id)
  WHERE status = 'pending';
CREATE INDEX student_class_requests_status_idx
  ON student_class_requests (status, request_type, created_at DESC);

CREATE TABLE student_import_files (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id   uuid NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  created_by         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_file        varchar(255) NOT NULL,
  pdf_file_name      varchar(255) NOT NULL,
  student_count      integer NOT NULL CHECK (student_count > 0),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_import_files_created_idx
  ON student_import_files (created_at DESC);

CREATE TABLE subjects (
  id          smallserial PRIMARY KEY,
  code        varchar(30) NOT NULL UNIQUE,
  name        varchar(150) NOT NULL UNIQUE,
  description text,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE teaching_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  smallint NOT NULL REFERENCES subjects(id),
  teacher_id  uuid NOT NULL REFERENCES teachers(id),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  UNIQUE (class_id, subject_id, academic_year_id)
);

CREATE TABLE rooms (
  id          smallserial PRIMARY KEY,
  code        varchar(30) NOT NULL UNIQUE,
  name        varchar(100) NOT NULL,
  capacity    smallint CHECK (capacity > 0),
  room_type   varchar(50) NOT NULL DEFAULT 'classroom'
);

CREATE TABLE schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id      smallint NOT NULL REFERENCES subjects(id),
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  room_id         smallint REFERENCES rooms(id),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  semester        semester_code NOT NULL,
  day_of_week    smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_number  smallint NOT NULL CHECK (period_number BETWEEN 1 AND 12),
  starts_at      time NOT NULL,
  ends_at        time NOT NULL,
  effective_from date,
  effective_to   date,
  CHECK (ends_at > starts_at),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX schedules_class_slot
  ON schedules (class_id, academic_year_id, semester, day_of_week, period_number);
CREATE UNIQUE INDEX schedules_teacher_slot
  ON schedules (teacher_id, academic_year_id, semester, day_of_week, period_number);
CREATE UNIQUE INDEX schedules_room_slot
  ON schedules (room_id, academic_year_id, semester, day_of_week, period_number)
  WHERE room_id IS NOT NULL;

CREATE TABLE semesters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  code            semester_code NOT NULL,
  starts_on       date NOT NULL,
  ends_on         date NOT NULL,
  UNIQUE (academic_year_id, code),
  CHECK (ends_on > starts_on)
);

CREATE TABLE grade_components (
  id          smallserial PRIMARY KEY,
  code        score_type NOT NULL UNIQUE,
  name        varchar(100) NOT NULL,
  weight      numeric(5,2) NOT NULL CHECK (weight > 0)
);

CREATE TABLE scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assignment_id  uuid NOT NULL REFERENCES teaching_assignments(id) ON DELETE CASCADE,
  semester_id    uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  component_id   smallint NOT NULL REFERENCES grade_components(id),
  score          numeric(4,2) NOT NULL CHECK (score BETWEEN 0 AND 10),
  note           text,
  entered_by     uuid NOT NULL REFERENCES teachers(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, assignment_id, semester_id, component_id)
);

CREATE TABLE content_categories (
  id          smallserial PRIMARY KEY,
  name        varchar(100) NOT NULL UNIQUE,
  slug        varchar(120) NOT NULL UNIQUE
);

CREATE TABLE content_tags (
  id          smallserial PRIMARY KEY,
  name        varchar(100) NOT NULL UNIQUE,
  slug        varchar(120) NOT NULL UNIQUE
);

CREATE TABLE contents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            content_type NOT NULL,
  category_id     smallint REFERENCES content_categories(id) ON DELETE SET NULL,
  author_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  title           varchar(300) NOT NULL,
  slug            varchar(340) NOT NULL UNIQUE,
  excerpt         text,
  body            text NOT NULL,
  cover_url       text,
  status          publication_status NOT NULL DEFAULT 'draft',
  is_featured     boolean NOT NULL DEFAULT false,
  published_at    timestamptz,
  event_starts_at timestamptz,
  event_ends_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (event_ends_at IS NULL OR event_starts_at IS NULL OR event_ends_at >= event_starts_at)
);

CREATE TABLE content_tag_map (
  content_id uuid NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  tag_id     smallint NOT NULL REFERENCES content_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, tag_id)
);

CREATE TABLE school_pages (
  id          smallserial PRIMARY KEY,
  slug        varchar(150) NOT NULL UNIQUE,
  title       varchar(250) NOT NULL,
  body        text NOT NULL,
  cover_url   text,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admission_campaigns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  name           varchar(250) NOT NULL,
  slug           varchar(280) NOT NULL UNIQUE,
  description    text,
  opens_at       timestamptz NOT NULL,
  closes_at      timestamptz NOT NULL,
  appointment_start_date date NOT NULL DEFAULT CURRENT_DATE,
  appointment_start time,
  appointment_end   time,
  daily_queue_limit integer CHECK (daily_queue_limit IS NULL OR daily_queue_limit > 0),
  is_open        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

CREATE TABLE admission_applicants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES admission_campaigns(id),
  applicant_code varchar(50) NOT NULL,
  first_name     varchar(100) NOT NULL,
  last_name      varchar(100) NOT NULL,
  date_of_birth  date NOT NULL,
  gender         varchar(20),
  birth_place    varchar(200),
  address        text NOT NULL,
  previous_school varchar(250),
  desired_grade_id smallint REFERENCES grades(id),
  parent_name    varchar(200) NOT NULL,
  parent_phone   varchar(30) NOT NULL,
  parent_email   varchar(320),
  parent_relationship varchar(50),
  status         enrollment_status NOT NULL DEFAULT 'pending_review',
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  review_note    text,
  application_fingerprint text NOT NULL,
  UNIQUE (campaign_id, applicant_code)
);

CREATE UNIQUE INDEX admission_applicants_no_duplicate_idx
  ON admission_applicants (application_fingerprint);

CREATE OR REPLACE FUNCTION set_admission_fingerprint()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.application_fingerprint := md5(concat_ws('|',
    lower(trim(NEW.first_name)),
    lower(trim(NEW.last_name)),
    NEW.date_of_birth::text,
    coalesce(lower(trim(NEW.gender)), ''),
    lower(trim(NEW.address)),
    coalesce(NEW.desired_grade_id::text, ''),
    lower(trim(NEW.parent_name)),
    regexp_replace(NEW.parent_phone, '[^0-9]+', '', 'g'),
    coalesce(lower(trim(NEW.parent_email)), '')
  ));
  RETURN NEW;
END;
$$;

CREATE TRIGGER admission_applicants_fingerprint
BEFORE INSERT OR UPDATE ON admission_applicants
FOR EACH ROW EXECUTE FUNCTION set_admission_fingerprint();

CREATE TABLE admission_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id   uuid NOT NULL REFERENCES admission_applicants(id) ON DELETE CASCADE,
  document_type  document_type NOT NULL,
  original_name  varchar(300) NOT NULL,
  storage_key    text NOT NULL UNIQUE,
  mime_type      varchar(120) NOT NULL,
  file_size      bigint NOT NULL CHECK (file_size > 0),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  verified_at    timestamptz,
  verified_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  verification_note text
);

CREATE TABLE admission_appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id   uuid NOT NULL UNIQUE REFERENCES admission_applicants(id) ON DELETE CASCADE,
  appointment_date date NOT NULL,
  queue_number   integer NOT NULL CHECK (queue_number > 0),
  status         queue_status NOT NULL DEFAULT 'waiting',
  called_at      timestamptz,
  served_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_date, queue_number)
);

CREATE TABLE notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  applicant_id   uuid REFERENCES admission_applicants(id) ON DELETE CASCADE,
  channel        notification_channel NOT NULL,
  recipient      varchar(320) NOT NULL,
  subject        varchar(300),
  body           text NOT NULL,
  sent_at        timestamptz,
  delivered_at   timestamptz,
  failure_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR applicant_id IS NOT NULL)
);

CREATE TABLE learning_resources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_id     smallint REFERENCES subjects(id) ON DELETE SET NULL,
  grade_id       smallint REFERENCES grades(id) ON DELETE SET NULL,
  class_id       uuid REFERENCES classes(id) ON DELETE SET NULL,
  semester_id    uuid REFERENCES semesters(id) ON DELETE SET NULL,
  title          varchar(300) NOT NULL,
  description    text,
  storage_key    text NOT NULL UNIQUE,
  original_name  varchar(300) NOT NULL,
  mime_type      varchar(120) NOT NULL,
  file_size      bigint NOT NULL CHECK (file_size > 0),
  visibility     resource_visibility NOT NULL DEFAULT 'authenticated',
  download_count bigint NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource_class_access (
  resource_id uuid NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, class_id)
);

CREATE TABLE contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name  varchar(200) NOT NULL,
  sender_email varchar(320),
  sender_phone varchar(30),
  subject      varchar(300) NOT NULL,
  message      text NOT NULL,
  status       contact_status NOT NULL DEFAULT 'new',
  assigned_to  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_replies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  replied_by   uuid NOT NULL REFERENCES users(id),
  message      text NOT NULL,
  email_status varchar(20) NOT NULL DEFAULT 'sent',
  email_error  text,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE faqs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question    varchar(500) NOT NULL,
  answer      text NOT NULL,
  category    varchar(100),
  sort_order  integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(100) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account_management_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by   uuid NOT NULL REFERENCES users(id),
  approved_by    uuid REFERENCES users(id),
  action         varchar(30) NOT NULL CHECK (action IN ('create', 'disable', 'reset_password')),
  target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz
);

CREATE INDEX account_requests_status_idx
  ON account_management_requests (status, created_at DESC);

CREATE INDEX users_role_status_idx ON users (role, status);
CREATE INDEX class_students_student_idx ON class_students (student_id);
CREATE INDEX scores_lookup_idx ON scores (student_id, semester_id);
CREATE INDEX contents_published_idx ON contents (status, published_at DESC);
CREATE INDEX admissions_status_idx ON admission_applicants (campaign_id, status, submitted_at);
CREATE INDEX resources_filter_idx ON learning_resources (subject_id, grade_id, visibility);
CREATE INDEX contacts_status_idx ON contacts (status, created_at DESC);
CREATE INDEX contact_replies_contact_idx ON contact_replies (contact_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER scores_set_updated_at BEFORE UPDATE ON scores
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contents_set_updated_at BEFORE UPDATE ON contents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION validate_score_student_assignment()
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
$$;

CREATE TRIGGER scores_validate_enrollment
BEFORE INSERT OR UPDATE ON scores
FOR EACH ROW EXECUTE FUNCTION validate_score_student_assignment();

CREATE VIEW student_subject_averages AS
SELECT
  s.student_id,
  ta.class_id,
  ta.subject_id,
  s.semester_id,
  round(sum(s.score * gc.weight) / NULLIF(sum(gc.weight), 0), 2) AS average_score
FROM scores s
JOIN grade_components gc ON gc.id = s.component_id
JOIN teaching_assignments ta ON ta.id = s.assignment_id
GROUP BY s.student_id, ta.class_id, ta.subject_id, s.semester_id;

CREATE VIEW student_semester_averages AS
SELECT student_id, semester_id, round(avg(average_score), 2) AS average_score
FROM student_subject_averages
GROUP BY student_id, semester_id;

INSERT INTO roles (code, name, description) VALUES
  ('admin', 'Quản trị viên', 'Quản trị toàn bộ hệ thống'),
  ('principal', 'Ban giám hiệu', 'Xét duyệt tuyển sinh và xem báo cáo'),
  ('teacher', 'Giáo viên', 'Quản lý lớp, điểm và tài liệu'),
  ('student', 'Học sinh', 'Tra cứu điểm và tài liệu'),
  ('parent', 'Phụ huynh', 'Theo dõi hồ sơ và kết quả học tập')
ON CONFLICT (code) DO NOTHING;

INSERT INTO grades (code, name, sort_order) VALUES
  ('G1', 'Khối 1', 1), ('G2', 'Khối 2', 2), ('G3', 'Khối 3', 3),
  ('G4', 'Khối 4', 4), ('G5', 'Khối 5', 5), ('G6', 'Khối 6', 6),
  ('G7', 'Khối 7', 7), ('G8', 'Khối 8', 8), ('G9', 'Khối 9', 9),
  ('G10', 'Khối 10', 10), ('G11', 'Khối 11', 11), ('G12', 'Khối 12', 12)
ON CONFLICT (code) DO NOTHING;

INSERT INTO subjects (code, name) VALUES
  ('MATH', 'Toán'), ('LIT', 'Ngữ văn'), ('ENG', 'Tiếng Anh'),
  ('PHYS', 'Vật lý'), ('CHEM', 'Hóa học'), ('BIO', 'Sinh học'),
  ('HIST', 'Lịch sử'), ('GEO', 'Địa lý'), ('IT', 'Tin học'),
  ('PE', 'Giáo dục thể chất')
ON CONFLICT (code) DO NOTHING;

INSERT INTO grade_components (code, name, weight) VALUES
  ('oral', 'Miệng', 1), ('fifteen_minutes', '15 phút', 1),
  ('forty_five_minutes', '1 tiết', 2), ('midterm', 'Giữa kỳ', 2),
  ('final', 'Cuối kỳ', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO content_categories (name, slug) VALUES
  ('Tin tức', 'tin-tuc'), ('Thông báo', 'thong-bao'),
  ('Sự kiện', 'su-kien'), ('Tuyển sinh', 'tuyen-sinh')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO school_pages (slug, title, body) VALUES
  ('gioi-thieu', 'Giới thiệu nhà trường', 'Nội dung giới thiệu nhà trường.'),
  ('lich-su', 'Lịch sử hình thành', 'Nội dung lịch sử hình thành và phát triển.'),
  ('co-so-vat-chat', 'Cơ sở vật chất', 'Thông tin cơ sở vật chất của nhà trường.'),
  ('doi-ngu', 'Đội ngũ', 'Thông tin đội ngũ cán bộ, giáo viên.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;

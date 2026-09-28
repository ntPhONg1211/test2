import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createStudentClassRequest,
  deleteStudentImportFile,
  downloadStudentImportFile,
  fetchAdminStudents,
  fetchClasses,
  fetchStudentImportFiles,
  fetchStudentClassRequests,
  importStudentRoster,
} from "../../services/api";

const STATUS_LABELS = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};
const TYPE_LABELS = {
  enroll: "Xin vào lớp",
  transfer: "Xin chuyển lớp",
};

export default function StudentsManager({ onMessage }) {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [credentialFiles, setCredentialFiles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [rosterFile, setRosterFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState("students-list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [studentPageSize, setStudentPageSize] = useState(10);
  const [credentialPageSize, setCredentialPageSize] = useState(10);
  const [requestPageSize, setRequestPageSize] = useState(10);

  const normalizedSearchTerm = searchTerm.trim();
  const filteredStudents = students.filter((student) => {
    if (!normalizedSearchTerm) return false;
    const haystack = [
      student.full_name,
      student.student_code,
      student.username,
      student.current_class_name,
      student.academic_year_name,
      student.previous_class_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
    const needle = normalizedSearchTerm
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
    return haystack.includes(needle);
  });

  const tabs = [
    { key: "students-list", label: "Danh sách học sinh" },
    { key: "student-import", label: "Import danh sách" },
    { key: "student-request-form", label: "Tạo yêu cầu xếp lớp" },
  ];

  const handleSectionChange = (sectionKey) => {
    setActiveSection(sectionKey);
    const sectionId = {
      "students-list": "students-list-section",
      "student-import": "student-import-section",
      "student-request-form": "student-request-form",
    }[sectionKey];
    if (!sectionId) return;
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextStudents, classData, nextRequests, nextCredentialFiles] = await Promise.all([
        fetchAdminStudents(),
        fetchClasses(),
        fetchStudentClassRequests(),
        fetchStudentImportFiles(),
      ]);
      const preferredAcademicYear = classData.academicYears.find((year) => year.is_current) ?? classData.academicYears[0] ?? null;
      setStudents(nextStudents);
      setClasses(classData.classes);
      setAcademicYears(classData.academicYears);
      setAcademicYearId((current) => current || preferredAcademicYear?.id || "");
      setRequests(nextRequests);
      setCredentialFiles(nextCredentialFiles);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const unlockImportUi = () => {
    const appRoot = document.getElementById("root");
    if (appRoot) appRoot.inert = false;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", handleImportEscape, true);
  };

  const handleImportEscape = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useEffect(() => {
    if (!importing) {
      unlockImportUi();
      return undefined;
    }

    const appRoot = document.getElementById("root");
    const wasInert = appRoot?.inert || false;
    const previousOverflow = document.body.style.overflow;
    if (appRoot) appRoot.inert = true;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleImportEscape, true);
    return () => {
      if (appRoot) appRoot.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleImportEscape, true);
    };
  }, [importing]);

  const submitImport = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!rosterFile || !academicYearId) return;
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const result = await importStudentRoster(rosterFile, academicYearId);
      setImportResult(result);
      setRosterFile(null);
      form.reset();
      if (result.importedCount) {
        onMessage(`Đã nhập ${result.importedCount} học sinh; yêu cầu vào lớp đang chờ BGH duyệt.`);
        await load();
      }
    } catch (importError) {
      setError(importError.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadCredentialFile = async (file) => {
    setError("");
    try {
      await downloadStudentImportFile(file.id, file.pdf_file_name);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  };

  const removeCredentialFile = async (file) => {
    if (!window.confirm(`Xóa vĩnh viễn file ${file.pdf_file_name}?`)) return;
    setError("");
    try {
      await deleteStudentImportFile(file.id);
      onMessage("Đã xóa file PDF thông tin đăng nhập.");
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    try {
      const request = await createStudentClassRequest(studentId, classId);
      onMessage(
        `Đã gửi yêu cầu ${TYPE_LABELS[request.request_type].toLowerCase()} chờ Ban giám hiệu duyệt.`
      );
      form.reset();
      setStudentId("");
      setClassId("");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {importing && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#17141f]/70 p-5">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="student-import-progress-title"
            aria-describedby="student-import-progress-description"
            className="w-full max-w-md bg-white p-8 text-center shadow-2xl"
          >
            <span
              aria-hidden="true"
              className="mx-auto block h-12 w-12 animate-spin rounded-full border-4 border-stone-200 border-t-[#7562ed]"
            />
            <h2 id="student-import-progress-title" className="mt-6 font-serif text-2xl">
              Đang nhập danh sách học sinh
            </h2>
            <p id="student-import-progress-description" aria-live="assertive" className="mt-3 text-sm leading-6 text-stone-600">
              Đang tạo tài khoản, mật khẩu tạm, yêu cầu duyệt lớp và file PDF bảo mật. Vui lòng không thao tác hoặc đóng trang.
            </p>
            <div className="mt-6 h-2 overflow-hidden bg-stone-100">
              <div className="h-full w-1/2 animate-pulse bg-[#7562ed]" />
            </div>
          </section>
        </div>,
        document.body,
      )}
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 bg-white p-3 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                handleSectionChange(tab.key);
              }}
              className={[
                "border px-4 py-2 text-[10px] font-medium uppercase tracking-wide",
                activeSection === tab.key
                  ? "border-[#7562ed] bg-[#7562ed] text-white"
                  : "border-stone-200 bg-white text-stone-700",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      {error && (
        <p role="alert" className="border-l-2 border-[#e36c55] bg-white px-4 py-3 text-sm text-[#b84e3b]">
          {error}
        </p>
      )}
      <div id="students-list-section" className="overflow-x-auto bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase text-stone-500">Quản lý học sinh</p>
            <h2 className="mt-1 font-serif text-2xl">Xem danh sách học sinh</h2>
          </div>
          <div className="flex w-full max-w-md items-center gap-2 border border-stone-200 bg-stone-50 px-3 py-2">
            <span className="text-sm text-stone-500">⌕</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo tên, mã, lớp..."
              className="w-full bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-[10px] font-medium uppercase tracking-wide text-stone-500"
              >
                Xóa
              </button>
            )}
          </div>
          <button onClick={load} className="font-mono text-[10px] text-[#7562ed]">Làm mới</button>
        </div>
        {loading ? (
          <p className="mt-5 text-sm text-stone-500">Đang tải danh sách học sinh...</p>
        ) : !normalizedSearchTerm ? (
          <p className="mt-5 text-sm text-stone-500">Nhập từ khóa để hiển thị học sinh theo tên, lớp hoặc mã.</p>
        ) : filteredStudents.length ? (
          <>
            <table className="mt-5 w-full min-w-[1050px] text-left text-xs">
              <thead className="bg-[#a9f2cf] font-mono text-[10px]">
                <tr>
                  <th className="p-3">Mã học sinh</th>
                  <th className="p-3">Họ tên</th>
                  <th className="p-3">Tài khoản</th>
                  <th className="p-3">Lớp hiện tại</th>
                  <th className="p-3">Năm học</th>
                  <th className="p-3">Lớp cũ / đối tượng / ghi chú</th>
                  <th className="p-3">Phụ huynh</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.slice(0, studentPageSize).map((student) => (
                  <tr className="border-b border-stone-100" key={student.id}>
                    <td className="p-3 font-semibold">{student.student_code}</td>
                    <td className="p-3">{student.full_name}</td>
                    <td className="p-3">{student.username || "Chưa có tài khoản"}</td>
                    <td className="p-3">{student.current_class_name || "Chưa xếp lớp"}</td>
                    <td className="p-3">{student.academic_year_name || "—"}</td>
                    <td className="p-3">
                      {student.previous_class_name || "—"}
                      {student.student_category && <><br /><span className="text-stone-500">{student.student_category}</span></>}
                      {student.notes && <><br /><span className="text-stone-500">{student.notes}</span></>}
                    </td>
                    <td className="p-3">{student.guardian_name || "—"}<br />{student.guardian_phone || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {studentPageSize < filteredStudents.length && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setStudentPageSize((current) => Math.min(current + 10, filteredStudents.length))}
                  className="bg-[#17141f] px-4 py-2 text-xs text-white"
                >
                  Xem thêm
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="mt-5 text-sm text-stone-500">Không tìm thấy học sinh phù hợp với từ khóa này.</p>
        )}
      </div>

      <section id="student-import-section" className="space-y-6 bg-white p-6">
        <div>
          <p className="font-mono text-[10px] uppercase text-stone-500">Import danh sách</p>
          <h2 className="mt-2 font-serif text-2xl">Nhập học sinh từ .xlsx</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Đọc các sheet có cột Họ và tên, Ngày sinh, Lớp mới, Nữ, Lớp cũ, Đối tượng và Ghi chú. Tài khoản và mật khẩu tạm được tạo tự động; các yêu cầu vào lớp sẽ chờ BGH duyệt.
          </p>
        </div>

        <form onSubmit={submitImport} className="grid gap-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="font-mono text-[10px] uppercase text-stone-500">
            Năm học áp dụng
            <select
              required
              value={academicYearId}
              onChange={(event) => setAcademicYearId(event.target.value)}
              className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
            >
              <option value="">Chọn năm học</option>
              {academicYears.map((year) => (
                <option value={year.id} key={year.id}>{year.name}</option>
              ))}
            </select>
          </label>
          <label className="font-mono text-[10px] uppercase text-stone-500">
            File Excel (.xlsx, tối đa 5 MB)
            <input
              required
              type="file"
              accept=".xlsx"
              onChange={(event) => setRosterFile(event.target.files?.[0] || null)}
              className="mt-2 block w-full border-b border-stone-300 bg-transparent py-2 font-sans text-xs"
            />
          </label>
          <button
            disabled={importing || !rosterFile || !academicYearId}
            className="bg-[#7562ed] px-5 py-3 text-xs text-white disabled:opacity-50"
          >
            {importing ? "Đang nhập..." : "Import danh sách ↗"}
          </button>
        </form>

        <div className="border-t border-stone-200 pt-6">
          <p className="font-mono text-[10px] uppercase text-stone-500">Lưu đến khi Admin xóa</p>
          <h3 className="mt-2 font-serif text-2xl">File thông tin đăng nhập</h3>
          <p className="mt-2 text-sm text-stone-600">
            PDF chỉ tải được khi Admin đăng nhập. File chứa mật khẩu tạm dạng đọc được; xóa file khi không còn cần lưu.
          </p>
          {credentialFiles.length ? (
            <>
              <div className="mt-3 divide-y divide-stone-100">
                {credentialFiles.slice(0, credentialPageSize).map((file) => (
                  <article className="flex flex-wrap items-center justify-between gap-4 py-4" key={file.id}>
                    <div>
                      <p className="font-mono text-xs text-[#7562ed]">{file.pdf_file_name}</p>
                      <p className="mt-1 text-sm">
                        {file.student_count} tài khoản · Năm học {file.academic_year_name}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Nguồn: {file.source_file} · Tạo {new Date(file.created_at).toLocaleString("vi-VN")} · {file.created_by_name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => downloadCredentialFile(file)}
                        className="bg-[#17141f] px-4 py-2 text-xs text-white"
                      >
                        Tải PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCredentialFile(file)}
                        className="bg-[#f6a2bd] px-4 py-2 text-xs text-[#7d3347]"
                      >
                        Xóa file
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {credentialPageSize < credentialFiles.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setCredentialPageSize((current) => Math.min(current + 10, credentialFiles.length))}
                    className="bg-[#17141f] px-4 py-2 text-xs text-white"
                  >
                    Xem thêm
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-stone-500">Chưa có file thông tin đăng nhập nào.</p>
          )}
        </div>
      </section>

      {importResult && (
        <section className="space-y-4 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">Kết quả import</h2>
              <p className="mt-2 text-sm text-stone-600">
                Đã tạo {importResult.importedCount} tài khoản; {importResult.failedCount} dòng lỗi/bỏ qua; đã tạo {importResult.classesCreated} lớp mới.
              </p>
            </div>
          </div>
          {!!importResult.credentials.length && (
            <>
              <p className="border-l-2 border-[#e6b43d] bg-[#fff9e9] px-4 py-3 text-xs text-stone-700">
                File PDF thông tin đăng nhập đã được lưu trong mục file bên dưới. Mật khẩu tạm chỉ hiển thị ở kết quả import lần này.
              </p>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="sticky top-0 bg-[#a9f2cf] font-mono text-[10px]">
                    <tr>
                      <th className="p-3">Mã học sinh</th>
                      <th className="p-3">Họ tên</th>
                      <th className="p-3">Tên đăng nhập</th>
                      <th className="p-3">Mật khẩu tạm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.credentials.map((item) => (
                      <tr className="border-b border-stone-100" key={item.studentCode}>
                        <td className="p-3">{item.studentCode}</td>
                        <td className="p-3">{item.fullName}</td>
                        <td className="p-3 font-mono">{item.username}</td>
                        <td className="p-3 font-mono">{item.temporaryPassword}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!!importResult.errors.length && (
            <div className="max-h-64 overflow-auto border-l-2 border-[#e36c55] bg-[#fff7f5] p-4">
              <h3 className="text-sm font-semibold">Dòng cần kiểm tra</h3>
              <ul className="mt-2 space-y-1 text-xs text-stone-700">
                {importResult.errors.map((item, index) => (
                  <li key={`${item.sheet}-${item.row}-${index}`}>
                    {item.sheet}, dòng {item.row}: {item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section id="student-request-form" className="space-y-6 bg-white p-6">
        <div>
          <p className="font-mono text-[10px] uppercase text-stone-500">Yêu cầu xếp lớp</p>
          <h2 className="mt-1 font-serif text-2xl">Tạo yêu cầu xếp lớp</h2>
        </div>

        <form onSubmit={submitRequest} className="grid gap-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="md:col-span-3">
            <p className="mt-2 text-sm text-stone-600">
              Hệ thống tự phân loại xin vào lớp hoặc xin chuyển lớp theo lớp hiện tại của học sinh. Mọi yêu cầu đều cần BGH duyệt.
            </p>
          </div>
          <label className="font-mono text-[10px] uppercase text-stone-500">
            Học sinh
            <select
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
            >
              <option value="">Chọn học sinh</option>
              {students.map((student) => (
                <option value={student.id} key={student.id}>
                  {student.student_code} — {student.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="font-mono text-[10px] uppercase text-stone-500">
            Lớp đăng ký/chuyển đến
            <select
              required
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
            >
              <option value="">Chọn lớp</option>
              {classes.map((schoolClass) => (
                <option value={schoolClass.id} key={schoolClass.id}>
                  {schoolClass.name} — {schoolClass.grade_name} ({schoolClass.academic_year_name})
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={saving || !students.length || !classes.length}
            className="bg-[#17141f] px-5 py-3 text-xs text-white disabled:opacity-50"
          >
            {saving ? "Đang gửi..." : "Gửi BGH duyệt ↗"}
          </button>
        </form>

        <div className="overflow-x-auto border-t border-stone-200 pt-6">
          <h3 className="font-serif text-2xl">Yêu cầu xếp lớp gần đây</h3>
          {requests.length ? (
            <>
              <table className="mt-5 w-full min-w-[700px] text-left text-xs">
                <thead className="bg-[#a9f2cf] font-mono text-[10px]">
                  <tr>
                    <th className="p-3">Loại yêu cầu</th>
                    <th className="p-3">Học sinh</th>
                    <th className="p-3">Lớp yêu cầu</th>
                    <th className="p-3">Người gửi</th>
                    <th className="p-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.slice(0, requestPageSize).map((request) => (
                    <tr className="border-b border-stone-100" key={request.id}>
                      <td className="p-3">{TYPE_LABELS[request.request_type]}</td>
                      <td className="p-3">{request.student_code} · {request.last_name} {request.first_name}</td>
                      <td className="p-3">{request.requested_class_name}</td>
                      <td className="p-3">{request.requested_by_name}</td>
                      <td className="p-3">{STATUS_LABELS[request.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {requestPageSize < requests.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setRequestPageSize((current) => Math.min(current + 10, requests.length))}
                    className="bg-[#17141f] px-4 py-2 text-xs text-white"
                  >
                    Xem thêm
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-5 text-sm text-stone-500">Chưa có yêu cầu xếp lớp nào.</p>
          )}
        </div>
      </section>
      </div>
    </>
  );
}

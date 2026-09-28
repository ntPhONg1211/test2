import { useEffect, useMemo, useState } from "react";
import {
  downloadTeacherResource,
  fetchCurrentUser,
  fetchTeacherAssignments,
  fetchTeacherGradebook,
  fetchTeacherResources,
  fetchTeacherSchedule,
  saveTeacherScores,
  uploadTeacherResource,
} from "../services/api";
import { go } from "../utils/navigation";

const DAYS = ["", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];
const TABS = [
  ["scores", "Nhập điểm"],
  ["resources", "Tài liệu giảng dạy"],
  ["schedule", "Thời khóa biểu"],
];

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

export default function TeacherDashboard() {
  const [tab, setTab] = useState("scores");
  const [teacherName, setTeacherName] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [gradebook, setGradebook] = useState(null);
  const [gradeEntries, setGradeEntries] = useState({});
  const [schedule, setSchedule] = useState([]);
  const [resources, setResources] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [gradebookLoading, setGradebookLoading] = useState(false);
  const [savingScores, setSavingScores] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedAssignment = assignments.find((item) => item.id === assignmentId);

  const refreshTeacherData = async () => {
    setRefreshing(true);
    setError("");
    setMessage("");
    try {
      const [profile, nextAssignments, nextSchedule, nextResources] = await Promise.all([
        fetchCurrentUser(),
        fetchTeacherAssignments(),
        fetchTeacherSchedule(),
        fetchTeacherResources(),
      ]);
      setTeacherName(profile.user.fullName || profile.user.username);
      setAssignments(nextAssignments);
      setAssignmentId((current) => current || nextAssignments[0]?.id || "");
      setSchedule(nextSchedule);
      setResources(nextResources);
      setMessage("Đã làm mới dữ liệu giáo viên.");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [profile, nextAssignments, nextSchedule, nextResources] = await Promise.all([
          fetchCurrentUser(),
          fetchTeacherAssignments(),
          fetchTeacherSchedule(),
          fetchTeacherResources(),
        ]);
        if (!active) return;
        setTeacherName(profile.user.fullName || profile.user.username);
        setAssignments(nextAssignments);
        setAssignmentId(nextAssignments[0]?.id || "");
        setSchedule(nextSchedule);
        setResources(nextResources);
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!assignmentId) {
      setGradebook(null);
      setSemesterId("");
      return;
    }
    let active = true;
    setGradebookLoading(true);
    fetchTeacherGradebook(assignmentId, semesterId)
      .then((data) => {
        if (!active) return;
        setGradebook(data);
        const nextSemesterId = semesterId && data.semesters.some((semester) => semester.id === semesterId)
          ? semesterId
          : data.semesters[0]?.id || "";
        setSemesterId(nextSemesterId);
        const entries = {};
        for (const student of data.students) {
          if (student.component_id !== null) {
            entries[`${student.id}:${student.component_id}`] = String(student.score);
          }
        }
        setGradeEntries(entries);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setGradebookLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId, semesterId]);

  const gradebookData = useMemo(() => {
    if (!gradebook) return { components: [], students: [] };
    const studentsById = new Map();
    for (const row of gradebook.students) {
      if (!studentsById.has(row.id)) {
        studentsById.set(row.id, {
          id: row.id,
          student_code: row.student_code,
          first_name: row.first_name,
          last_name: row.last_name,
          savedScores: {},
        });
      }
      if (row.component_id !== null) {
        studentsById.get(row.id).savedScores[row.component_id] = Number(row.score);
      }
    }
    return {
      components: gradebook.components,
      students: [...studentsById.values()],
    };
  }, [gradebook]);

  const selectedStudent = gradebookData.students.find((student) => student.id === selectedStudentId);
  const filteredStudents = useMemo(() => {
    const query = normalizeSearchText(studentSearch.trim());
    if (!query) return gradebookData.students;
    return gradebookData.students.filter((student) =>
      normalizeSearchText(`${student.last_name} ${student.first_name} ${student.student_code}`).includes(query),
    );
  }, [gradebookData.students, studentSearch]);

  useEffect(() => {
    if (!selectedStudentId || savingScores) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedStudentId("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedStudentId, savingScores]);

  const changeScore = (studentId, componentId, value) => {
    setGradeEntries((current) => ({
      ...current,
      [`${studentId}:${componentId}`]: value,
    }));
  };

  const submitScores = async (event) => {
    event.preventDefault();
    if (!gradebook || !semesterId) {
      setError("Chưa có học kỳ để lưu điểm.");
      return;
    }
    if (!selectedStudent) {
      setError("Vui lòng chọn học sinh cần nhập điểm.");
      return;
    }
    const scores = [];
    for (const component of gradebookData.components) {
      const key = `${selectedStudent.id}:${component.id}`;
      const value = gradeEntries[key] ?? "";
      const savedValue = selectedStudent.savedScores[component.id];
      if (value === "" && savedValue === undefined) continue;
      if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 10)) {
        setError("Điểm phải nằm trong khoảng từ 0 đến 10.");
        return;
      }
      if (value === "" || Number(value) !== savedValue) {
        scores.push({
          studentId: selectedStudent.id,
          componentId: component.id,
          score: value === "" ? null : Number(value),
        });
      }
    }
    if (!scores.length) {
      setMessage("Không có điểm nào thay đổi.");
      setError("");
      setSelectedStudentId("");
      return;
    }

    setSavingScores(true);
    setError("");
    try {
      const result = await saveTeacherScores(assignmentId, semesterId, scores);
      setMessage(`Đã lưu ${result.savedCount} điểm${result.deletedCount ? ` và xóa ${result.deletedCount} điểm` : ""}.`);
      const updated = await fetchTeacherGradebook(assignmentId, semesterId);
      setGradebook(updated);
      const entries = { ...gradeEntries };
      for (const component of gradebookData.components) {
        delete entries[`${selectedStudent.id}:${component.id}`];
      }
      for (const student of updated.students) {
        if (student.id === selectedStudent.id && student.component_id !== null) {
          entries[`${student.id}:${student.component_id}`] = String(student.score);
        }
      }
      setGradeEntries(entries);
      setSelectedStudentId("");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingScores(false);
    }
  };

  const submitResource = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    setUploading(true);
    setError("");
    try {
      await uploadTeacherResource(formData);
      setMessage("Đã tải tài liệu giảng dạy lên thành công.");
      formElement.reset();
      setResources(await fetchTeacherResources());
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  const downloadResource = async (resource) => {
    setError("");
    try {
      await downloadTeacherResource(resource.id, resource.original_name);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl px-5 py-24 text-center text-sm text-stone-500">Đang tải học vụ giáo viên...</div>;
  }

  return (
    <div className="min-h-[760px] bg-[#f3f0e8]">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[245px_1fr]">
        <aside className="h-fit bg-[#1e3a5f] p-5 text-white lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:self-start lg:overflow-y-auto">
          <div className="mb-10 font-mono text-xs">
            ✦ Trường<br />
            &nbsp;&nbsp;&nbsp;học
            <span className="mt-2 block text-[9px] text-[#bdb6dc]">TEACHER CONSOLE</span>
          </div>
          <p className="mb-3 font-mono text-[9px] uppercase text-[#bdb6dc]">Khu vực giáo viên</p>
          <nav className="space-y-1">
            {TABS.map(([key, label]) => (
              <button
                onClick={() => {
                  setTab(key);
                  setError("");
                  setMessage("");
                }}
                className={`block w-full px-3 py-3 text-left text-xs ${
                  tab === key
                    ? "bg-[#ffd75e] text-[#17141f]"
                    : "text-white hover:bg-[#ffd75e] hover:text-[#17141f]"
                }`}
                key={key}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => go("home")}
            className="mt-12 border-t border-white/20 pt-5 text-left font-mono text-[10px] text-[#bdb6dc]"
          >
            ← Về trang chủ
          </button>
        </aside>

        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase text-stone-500">
                Học vụ / Giáo viên
              </p>
              <h1 className="mt-2 font-serif text-5xl tracking-[-.07em]">
                {TABS.find(([key]) => key === tab)?.[1]}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={refreshTeacherData}
                disabled={refreshing}
                className="border border-stone-300 bg-white px-3 py-2 text-[10px] font-mono uppercase tracking-[.18em] text-stone-700 disabled:opacity-60"
              >
                {refreshing ? "Đang tải..." : "Làm mới"}
              </button>
              <div className="bg-white px-4 py-3 text-right">
                <p className="font-mono text-[9px] text-stone-500">ĐANG ĐĂNG NHẬP</p>
                <b className="text-xs">{teacherName || "Giáo viên"}</b>
              </div>
            </div>
          </div>
        {error && <p role="alert" className="mb-5 border-l-2 border-[#e36c55] bg-white px-4 py-3 text-sm text-[#b84e3b]">{error}</p>}
        {message && <p role="status" className="mb-5 border-l-2 border-[#4ecfa6] bg-white px-4 py-3 text-sm text-[#248461]">{message}</p>}

        {tab === "scores" && (
          <div className="space-y-5">
            <div className="grid gap-5 bg-white p-5 sm:grid-cols-3">
              <label className="font-mono text-[10px] uppercase text-stone-500">
                Môn / lớp được phân công
                <select
                  value={assignmentId}
                  onChange={(event) => {
                    setAssignmentId(event.target.value);
                    setSemesterId("");
                    setStudentSearch("");
                    setSelectedStudentId("");
                  }}
                  className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
                >
                  {assignments.map((assignment) => (
                    <option value={assignment.id} key={assignment.id}>
                      {assignment.subject_name} — {assignment.class_name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="font-mono text-[10px] uppercase text-stone-500">
                Năm học
                <p className="mt-2 border-b border-stone-300 py-3 font-sans text-sm text-stone-800">
                  {selectedAssignment?.academic_year_name || "—"}
                </p>
              </div>
              <label className="font-mono text-[10px] uppercase text-stone-500">
                Học kỳ
                <select
                  value={semesterId}
                  onChange={(event) => {
                    setSemesterId(event.target.value);
                    setSelectedStudentId("");
                  }}
                  className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
                >
                  {(gradebook?.semesters || []).map((semester) => (
                    <option value={semester.id} key={semester.id}>
                      {semester.code === "first" ? "Học kỳ I" : "Học kỳ II"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!assignments.length ? (
              <div className="bg-white p-6 text-sm text-stone-600">
                Tài khoản giáo viên chưa có phân công môn/lớp. Vui lòng nhờ quản trị viên thiết lập phân công giảng dạy trước.
              </div>
            ) : gradebookLoading ? (
              <div className="bg-white p-6 text-sm text-stone-500">Đang tải sổ điểm...</div>
            ) : !gradebookData.students.length ? (
              <div className="bg-white p-6 text-sm text-stone-600">
                Lớp {selectedAssignment?.class_name} chưa có danh sách học sinh đang theo học.
              </div>
            ) : (
              <section className="bg-white p-5">
                <div className="mb-5">
                  <h2 className="font-serif text-2xl">Sổ điểm lớp {selectedAssignment?.class_name}</h2>
                  <p className="mt-1 text-xs text-stone-500">
                    Tìm học sinh trong lớp, sau đó chọn tên để nhập hoặc cập nhật điểm.
                  </p>
                </div>
                <label className="block font-mono text-[10px] uppercase text-stone-500">
                  Tìm theo họ tên hoặc mã học sinh
                  <input
                    type="search"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Nhập tên hoặc mã học sinh..."
                    autoComplete="off"
                    className="mt-2 w-full border-b border-stone-300 bg-transparent px-1 py-3 font-sans text-sm outline-none focus:border-[#7562ed]"
                  />
                </label>
                <div className="mt-4 max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
                  {filteredStudents.length ? filteredStudents.map((student) => {
                    const enteredCount = gradebookData.components.filter((component) => (
                      gradeEntries[`${student.id}:${component.id}`] !== undefined
                      && gradeEntries[`${student.id}:${component.id}`] !== ""
                    )).length;
                    let weightedSum = 0;
                    let totalWeight = 0;
                    for (const component of gradebookData.components) {
                      const value = gradeEntries[`${student.id}:${component.id}`] ?? "";
                      if (value !== "" && Number.isFinite(Number(value))) {
                        const weight = Number(component.weight);
                        weightedSum += Number(value) * weight;
                        totalWeight += weight;
                      }
                    }
                    const average = totalWeight ? (weightedSum / totalWeight).toFixed(2) : "—";
                    return (
                      <button
                        type="button"
                        key={student.id}
                        onClick={() => {
                          setError("");
                          setMessage("");
                          setSelectedStudentId(student.id);
                        }}
                        className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-4 text-left hover:bg-[#f8f5ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7562ed]"
                      >
                        <span>
                          <b className="block text-sm">{student.last_name} {student.first_name}</b>
                          <span className="mt-1 block font-mono text-[10px] text-stone-500">{student.student_code}</span>
                        </span>
                        <span className="font-mono text-[10px] text-stone-500">
                          Điểm TB: {average} · {enteredCount}/{gradebookData.components.length} cột điểm
                          <span className="ml-3 text-[#7562ed]">Chọn học sinh →</span>
                        </span>
                      </button>
                    );
                  }) : (
                    <p className="py-6 text-sm text-stone-500">
                      Không tìm thấy học sinh khớp với nội dung tìm kiếm.
                    </p>
                  )}
                </div>
              </section>
            )}

            {selectedStudent && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onMouseDown={(event) => {
                  if (!savingScores && event.target === event.currentTarget) setSelectedStudentId("");
                }}
              >
                <form
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="student-score-form-title"
                  onSubmit={submitScores}
                  className="max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase text-stone-500">
                        {selectedAssignment?.subject_name} · {selectedAssignment?.class_name}
                      </p>
                      <h2 id="student-score-form-title" className="mt-2 font-serif text-3xl">
                        Nhập điểm học sinh
                      </h2>
                      <p className="mt-2 text-sm font-semibold">
                        {selectedStudent.last_name} {selectedStudent.first_name}
                        <span className="ml-2 font-mono text-xs font-normal text-stone-500">
                          {selectedStudent.student_code}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {semesterId && (gradebook?.semesters || []).find((semester) => semester.id === semesterId)?.code === "first"
                          ? "Học kỳ I"
                          : "Học kỳ II"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={savingScores}
                      onClick={() => setSelectedStudentId("")}
                      aria-label="Đóng biểu mẫu nhập điểm"
                      className="px-2 py-1 text-xl text-stone-500 hover:text-stone-900"
                    >
                      ×
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="mt-5 border-l-2 border-[#e36c55] bg-[#fff7f5] px-4 py-3 text-sm text-[#b84e3b]">
                      {error}
                    </p>
                  )}
                  <div className="mt-6 space-y-3">
                    {gradebookData.components.map((component) => (
                      <label className="flex items-center justify-between gap-4 border-b border-stone-100 py-3" key={component.id}>
                        <span>
                          <span className="block text-sm font-semibold">{component.name}</span>
                          <span className="mt-1 block text-xs text-stone-500">Hệ số {Number(component.weight)}</span>
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.01"
                          aria-label={`${component.name} - ${selectedStudent.first_name} ${selectedStudent.last_name}`}
                          value={gradeEntries[`${selectedStudent.id}:${component.id}`] ?? ""}
                          disabled={savingScores}
                          onChange={(event) => {
                            changeScore(selectedStudent.id, component.id, event.target.value);
                            setError("");
                          }}
                          className="w-28 border-b border-stone-300 bg-transparent px-2 py-2 text-right text-sm outline-none focus:border-[#7562ed]"
                        />
                      </label>
                    ))}
                    {!gradebookData.components.length && (
                      <p className="text-sm text-stone-500">Chưa có cột điểm để nhập.</p>
                    )}
                  </div>
                  <div className="mt-7 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      disabled={savingScores}
                      onClick={() => setSelectedStudentId("")}
                      className="border border-stone-300 px-5 py-3 text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={savingScores || !gradebookData.components.length}
                      className="bg-[#17141f] px-5 py-3 text-xs text-white disabled:opacity-60"
                    >
                      {savingScores ? "Đang lưu..." : "Lưu điểm ↗"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {tab === "resources" && (
          <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
            <form onSubmit={submitResource} className="bg-white p-6">
              <h2 className="font-serif text-2xl">Đăng tài liệu giảng dạy</h2>
              <label className="mt-6 block font-mono text-[10px] uppercase text-stone-500">
                Môn / lớp
                <select name="assignmentId" required defaultValue="" className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm">
                  <option value="" disabled>Chọn lớp và môn</option>
                  {assignments.map((assignment) => (
                    <option value={assignment.id} key={assignment.id}>
                      {assignment.subject_name} — {assignment.class_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-5 block font-mono text-[10px] uppercase text-stone-500">
                Tiêu đề
                <input name="title" required maxLength="300" className="mt-2 w-full border-b border-stone-300 py-3 font-sans text-sm" />
              </label>
              <label className="mt-5 block font-mono text-[10px] uppercase text-stone-500">
                Mô tả
                <textarea name="description" className="mt-2 h-20 w-full border border-stone-300 p-3 font-sans text-sm" />
              </label>
              <label className="mt-5 block font-mono text-[10px] uppercase text-stone-500">
                Tệp (PDF, Word, PowerPoint, Excel, TXT, JPG, PNG; tối đa 25 MB)
                <input name="file" type="file" required accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png" className="mt-3 block w-full text-xs" />
              </label>
              <button disabled={!assignments.length || uploading} className="mt-6 bg-[#17141f] px-5 py-3 text-xs text-white disabled:opacity-50">
                {uploading ? "Đang tải lên..." : "Tải tài liệu lên ↗"}
              </button>
              {!assignments.length && <p className="mt-3 text-xs text-[#b84e3b]">Cần có phân công môn/lớp trước khi đăng tài liệu.</p>}
            </form>
            <div className="space-y-3">
              <h2 className="font-serif text-2xl">Tài liệu đã đăng</h2>
              {resources.length ? resources.map((resource) => (
                <article className="flex flex-wrap items-center justify-between gap-4 bg-white p-5" key={resource.id}>
                  <div>
                    <p className="font-mono text-[9px] uppercase text-[#7562ed]">
                      {resource.subject_name || "Môn học"} · {resource.class_name || "Lớp học"}
                    </p>
                    <h3 className="mt-1 font-serif text-xl">{resource.title}</h3>
                    <p className="mt-1 text-xs text-stone-500">
                      {resource.original_name} · {formatSize(Number(resource.file_size))}
                    </p>
                  </div>
                  <button onClick={() => downloadResource(resource)} className="border border-stone-300 px-3 py-2 text-[10px]">
                    Tải xuống
                  </button>
                </article>
              )) : (
                <div className="bg-white p-6 text-sm text-stone-500">Chưa có tài liệu giảng dạy nào.</div>
              )}
            </div>
          </div>
        )}

        {tab === "schedule" && (
          <div className="overflow-x-auto bg-white p-6">
            <h2 className="font-serif text-2xl">Thời khóa biểu giảng dạy</h2>
            {schedule.length ? (
              <table className="mt-5 w-full min-w-[700px] text-left text-xs">
                <thead className="bg-[#a9f2cf] font-mono text-[10px]">
                  <tr>
                    <th className="p-3">Ngày</th><th className="p-3">Tiết</th>
                    <th className="p-3">Giờ</th><th className="p-3">Môn học</th>
                    <th className="p-3">Lớp</th><th className="p-3">Phòng</th>
                    <th className="p-3">Học kỳ</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((entry) => (
                    <tr className="border-b border-stone-100" key={entry.id}>
                      <td className="p-3">{DAYS[entry.day_of_week]}</td>
                      <td className="p-3">{entry.period_number}</td>
                      <td className="p-3">{String(entry.starts_at).slice(0, 5)}–{String(entry.ends_at).slice(0, 5)}</td>
                      <td className="p-3 font-semibold">{entry.subject_name}</td>
                      <td className="p-3">{entry.class_name}</td>
                      <td className="p-3">{entry.room_name || entry.room_code || "—"}</td>
                      <td className="p-3">{entry.semester === "first" ? "Học kỳ I" : "Học kỳ II"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-5 text-sm text-stone-500">Chưa có thời khóa biểu nào được phân công cho giáo viên.</p>
            )}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

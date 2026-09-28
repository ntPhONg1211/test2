import { useEffect, useState } from "react";
import {
  createTeachingAssignment,
  fetchTeachingAssignmentsAdmin,
} from "../../services/api";

const EMPTY_DATA = {
  assignments: [],
  teachers: [],
  classes: [],
  subjects: [],
  academicYears: [],
};

export default function TeachingAssignmentsManager({ onMessage }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchTeachingAssignmentsAdmin());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError("");
    try {
      await createTeachingAssignment({
        teacherId: form.get("teacherId"),
        classId: form.get("classId"),
        subjectId: Number(form.get("subjectId")),
        academicYearId: form.get("academicYearId"),
      });
      onMessage("Đã phân công giáo viên giảng dạy.");
      formElement.reset();
      setAcademicYearId("");
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="border-l-2 border-[#e36c55] bg-white px-4 py-3 text-sm text-[#b84e3b]">{error}</p>}
      <form onSubmit={submit} className="grid gap-5 bg-white p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="font-serif text-2xl">Phân công giảng dạy</h2>
          <p className="mt-2 text-sm text-stone-600">
            Chỉ tài khoản giáo viên đang hoạt động mới xuất hiện trong danh sách.
            Tạo tài khoản giáo viên tại mục “Tạo tài khoản” trước khi phân công.
          </p>
        </div>
        <label className="font-mono text-[10px] uppercase text-stone-500">
          Giáo viên
          <select name="teacherId" required defaultValue="" className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm">
            <option value="" disabled>Chọn giáo viên</option>
            {data.teachers.map((teacher) => (
              <option value={teacher.id} key={teacher.id}>{teacher.full_name}</option>
            ))}
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase text-stone-500">
          Năm học
          <select
            name="academicYearId"
            required
            value={academicYearId}
            onChange={(event) => setAcademicYearId(event.target.value)}
            className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
          >
            <option value="" disabled>Chọn năm học</option>
            {data.academicYears.map((year) => (
              <option value={year.id} key={year.id}>{year.name}</option>
            ))}
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase text-stone-500">
          Lớp
          <select name="classId" required defaultValue="" className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm">
            <option value="" disabled>Chọn lớp</option>
            {data.classes
              .filter((schoolClass) => !academicYearId || schoolClass.academic_year_id === academicYearId)
              .map((schoolClass) => (
              <option value={schoolClass.id} key={schoolClass.id}>
                {schoolClass.name} — {schoolClass.academic_year_name}
              </option>
              ))}
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase text-stone-500">
          Môn học
          <select name="subjectId" required defaultValue="" className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm">
            <option value="" disabled>Chọn môn học</option>
            {data.subjects.map((subject) => (
              <option value={subject.id} key={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
        <button
          disabled={saving || !data.teachers.length || !data.classes.length || !data.subjects.length}
          className="justify-self-start bg-[#17141f] px-5 py-3 text-xs text-white disabled:opacity-50 md:col-span-2"
        >
          {saving ? "Đang lưu..." : "Tạo phân công ↗"}
        </button>
      </form>

      <div className="overflow-x-auto bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-2xl">Các phân công hiện có</h2>
          <button onClick={load} className="font-mono text-[10px] text-[#7562ed]">Làm mới</button>
        </div>
        {loading ? (
          <p className="mt-5 text-sm text-stone-500">Đang tải phân công...</p>
        ) : data.assignments.length ? (
          <table className="mt-5 w-full min-w-[600px] text-left text-xs">
            <thead className="bg-[#a9f2cf] font-mono text-[10px]">
              <tr>
                <th className="p-3">Giáo viên</th><th className="p-3">Môn học</th>
                <th className="p-3">Lớp</th><th className="p-3">Năm học</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments.map((assignment) => (
                <tr className="border-b border-stone-100" key={assignment.id}>
                  <td className="p-3">{assignment.teacher_name}</td>
                  <td className="p-3">{assignment.subject_name}</td>
                  <td className="p-3">{assignment.class_name}</td>
                  <td className="p-3">{assignment.academic_year_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-5 text-sm text-stone-500">Chưa có phân công nào.</p>
        )}
      </div>
    </div>
  );
}

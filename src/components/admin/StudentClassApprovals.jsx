import { useEffect, useState } from "react";
import {
  decideStudentClassRequest,
  fetchStudentClassRequests,
} from "../../services/api";

const STATUS_LABELS = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

const getClassFilterKey = (request) => `${request.academic_year_name || "—"}|${request.requested_class_name || "—"}`;

export default function StudentClassApprovals({ type, onMessage }) {
  const [status, setStatus] = useState("pending");
  const [selectedAcademicYearName, setSelectedAcademicYearName] = useState("");
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const title = type === "transfer" ? "Duyệt yêu cầu chuyển lớp" : "Duyệt yêu cầu vào lớp";

  const academicYearOptions = Array.from(
    new Map(
      requests
        .filter((request) => request.academic_year_name)
        .map((request) => [request.academic_year_name, { name: request.academic_year_name }]),
    ).values(),
  );

  const classOptions = Array.from(
    new Map(
      requests
        .filter((request) => request.requested_class_name && (!selectedAcademicYearName || request.academic_year_name === selectedAcademicYearName))
        .map((request) => [getClassFilterKey(request), {
          key: getClassFilterKey(request),
          name: request.requested_class_name,
          academicYear: request.academic_year_name,
        }]),
    ).values(),
  );

  const visibleRequests = requests.filter((request) => {
    if (selectedAcademicYearName && request.academic_year_name !== selectedAcademicYearName) {
      return false;
    }
    if (selectedClassKey && getClassFilterKey(request) !== selectedClassKey) {
      return false;
    }
    return true;
  });

  const pendingInSelectedClass = visibleRequests.filter((request) => request.status === "pending").length;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const nextRequests = await fetchStudentClassRequests({ type, status: status || undefined });
      setRequests(nextRequests);
      setSelectedAcademicYearName((current) => {
        if (!current) return current;
        return nextRequests.some((request) => request.academic_year_name === current) ? current : "";
      });
      setSelectedClassKey((current) => {
        if (!current) return current;
        return nextRequests.some((request) => getClassFilterKey(request) === current) ? current : "";
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [type, status]);

  const decide = async (request, decision) => {
    const note = decision === "rejected"
      ? window.prompt("Lý do từ chối (không bắt buộc):") || ""
      : "";
    try {
      await decideStudentClassRequest(request.id, decision, note);
      onMessage(
        decision === "approved"
          ? `Đã duyệt yêu cầu cho học sinh ${request.student_code}.`
          : `Đã từ chối yêu cầu của học sinh ${request.student_code}.`
      );
      await load();
    } catch (decisionError) {
      setError(decisionError.message);
    }
  };

  const bulkApproveSelectedClass = async () => {
    const selectedClassName = classOptions.find((option) => option.key === selectedClassKey)?.name || "lớp được chọn";
    const pendingRequests = visibleRequests.filter((request) => request.status === "pending");
    if (!pendingRequests.length) {
      setError("Không còn yêu cầu chờ duyệt nào trong bộ lọc này.");
      return;
    }
    if (!window.confirm(`Đồng ý ${pendingRequests.length} yêu cầu đang chờ trong ${selectedClassName}?`)) {
      return;
    }
    try {
      for (const request of pendingRequests) {
        await decideStudentClassRequest(request.id, "approved", "");
      }
      onMessage(`Đã đồng ý ${pendingRequests.length} yêu cầu trong ${selectedClassName}.`);
      await load();
    } catch (decisionError) {
      setError(decisionError.message);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="border-l-2 border-[#e36c55] bg-white px-4 py-3 text-sm text-[#b84e3b]">
          {error}
        </p>
      )}
      <div className="bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase text-stone-500">Ban giám hiệu</p>
            <h2 className="mt-2 font-serif text-3xl">{title}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="font-mono text-[10px] uppercase text-stone-500">
              Phân loại trạng thái
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-2 block min-w-40 border-b border-stone-300 bg-transparent py-2 font-sans text-sm"
              >
                <option value="pending">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Đã từ chối</option>
                <option value="">Tất cả</option>
              </select>
            </label>
            <label className="font-mono text-[10px] uppercase text-stone-500">
              Lọc theo năm học
              <select
                value={selectedAcademicYearName}
                onChange={(event) => {
                  setSelectedAcademicYearName(event.target.value);
                  setSelectedClassKey("");
                }}
                className="mt-2 block min-w-40 border-b border-stone-300 bg-transparent py-2 font-sans text-sm"
              >
                <option value="">Tất cả năm học</option>
                {academicYearOptions.map((option) => (
                  <option value={option.name} key={option.name}>{option.name}</option>
                ))}
              </select>
            </label>
            <label className="font-mono text-[10px] uppercase text-stone-500">
              Lọc theo lớp
              <select
                value={selectedClassKey}
                onChange={(event) => setSelectedClassKey(event.target.value)}
                className="mt-2 block min-w-48 border-b border-stone-300 bg-transparent py-2 font-sans text-sm"
              >
                <option value="">Tất cả lớp</option>
                {classOptions.map((option) => (
                  <option value={option.key} key={option.key}>{option.academicYear} · {option.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-600">
          Khi duyệt, hệ thống xếp học sinh vào lớp mới; yêu cầu chuyển lớp sẽ kết thúc ghi danh ở lớp cũ. Sĩ số tối đa của lớp được kiểm tra trước khi cập nhật.
        </p>
        {selectedClassKey && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-[#a9f2cf] bg-[#f3fff8] p-3">
            <p className="text-sm text-stone-700">
              {selectedClassNameText()} · <span className="font-semibold">{pendingInSelectedClass}</span> yêu cầu chờ duyệt
            </p>
            <button
              type="button"
              onClick={bulkApproveSelectedClass}
              disabled={pendingInSelectedClass === 0}
              className="bg-[#4ecfa6] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Đồng ý theo lớp
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto bg-white p-6">
        {loading ? (
          <p className="text-sm text-stone-500">Đang tải yêu cầu...</p>
        ) : visibleRequests.length ? (
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-[#a9f2cf] font-mono text-[10px]">
              <tr>
                <th className="p-3">Học sinh</th>
                {type === "transfer" && <th className="p-3">Lớp hiện tại</th>}
                <th className="p-3">Lớp yêu cầu</th>
                <th className="p-3">Năm học</th>
                <th className="p-3">Người gửi</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visibleRequests.map((request) => (
                <tr className="border-b border-stone-100" key={request.id}>
                  <td className="p-3">
                    <b>{request.last_name} {request.first_name}</b><br />
                    <span className="text-stone-500">{request.student_code}</span>
                  </td>
                  {type === "transfer" && <td className="p-3">{request.current_class_name || "—"}</td>}
                  <td className="p-3">{request.requested_class_name}</td>
                  <td className="p-3">{request.academic_year_name}</td>
                  <td className="p-3">{request.requested_by_name}</td>
                  <td className="p-3">
                    {STATUS_LABELS[request.status]}
                    {request.decision_note && <p className="mt-1 text-stone-500">{request.decision_note}</p>}
                  </td>
                  <td className="p-3">
                    {request.status === "pending" ? (
                      <div className="flex gap-2">
                        <button onClick={() => decide(request, "approved")} className="bg-[#4ecfa6] px-3 py-2 text-[10px]">
                          Đồng ý
                        </button>
                        <button onClick={() => decide(request, "rejected")} className="bg-[#f6a2bd] px-3 py-2 text-[10px]">
                          Từ chối
                        </button>
                      </div>
                    ) : request.decided_by_name ? (
                      <span className="text-stone-500">{request.decided_by_name}</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-stone-500">Không có yêu cầu thuộc trạng thái này.</p>
        )}
      </div>
    </div>
  );

  function selectedClassNameText() {
    return classOptions.find((option) => option.key === selectedClassKey)?.name || "Lớp đã chọn";
  }
}

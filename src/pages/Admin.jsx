import { useEffect, useState } from "react";
import ContentManager from "../components/admin/ContentManager";
import SchoolPagesManager from "../components/admin/SchoolPagesManager";
import StudentClassApprovals from "../components/admin/StudentClassApprovals";
import StudentsManager from "../components/admin/StudentsManager";
import TeachingAssignmentsManager from "../components/admin/TeachingAssignmentsManager";
import {
  fetchAdminContactMessages,
  fetchAdminContactMessage,
  fetchAdminStudents,
  fetchClasses,
  fetchUsers,
  sendAdminContactReply,
} from "../services/api";
import { go } from "../utils/navigation";

const CONTACTS_PER_PAGE = 5;

export default function Admin({ initialTab = "contents" }) {
  const [authState, setAuthState] = useState("checking");
  const [userRole, setUserRole] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [message, setMessage] = useState("");
  const [newCredentials, setNewCredentials] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [contactMessages, setContactMessages] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactPage, setContactPage] = useState(0);
  const [contactDetail, setContactDetail] = useState(null);
  const [contactDetailLoading, setContactDetailLoading] = useState(false);
  const [contactReplyMessage, setContactReplyMessage] = useState("");
  const [contactReplyError, setContactReplyError] = useState("");
  const [contactReplyNotice, setContactReplyNotice] = useState("");
  const [sendingContactReply, setSendingContactReply] = useState(false);
  const [classData, setClassData] = useState({ classes: [], academicYears: [], grades: [] });
  const [singleAccountRole, setSingleAccountRole] = useState("teacher");
  const [singleAccountAcademicYear, setSingleAccountAcademicYear] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const contactPageCount = Math.ceil(contactMessages.length / CONTACTS_PER_PAGE);
  const currentContactPage = Math.min(contactPage, Math.max(0, contactPageCount - 1));
  const paginatedContactMessages = contactMessages.slice(
    currentContactPage * CONTACTS_PER_PAGE,
    (currentContactPage + 1) * CONTACTS_PER_PAGE,
  );

  useEffect(() => {
    setContactPage((currentPage) => Math.min(
      currentPage,
      Math.max(0, Math.ceil(contactMessages.length / CONTACTS_PER_PAGE) - 1),
    ));
  }, [contactMessages.length]);

  const getAuthHeaders = (json = false) => {
    const token = localStorage.getItem("token");
    if (!token) {
      localStorage.removeItem("token");
      go("login");
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
    };
  };

  const currentAcademicYear = classData.academicYears?.find((year) => year.is_current) ?? classData.academicYears?.[0] ?? null;
  const ensureAcademicYearSelection = (nextAcademicYears = classData.academicYears) => {
    if (!nextAcademicYears?.length) return;
    const preferred = nextAcademicYears.find((year) => year.is_current) ?? nextAcademicYears[0];
    if (!preferred) return;
    setSingleAccountAcademicYear((current) => current || preferred.name);
  };

  useEffect(() => {
    if (classData.academicYears.length) {
      ensureAcademicYearSelection(classData.academicYears);
    }
  }, [classData.academicYears]);

  const refreshAdminData = async () => {
    setRefreshing(true);
    setMessage("");
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        localStorage.removeItem("token");
        go("login");
        return;
      }
      const [nextApplicants, nextAccountRequests, nextCampaigns, nextClasses] = await Promise.all([
        fetch("/api/admin/admission-applicants", { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Không thể tải danh sách tuyển sinh"))).catch((error) => { throw error; }),
        fetch("/api/admin/account-requests", { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Không thể tải yêu cầu tài khoản"))).catch((error) => { throw error; }),
        fetch("/api/admin/admission-campaigns", { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : []).catch(() => []),
        fetch("/api/admin/classes", { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Không thể tải danh sách lớp"))).catch((error) => { throw error; }),
      ]);
      setApplicants(nextApplicants);
      setAccountRequests(nextAccountRequests);
      setCampaigns(nextCampaigns);
      setClassData(nextClasses);
      if (userRole === "admin") setContactMessages(await fetchAdminContactMessages());
      setMessage("Đã làm mới dữ liệu quản trị.");
    } catch (error) {
      setMessage(error.message || "Không thể làm mới dữ liệu.");
    } finally {
      setRefreshing(false);
    }
  };

  const [applicants, setApplicants] = useState([]);
  const [accountRequests, setAccountRequests] = useState([]);
  const [approvedCredentials, setApprovedCredentials] = useState(null);
  const tabs = userRole === "principal"
    ? [
        ["admission-applicants", "Danh sách tuyển sinh"],
        ["student-enrollment-approvals", "Duyệt vào lớp"],
        ["student-transfer-approvals", "Duyệt chuyển lớp"],
        ["account-approvals", "Phê duyệt tài khoản"],
      ]
    : [
        ["dashboard", "Tổng quan"],
        ["contents", "Nội dung"],
        ["admissions", "Tuyển sinh"],
        ["pages", "Trang giới thiệu"],
        ["classes", "Lớp & giáo viên"],
        ["students", "Danh sách học sinh"],
        ["teaching-assignments", "Phân công giảng dạy"],
        ["schedule", "Thời khóa biểu"],
        ["contacts", "Liên hệ"],
        ["accounts", "Tạo tài khoản"],
        ["users", "Tài khoản & BGH"],
      ];
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      go("login");
      return;
    }
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Phiên đăng nhập không hợp lệ");
        return response.json();
      })
      .then(({ user }) => {
        if (!["admin", "principal"].includes(user.role)) throw new Error("Tài khoản không có quyền truy cập");
        setUserRole(user.role);
        fetch("/api/admin/admission-applicants", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("Không thể tải danh sách tuyển sinh")))
          .then(setApplicants)
          .catch((error) => setMessage(error.message));
        fetch("/api/admin/account-requests", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("Không thể tải yêu cầu tài khoản")))
          .then(setAccountRequests)
          .catch((error) => setMessage(error.message));
        if (user.role !== "admin") {
          setTab("admission-applicants");
          setAuthState("authorized");
          return;
        }
        setAuthState("authorized");
        fetch("/api/admin/admission-campaigns", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
          .then((response) => response.ok ? response.json() : [])
          .then(setCampaigns)
          .catch(() => setMessage("Không thể tải cấu hình tuyển sinh."));
        fetch("/api/admin/classes", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("Không thể tải danh sách lớp")))
          .then(setClassData)
          .catch((error) => setMessage(error.message));
      })
      .catch(() => {
        localStorage.removeItem("token");
        go("login");
      });
  }, []);

  useEffect(() => {
    if (tab !== "contacts" || userRole !== "admin") return undefined;
    let active = true;
    setContactsLoading(true);
    fetchAdminContactMessages()
      .then((messages) => {
        if (active) setContactMessages(messages);
      })
      .catch((error) => {
        if (active) setMessage(error.message || "Không thể tải danh sách liên hệ.");
      })
      .finally(() => {
        if (active) setContactsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, userRole]);

  const createClass = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ academicYearId: form.get("academicYearId"), gradeId: Number(form.get("gradeId")), code: form.get("code"), name: form.get("name"), capacity: form.get("capacity") || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể tạo lớp");
      const year = classData.academicYears.find((item) => item.id === data.academic_year_id);
      const grade = classData.grades.find((item) => item.id === data.grade_id);
      setClassData((current) => ({ ...current, classes: [{ ...data, academic_year_name: year?.name, grade_name: grade?.name }, ...current.classes] }));
      event.currentTarget.reset();
      setMessage("Đã tạo lớp và lưu vào database.");
    } catch (error) { setMessage(error.message); }
  };
  const requestAccount = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/admin/account-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          action: "create",
          payload: {
            username: form.get("username"),
            fullName: form.get("fullName"),
            email: form.get("email"),
            phone: form.get("phone"),
            role: form.get("role"),
            academicYearName: form.get("academicYearName"),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể tạo yêu cầu tài khoản");
      formElement.reset();
      setSingleAccountRole("teacher");
      setSingleAccountAcademicYear("");
      setNewCredentials(null);
      setMessage(`Đã gửi yêu cầu tạo tài khoản ${data.payload.fullName} chờ Ban giám hiệu phê duyệt.`);
    } catch (error) { setMessage(error.message); }
  };
  const decideAccountRequest = async (request, status) => {
    try {
      const response = await fetch(`/api/admin/account-requests/${request.id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể xử lý yêu cầu");
      setAccountRequests((current) => current.map((item) => item.id === request.id ? { ...item, ...data.request } : item));
      setMessage(status === "approved" ? "Đã phê duyệt yêu cầu. Admin cần bấm Tạo tài khoản để sinh thông tin đăng nhập." : "Đã từ chối yêu cầu tạo tài khoản.");
    } catch (error) { setMessage(error.message); }
  };
 const createApprovedAccount = async (request) => {
  try {
    const token = localStorage.getItem("token");

    if (!token) {
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }

    const response = await fetch(
      `/api/admin/account-requests/${request.id}/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (response.status === 401) {
      localStorage.removeItem("token");
      throw new Error(
        data.message || "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."
      );
    }

    if (response.status === 403) {
      throw new Error(
        data.message || "Tài khoản không có quyền tạo tài khoản."
      );
    }

    if (!response.ok) {
      throw new Error(
        data.message || "Không thể tạo tài khoản"
      );
    }

    setAccountRequests((current) =>
      current.map((item) =>
        item.id === request.id
          ? {
              ...item,
              target_user_id: data.user.id,
            }
          : item
      )
    );

    setNewCredentials({
      ...request.payload,
      password: data.temporaryPassword,
    });

    setMessage(
      `Đã tạo tài khoản ${data.user.username}. Hãy sao chép mật khẩu tạm thời.`
    );
  } catch (error) {
    setMessage(
      error.message || "Không thể tạo tài khoản."
    );
  }
};
  const updateCampaign = async (event, campaign) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/admission-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          opensAt: form.get("opensAt"),
          closesAt: form.get("closesAt"),
          appointmentStartDate: form.get("appointmentStartDate"),
          dailyQueueLimit: Number(form.get("dailyQueueLimit")),
          isOpen: form.get("isOpen") === "on",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể cập nhật tuyển sinh");
      setCampaigns((current) => current.map((item) => item.id === data.id ? data : item));
      setMessage(data.is_open ? "Đã mở tuyển sinh và lưu lịch hẹn." : "Đã tắt tuyển sinh.");
    } catch (error) { setMessage(error.message); }
  };
  const renderAdmissions = () => <div className="space-y-5"><div className="bg-[#a9f2cf] p-6"><h2 className="font-serif text-2xl">Điều hành tuyển sinh</h2><p className="mt-2 max-w-2xl text-sm leading-6">Chỉ hồ sơ trong đợt đang bật và còn thời gian nhận mới được tiếp nhận. Mỗi ngày được xếp tối đa theo giới hạn.</p></div>{campaigns.length === 0 ? <div className="bg-white p-6 text-sm text-stone-500">Chưa có đợt tuyển sinh để cấu hình.</div> : campaigns.map((campaign) => <form onSubmit={(event) => updateCampaign(event, campaign)} className="bg-white p-6" key={campaign.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase text-[#7562ed]">{campaign.slug}</p><h3 className="mt-1 font-serif text-2xl">{campaign.name}</h3></div><label className="flex items-center gap-2 text-sm font-semibold"><input name="isOpen" type="checkbox" defaultChecked={campaign.is_open} className="accent-[#7562ed]" /> Cho phép nộp hồ sơ</label></div><div className="mt-6 grid gap-5 md:grid-cols-4"><label className="font-mono text-[10px]">Mở nhận hồ sơ<input name="opensAt" type="datetime-local" required defaultValue={campaign.opens_at ? campaign.opens_at.slice(0, 16) : ""} className="mt-2 w-full border-b border-stone-300 py-3 font-sans text-sm" /></label><label className="font-mono text-[10px]">Đóng nhận hồ sơ<input name="closesAt" type="datetime-local" required defaultValue={campaign.closes_at ? campaign.closes_at.slice(0, 16) : ""} className="mt-2 w-full border-b border-stone-300 py-3 font-sans text-sm" /></label><label className="font-mono text-[10px]">Ngày hẹn đầu tiên<input name="appointmentStartDate" type="date" required defaultValue={campaign.appointment_start_date?.slice(0, 10)} className="mt-2 w-full border-b border-stone-300 py-3 font-sans text-sm" /></label><label className="font-mono text-[10px]">Số hồ sơ/ngày<input name="dailyQueueLimit" type="number" min="1" required defaultValue={campaign.daily_queue_limit || 200} className="mt-2 w-full border-b border-stone-300 py-3 font-sans text-sm" /></label></div><button className="mt-6 bg-[#17141f] px-5 py-3 text-xs text-white">Lưu cấu hình tuyển sinh ↗</button></form>)}</div>;
  const renderApplicants = () => <div className="overflow-x-auto bg-white p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase text-stone-500">Ban giám hiệu</p><h2 className="font-serif text-3xl">Danh sách hồ sơ tuyển sinh</h2></div><span className="bg-[#a9f2cf] px-3 py-2 text-xs font-semibold">{applicants.length} hồ sơ</span></div><table className="mt-7 w-full min-w-[1100px] text-left text-xs"><thead className="bg-[#a9f2cf] font-mono text-[10px]"><tr><th className="p-3">Mã hồ sơ</th><th className="p-3">Học sinh</th><th className="p-3">Ngày sinh</th><th className="p-3">Khối</th><th className="p-3">Phụ huynh</th><th className="p-3">Liên hệ</th><th className="p-3">Ngày hẹn</th><th className="p-3">Số thứ tự</th><th className="p-3">Trạng thái</th></tr></thead><tbody>{applicants.map((item) => <tr className="border-b border-stone-100" key={item.id}><td className="p-3 font-semibold">{item.applicant_code}</td><td className="p-3"><b>{item.first_name} {item.last_name}</b><br /><span className="text-stone-500">{item.gender || "—"}</span></td><td className="p-3">{new Date(`${item.date_of_birth}T00:00:00`).toLocaleDateString("vi-VN")}</td><td className="p-3">{item.desired_grade_name || "—"}</td><td className="p-3">{item.parent_name}</td><td className="p-3">{item.parent_phone}<br />{item.parent_email || ""}</td><td className="p-3">{item.appointment_date ? new Date(`${item.appointment_date}T00:00:00`).toLocaleDateString("vi-VN") : "—"}</td><td className="p-3 font-serif text-xl text-[#7562ed]">{item.queue_number || "—"}</td><td className="p-3">{item.status}</td></tr>)}</tbody></table>{!applicants.length && <p className="mt-6 text-sm text-stone-500">Chưa có hồ sơ tuyển sinh.</p>}</div>;
  const renderAccountApprovals = () => <div className="space-y-5">{newCredentials && <div className="border-2 border-[#4ecfa6] bg-[#effcf5] p-6"><p className="font-mono text-[10px] uppercase text-[#176b4f]">Mật khẩu tạm thời — chỉ hiển thị lần này</p><h2 className="mt-2 font-serif text-2xl">Đã tạo tài khoản {newCredentials.fullName}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><p className="font-mono text-[10px] text-stone-500">TÀI KHOẢN</p><p className="mt-1 select-all bg-white px-3 py-3 font-mono text-sm">{newCredentials.username}</p></div><div><p className="font-mono text-[10px] text-stone-500">MẬT KHẨU</p><p className="mt-1 select-all bg-white px-3 py-3 font-mono text-sm">{newCredentials.password}</p></div></div><p className="mt-4 text-xs text-[#176b4f]">Sao chép và gửi bảo mật cho nhân sự. Mật khẩu chỉ hiển thị một lần.</p></div>}<div className="bg-white p-6"><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase text-stone-500">Tài khoản & BGH</p><h2 className="font-serif text-3xl">Yêu cầu tài khoản</h2></div><span className="bg-[#ffd75e] px-3 py-2 text-xs font-semibold">{accountRequests.filter((item) => item.status === "pending").length} chờ duyệt</span></div><div className="mt-6 space-y-3">{accountRequests.map((request) => <article className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 py-5" key={request.id}><div><p className="font-mono text-[9px] text-[#7562ed]">{request.action} · {request.status}</p><h3 className="mt-1 font-serif text-xl">{request.payload?.fullName}</h3><p className="mt-1 text-xs text-stone-500">Tài khoản: {request.payload?.username} · Vai trò: {request.payload?.role}</p><p className="text-xs text-stone-500">Yêu cầu bởi: {request.requester_name || "Admin"}</p></div>{userRole === "principal" && request.status === "pending" && <div className="flex gap-2"><button onClick={() => decideAccountRequest(request, "approved")} className="bg-[#4ecfa6] px-4 py-2 text-[10px]">Phê duyệt</button><button onClick={() => decideAccountRequest(request, "rejected")} className="bg-[#f6a2bd] px-4 py-2 text-[10px]">Từ chối</button></div>}{userRole === "admin" && request.status === "approved" && !request.target_user_id && <button onClick={() => createApprovedAccount(request)} className="bg-[#7562ed] px-4 py-2 text-[10px] text-white">Tạo tài khoản</button>}{request.target_user_id && <span className="bg-[#a9f2cf] px-3 py-2 text-[10px]">Đã tạo tài khoản</span>}</article>)}</div>{!accountRequests.length && <p className="mt-6 text-sm text-stone-500">Chưa có yêu cầu tài khoản.</p>}</div></div>;
  const OverviewDashboard = () => {
    const [overview, setOverview] = useState({ students: [], teachers: [], classes: [], academicYears: [], selectedYear: "" });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let active = true;
      const loadOverview = async () => {
        try {
          const [students, users, classData] = await Promise.all([
            fetchAdminStudents(),
            fetchUsers(),
            fetchClasses(),
          ]);
          if (!active) return;
          const academicYears = classData.academicYears || [];
          const teacherCount = (users || []).filter((user) => user.role === "teacher").length;
          const classCount = (classData.classes || []).length;
          setOverview({
            students: students || [],
            teachers: users || [],
            classes: classData.classes || [],
            academicYears,
            selectedYear: academicYears[0]?.name || "",
            teacherCount,
            classCount,
          });
        } catch (error) {
          setMessage(error.message || "Không thể tải tổng quan.");
        } finally {
          if (active) setLoading(false);
        }
      };
      loadOverview();
      return () => {
        active = false;
      };
    }, []);

    const selectedYearName = overview.selectedYear;
    const filteredStudents = selectedYearName
      ? overview.students.filter((student) => student.academic_year_name === selectedYearName)
      : overview.students;
    const totalStudents = filteredStudents.length;
    const totalTeachers = overview.teacherCount || overview.teachers.filter((user) => user.role === "teacher").length;
    const totalClasses = selectedYearName
      ? overview.classes.filter((classItem) => classItem.academic_year_name === selectedYearName).length
      : overview.classCount || overview.classes.length;

    const cards = [
      { label: "Học sinh", value: totalStudents, accent: "bg-[#a9f2cf]" },
      { label: "Giáo viên", value: totalTeachers, accent: "bg-[#dbeafe]" },
      { label: "Lớp hiện có", value: totalClasses, accent: "bg-[#fde68a]" },
    ];

    return (
      <div className="space-y-6">
        <div className="bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase text-stone-500">Tổng quan</p>
              <h2 className="mt-2 font-serif text-3xl">Bảng điều khiển cơ sở</h2>
            </div>
            <label className="font-mono text-[10px] uppercase text-stone-500">
              Lọc theo năm học
              <select
                value={selectedYearName}
                onChange={(event) => setOverview((current) => ({ ...current, selectedYear: event.target.value }))}
                className="mt-2 block min-w-48 border-b border-stone-300 bg-transparent py-2 font-sans text-sm"
              >
                <option value="">Tất cả năm học</option>
                {(overview.academicYears || []).map((year) => (
                  <option value={year.name} key={year.id}>{year.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="bg-white p-8 text-sm text-stone-500">Đang tải dữ liệu tổng quan...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <div key={card.label} className={`${card.accent} p-6 shadow-sm`}>
                <p className="font-mono text-[10px] uppercase text-stone-700">{card.label}</p>
                <p className="mt-4 font-serif text-4xl text-stone-900">{card.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  const renderContent = () => <ContentManager onMessage={setMessage} />;
  const openContactDetails = async (contactId) => {
    setContactDetail(null);
    setContactReplyMessage("");
    setContactReplyError("");
    setContactReplyNotice("");
    setContactDetailLoading(true);
    try {
      setContactDetail(await fetchAdminContactMessage(contactId));
    } catch (error) {
      setMessage(error.message || "Không thể tải chi tiết liên hệ.");
    } finally {
      setContactDetailLoading(false);
    }
  };

  const submitContactReply = async (event) => {
    event.preventDefault();
    if (!contactDetail?.contact || !contactReplyMessage.trim()) {
      setContactReplyError("Vui lòng nhập nội dung phản hồi.");
      return;
    }
    setSendingContactReply(true);
    setContactReplyError("");
    setContactReplyNotice("");
    try {
      const reply = await sendAdminContactReply(contactDetail.contact.id, contactReplyMessage);
      setContactDetail((current) => current
        ? { ...current, replies: [...current.replies, reply] }
        : current);
      setContactMessages((current) => current.map((contact) => (
        contact.id === contactDetail.contact.id
          ? { ...contact, reply_count: Number(contact.reply_count || 0) + 1 }
          : contact
      )));
      setContactReplyMessage("");
      setContactReplyNotice(`Đã gửi phản hồi đến ${contactDetail.contact.sender_email}.`);
    } catch (error) {
      let failureMessage = error.message || "Không thể gửi email phản hồi.";
      try {
        setContactDetail(await fetchAdminContactMessage(contactDetail.contact.id));
      } catch (refreshError) {
        failureMessage += ` Không thể tải lại lịch sử phản hồi: ${refreshError.message}`;
      }
      setContactReplyError(failureMessage);
    } finally {
      setSendingContactReply(false);
    }
  };

  const renderContactMessages = () => (
    <div className="space-y-4">
      <div className="bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-stone-500">Hộp thư nhà trường</p>
            <h2 className="mt-1 font-serif text-3xl">Liên hệ nhận được</h2>
          </div>
          <span className="bg-[#ffd75e] px-3 py-2 text-xs font-semibold">
            {contactMessages.length} liên hệ
          </span>
        </div>
      </div>
      {contactsLoading ? (
        <div className="bg-white p-6 text-sm text-stone-500">Đang tải liên hệ...</div>
      ) : contactMessages.length ? (
        paginatedContactMessages.map((contact) => {
          const hasResponded = Number(contact.reply_count || 0) > 0;
          return (
            <article className="bg-white p-6" key={contact.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] text-stone-500">
                    {contact.sender_name} · {contact.sender_email || "Không cung cấp email"} · {new Date(contact.created_at).toLocaleString("vi-VN")}
                  </p>
                  <h3 className="mt-2 font-serif text-2xl">{contact.subject}</h3>
                </div>
                <span className={`h-fit px-3 py-2 text-xs font-semibold ${hasResponded ? "bg-[#a9f2cf] text-[#17141f]" : "bg-stone-100 text-stone-700"}`}>
                  {hasResponded ? "Đã phản hồi" : "Chưa phản hồi"}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-700">{contact.message}</p>
              <button
                type="button"
                onClick={() => openContactDetails(contact.id)}
                className="mt-5 bg-[#1e3a5f] px-4 py-2 text-xs text-white transition-colors hover:bg-[#ffd75e] hover:text-[#17141f]"
              >
                Xem chi tiết / Phản hồi
              </button>
            </article>
          );
        })
      ) : (
        <div className="bg-white p-6 text-sm text-stone-500">Chưa có liên hệ nào được gửi đến nhà trường.</div>
      )}
      {contactPageCount > 1 && !contactsLoading && (
        <nav className="flex items-center justify-center gap-4 bg-white p-4" aria-label="Phân trang liên hệ">
          <button
            type="button"
            onClick={() => setContactPage(currentContactPage - 1)}
            disabled={currentContactPage === 0}
            className="border border-stone-300 px-4 py-2 text-sm transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Trang trước
          </button>
          <span className="text-sm text-stone-600">
            Trang {currentContactPage + 1} / {contactPageCount}
          </span>
          <button
            type="button"
            onClick={() => setContactPage(currentContactPage + 1)}
            disabled={currentContactPage >= contactPageCount - 1}
            className="border border-stone-300 px-4 py-2 text-sm transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Trang tiếp theo
          </button>
        </nav>
      )}
      {(contactDetailLoading || contactDetail) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sendingContactReply && !contactDetailLoading) {
              setContactDetail(null);
              setContactDetailLoading(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-detail-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl"
          >
            {contactDetailLoading || !contactDetail ? (
              <p className="py-12 text-center text-sm text-stone-500">Đang tải chi tiết liên hệ...</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase text-stone-500">Chi tiết liên hệ</p>
                    <h2 id="contact-detail-title" className="mt-2 font-serif text-3xl">
                      {contactDetail.contact.subject}
                    </h2>
                  </div>
                  <button
                    type="button"
                    disabled={sendingContactReply}
                    onClick={() => setContactDetail(null)}
                    aria-label="Đóng chi tiết liên hệ"
                    className="px-2 py-1 text-xl text-stone-500 hover:text-stone-900 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-5 border-y border-stone-200 py-4 text-sm">
                  <p><b>Người gửi:</b> {contactDetail.contact.sender_name}</p>
                  <p className="mt-1"><b>Email:</b> {contactDetail.contact.sender_email || "Không cung cấp"}</p>
                  <p className="mt-1"><b>Điện thoại:</b> {contactDetail.contact.sender_phone || "Không cung cấp"}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    Gửi lúc {new Date(contactDetail.contact.created_at).toLocaleString("vi-VN")}
                  </p>
                </div>
                <div className="mt-5">
                  <h3 className="font-semibold">Nội dung liên hệ</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                    {contactDetail.contact.message}
                  </p>
                </div>
                <div className="mt-7 border-t border-stone-200 pt-5">
                  <h3 className="font-serif text-2xl">Lịch sử phản hồi</h3>
                  {contactDetail.replies.length ? (
                    <div className="mt-3 space-y-3">
                      {contactDetail.replies.map((reply) => (
                        <article className="border-l-2 border-[#1e3a5f] bg-stone-50 p-4" key={reply.id}>
                          <div className="flex flex-wrap justify-between gap-2 text-xs">
                            <span className="font-semibold">
                              {reply.email_status === "sent"
                                ? "Đã gửi email"
                                : reply.email_status === "failed"
                                  ? "Gửi email thất bại"
                                  : "Đang gửi"}
                            </span>
                            <time className="text-stone-500">
                              {new Date(reply.sent_at || reply.created_at).toLocaleString("vi-VN")}
                            </time>
                          </div>
                          {reply.email_status === "failed" && (
                            <p className="mt-1 text-xs text-[#b84e3b]">
                              {reply.email_error || "Không gửi được email."}
                            </p>
                          )}
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{reply.message}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-stone-500">Chưa có phản hồi nào.</p>
                  )}
                </div>
                <form onSubmit={submitContactReply} className="mt-7 border-t border-stone-200 pt-5">
                  <h3 className="font-serif text-2xl">Soạn phản hồi qua email</h3>
                  {contactDetail.contact.sender_email ? (
                    <p className="mt-2 text-xs text-stone-500">
                      Người nhận: {contactDetail.contact.sender_email}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-[#b84e3b]">
                      Người liên hệ chưa cung cấp email nên không thể gửi phản hồi.
                    </p>
                  )}
                  <textarea
                    value={contactReplyMessage}
                    onChange={(event) => {
                      setContactReplyMessage(event.target.value);
                      setContactReplyError("");
                    }}
                    maxLength={10000}
                    required
                    disabled={!contactDetail.contact.sender_email || sendingContactReply}
                    placeholder="Nhập nội dung phản hồi..."
                    className="mt-4 min-h-36 w-full resize-y border border-stone-300 p-3 text-sm outline-none focus:border-[#1e3a5f] disabled:bg-stone-100"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-stone-500">
                      {contactReplyMessage.length}/10.000 ký tự
                    </span>
                    <button
                      type="submit"
                      disabled={!contactDetail.contact.sender_email || sendingContactReply || !contactReplyMessage.trim()}
                      className="bg-[#1e3a5f] px-5 py-3 text-xs text-white transition-colors hover:bg-[#ffd75e] hover:text-[#17141f] disabled:opacity-50"
                    >
                      {sendingContactReply ? "Đang gửi..." : "Gửi email phản hồi ↗"}
                    </button>
                  </div>
                  {contactReplyError && (
                    <p role="alert" className="mt-4 border-l-2 border-[#e36c55] bg-[#fff7f5] px-4 py-3 text-sm text-[#b84e3b]">
                      {contactReplyError}
                    </p>
                  )}
                  {contactReplyNotice && (
                    <p role="status" className="mt-4 border-l-2 border-[#4ecfa6] bg-[#effcf5] px-4 py-3 text-sm text-[#248461]">
                      {contactReplyNotice}
                    </p>
                  )}
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );

  const renderModule = () => {
    if (tab === "dashboard") return <OverviewDashboard />;
    if (tab === "contents") return renderContent();
    if (tab === "admission-applicants") return renderApplicants();
    if (tab === "students") return <StudentsManager onMessage={setMessage} />;
    if (tab === "student-enrollment-approvals") {
      return <StudentClassApprovals type="enroll" onMessage={setMessage} />;
    }
    if (tab === "student-transfer-approvals") {
      return <StudentClassApprovals type="transfer" onMessage={setMessage} />;
    }
    if (tab === "account-approvals" || tab === "users") return renderAccountApprovals();
    if (tab === "admissions") return renderAdmissions();
    if (tab === "pages") return <SchoolPagesManager onMessage={setMessage} />;
    if (tab === "teaching-assignments") return <TeachingAssignmentsManager onMessage={setMessage} />;
    if (tab === "classes") return <div className="grid gap-6 xl:grid-cols-[.8fr_1.4fr]"><div className="space-y-6"><form onSubmit={createClass} className="bg-white p-6"><h2 className="font-serif text-2xl">Tạo lớp học</h2><select name="academicYearId" required className="mt-6 w-full border-b border-stone-300 bg-transparent py-3 text-sm"><option value="">Chọn năm học</option>{classData.academicYears.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select name="gradeId" required className="mt-4 w-full border-b border-stone-300 bg-transparent py-3 text-sm"><option value="">Chọn khối</option>{classData.grades.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><input name="code" required placeholder="Mã lớp, ví dụ: 9A1" className="mt-4 w-full border-b border-stone-300 py-3 text-sm outline-none" /><input name="name" required placeholder="Tên lớp, ví dụ: Lớp 9A1" className="mt-4 w-full border-b border-stone-300 py-3 text-sm outline-none" /><input name="capacity" type="number" min="1" placeholder="Sĩ số tối đa (không bắt buộc)" className="mt-4 w-full border-b border-stone-300 py-3 text-sm outline-none" /><button className="mt-6 bg-[#7562ed] px-5 py-3 text-xs text-white">Tạo lớp ↗</button></form></div><div className="overflow-x-auto bg-white p-6"><h2 className="font-serif text-2xl">Danh sách lớp</h2><table className="mt-7 w-full min-w-[620px] text-left text-xs"><thead className="bg-[#a9f2cf]"><tr><th className="p-3">Lớp</th><th className="p-3">Khối</th><th className="p-3">Năm học</th><th className="p-3">Sĩ số</th><th className="p-3">GVCN</th></tr></thead><tbody>{classData.classes.map((item) => <tr className="border-b" key={item.id}><td className="p-3 font-semibold">{item.code}<br /><span className="font-normal text-stone-500">{item.name}</span></td><td className="p-3">{item.grade_name}</td><td className="p-3">{item.academic_year_name}</td><td className="p-3">{item.capacity || "—"}</td><td className="p-3">{item.homeroom_teacher_name || "Chưa phân công"}</td></tr>)}</tbody></table>{!classData.classes.length && <p className="mt-6 text-sm text-stone-500">Chưa có lớp nào.</p>}</div></div>;
    if (tab === "schedule") return <div className="bg-white p-6"><div className="flex flex-wrap justify-between gap-4"><h2 className="font-serif text-2xl">Xếp thời khóa biểu</h2><div className="flex gap-2"><button onClick={() => setMessage("Đã chọn file Excel để import.")} className="border px-4 py-3 text-xs">Import Excel</button><button onClick={() => setMessage("Đã tạo file Excel thời khóa biểu.")} className="bg-[#17141f] px-4 py-3 text-xs text-white">Export Excel ↗</button></div></div><p className="mt-5 text-sm text-stone-500">Kiểm tra trùng lớp, giáo viên và phòng học trước khi lưu lịch.</p><div className="mt-7 grid grid-cols-4 gap-px bg-stone-200 text-xs">{["Ngày / tiết", "Thứ 2", "Thứ 3", "Thứ 4", "Tiết 1", "Toán — 9A1", "Ngữ văn — 8B2", "Anh — 9A1", "Tiết 2", "Ngữ văn — 9A1", "Toán — 8B2", "Hóa — 9A1"].map((cell, index) => <div className={`bg-white p-3 ${index < 4 ? "bg-[#a9f2cf] font-mono text-[10px]" : ""}`} key={`${cell}-${index}`}>{cell}</div>)}</div></div>;
    if (tab === "contacts") return renderContactMessages();
    if (tab === "accounts") return <div className="grid gap-6 xl:grid-cols-2">{newCredentials && <div className="xl:col-span-2 border-2 border-[#4ecfa6] bg-[#effcf5] p-6"><p className="font-mono text-[10px] uppercase text-[#176b4f]">Thông tin đăng nhập mới — chỉ hiển thị lần này</p><h2 className="mt-2 font-serif text-2xl">Đã tạo tài khoản {newCredentials.fullName}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="font-mono text-[10px] text-stone-500">TÊN ĐĂNG NHẬP</p><p className="mt-1 select-all rounded bg-white px-3 py-3 font-mono text-sm">{newCredentials.username}</p></div><div><p className="font-mono text-[10px] text-stone-500">MẬT KHẨU TẠM THỜI</p><p className="mt-1 select-all rounded bg-white px-3 py-3 font-mono text-sm">{newCredentials.password}</p></div></div><p className="mt-4 text-xs text-[#176b4f]">Hãy sao chép và gửi bảo mật cho nhân sự. Mật khẩu chỉ hiển thị một lần.</p></div>}<form onSubmit={requestAccount} className="bg-white p-7"><h2 className="font-serif text-2xl">Tạo yêu cầu tài khoản nhân sự</h2><p className="mt-3 text-sm leading-6 text-stone-600">Yêu cầu sẽ hiển thị trong Tài khoản & BGH. Sau khi BGH phê duyệt, Admin vào đó bấm Tạo tài khoản để nhận tài khoản và mật khẩu.</p><input name="fullName" required placeholder="Họ và tên nhân sự" className="mt-6 w-full border-b border-stone-300 py-3 text-sm outline-none" /><input name="username" required pattern="[a-zA-Z0-9._\\-]{3,100}" placeholder="Tên đăng nhập, ví dụ: gv.nguyenan" className="mt-4 w-full border-b border-stone-300 py-3 text-sm outline-none" /><select name="role" value={singleAccountRole} onChange={(event) => setSingleAccountRole(event.target.value)} className="mt-4 w-full border-b border-stone-300 py-3 text-sm"><option value="teacher">Giáo viên</option><option value="principal">Ban giám hiệu</option><option value="parent">Phụ huynh</option><option value="student">Học sinh</option></select>{singleAccountRole === "student" && <select name="academicYearName" value={singleAccountAcademicYear} onChange={(event) => setSingleAccountAcademicYear(event.target.value)} required className="mt-4 w-full border-b border-stone-300 py-3 text-sm"><option value="">Chọn năm học cho học sinh</option>{classData.academicYears.map((year) => <option value={year.name} key={year.id}>{year.name}</option>)}</select>}<input name="email" type="email" placeholder="Email" className="mt-4 w-full border-b border-stone-300 py-3 text-sm outline-none" /><input name="phone" placeholder="Số điện thoại" className="mt-4 w-full border-b border-stone-300 py-3 text-sm outline-none" /><button className="mt-6 bg-[#17141f] px-5 py-3 text-xs text-white">Gửi yêu cầu ↗</button></form><div className="space-y-5"><div className="bg-white p-7"><h2 className="font-serif text-2xl">Tạo tài khoản hàng loạt</h2><p className="mt-3 text-sm leading-6">Import Excel/CSV sẽ tạo các yêu cầu chờ Ban giám hiệu phê duyệt. Sau đó Admin tạo từng tài khoản trong Tài khoản & BGH.</p><button onClick={() => setMessage("Chức năng import sẽ tạo yêu cầu theo vai trò được chọn.")} className="mt-6 bg-[#7562ed] px-5 py-3 text-xs text-white">Import danh sách ↗</button></div><div className="bg-[#a9f2cf] p-7"><p className="font-mono text-[10px]">QUY TRÌNH</p>{["Admin nhập thông tin nhân sự", "BGH phê duyệt yêu cầu", "Admin bấm Tạo tài khoản", "Nhận mật khẩu tạm thời"].map((step, i) => <p className="mt-6 text-sm" key={step}><b className="mr-4 font-serif text-2xl text-[#7562ed]">0{i + 1}</b>{step}</p>)}</div></div></div>;
    return <div className="space-y-4"><div className="bg-white p-6"><h2 className="font-serif text-2xl">Quản lý tài khoản</h2><p className="mt-2 text-sm text-stone-600">Mọi thao tác tạo, vô hiệu hóa hoặc reset mật khẩu cần sự đồng ý của Ban giám hiệu.</p></div><div className="flex items-center justify-between bg-white p-5"><div><span className="font-mono text-[9px] text-[#7562ed]">RESET_PASSWORD</span><h3 className="font-serif text-xl">Tài khoản gv0001</h3><p className="text-xs text-stone-500">Yêu cầu bởi Quản trị viên · Đang chờ duyệt</p></div><div className="flex gap-2"><button onClick={() => setMessage("BGH đã phê duyệt yêu cầu.")} className="bg-[#4ecfa6] px-4 py-2 text-[10px]">Phê duyệt</button><button onClick={() => setMessage("Đã từ chối yêu cầu.")} className="bg-[#f6a2bd] px-4 py-2 text-[10px]">Từ chối</button></div></div></div>;
  };
  if (authState === "checking") return <div className="mx-auto max-w-6xl px-5 py-24 text-center font-mono text-xs text-stone-500">Đang xác thực quyền quản trị...</div>;
  return (
    <div className="min-h-[760px] bg-[#f3f0e8]">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[245px_1fr]">
        <aside className="bg-[#1e3a5f] p-5 text-white lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:self-start lg:overflow-y-auto">
          <div className="mb-10 font-mono text-xs">
            ✦ Trường<br />
            &nbsp;&nbsp;&nbsp;học
            <span className="mt-2 block text-[9px] text-[#bdb6dc]">ADMIN CONSOLE</span>
          </div>
          <nav className="space-y-1">
            {tabs.map(([key, label]) => (
              <button
                onClick={() => setTab(key)}
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
            onClick={() => {
              localStorage.removeItem("token");
              go("login");
            }}
            className="mt-12 font-mono text-[10px] text-[#bdb6dc]"
          >
            Đăng xuất
          </button>
        </aside>
        <section>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase text-stone-500">
                Bảng điều khiển / {userRole === "principal" ? "Ban giám hiệu" : "Admin"}
              </p>
              <h1 className="mt-2 font-serif text-5xl">
                {tabs.find(([key]) => key === tab)?.[1] || "Quản trị hệ thống"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={refreshAdminData}
                disabled={refreshing}
                className="border border-stone-300 bg-white px-3 py-2 text-[10px] font-mono uppercase tracking-[.18em] text-stone-700 disabled:opacity-60"
              >
                {refreshing ? "Đang tải..." : "Làm mới"}
              </button>
              <button onClick={() => go("home")} className="text-xs">
                Trang chủ ↗
              </button>
            </div>
          </div>
          {message && <div className="mb-5 border-l-4 border-[#4ecfa6] bg-white px-4 py-3 text-sm">{message}</div>}
          {renderModule()}
        </section>
      </div>
    </div>
  );
}

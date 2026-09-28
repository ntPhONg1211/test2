export function authHeaders(json = false) {
  const token = localStorage.getItem("token");
  if (!token) {
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

export async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(response.ok
      ? "Máy chủ không trả về dữ liệu. Vui lòng thử lại."
      : `Máy chủ không phản hồi dữ liệu (HTTP ${response.status}). Vui lòng thử lại.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Phản hồi từ máy chủ không hợp lệ. Vui lòng thử lại sau.");
  }
}

export async function fetchApi(path, options = {}) {
  const multipartBody = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(options.method && options.method !== "GET" && !multipartBody),
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) {
    if (!response.ok) {
      throw new Error(`Máy chủ phản hồi lỗi (HTTP ${response.status}). Vui lòng thử lại.`);
    }
    return null;
  }

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.message || `Máy chủ phản hồi lỗi (HTTP ${response.status}).`);
  }
  return data;
}

export async function fetchNews() {
  return fetchApi("/api/news");
}

export async function fetchSchoolPages() {
  return fetchApi("/api/pages");
}

export async function fetchAdmissionCampaigns() {
  return fetchApi("/api/admissions/campaigns");
}

export async function submitAdmissionApplication(data) {
  return fetchApi("/api/admissions/applications", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function submitContact(data) {
  return fetchApi("/api/contacts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchAdminContactMessages() {
  return fetchApi("/api/admin/contact-messages");
}

export async function fetchAdminContactMessage(id) {
  return fetchApi(`/api/admin/contact-messages/${id}`);
}

export async function sendAdminContactReply(id, message) {
  return fetchApi(`/api/admin/contact-messages/${id}/replies`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function loginUser(username, password) {
  return fetchApi("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchCurrentUser() {
  return fetchApi("/api/me", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function changePassword(currentPassword, newPassword, confirmPassword) {
  return fetchApi("/api/account/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
}

export async function fetchAdmissionApplicants() {
  return fetchApi("/api/admin/admission-applicants", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchUsers() {
  return fetchApi("/api/admin/users", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchAdminStudents() {
  return fetchApi("/api/admin/students", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function importStudentRoster(file, academicYearId) {
  const body = new FormData();
  body.append("file", file);
  body.append("academicYearId", academicYearId);
  return fetchApi("/api/admin/students/import", {
    method: "POST",
    body,
  });
}

export async function fetchStudentImportFiles() {
  return fetchApi("/api/admin/student-import-files");
}

export async function downloadStudentImportFile(id, fileName) {
  const response = await fetch(`/api/admin/student-import-files/${id}/download`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const data = await readJsonResponse(response);
    throw new Error(data.message || "Không thể tải file thông tin đăng nhập.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function deleteStudentImportFile(id) {
  return fetchApi(`/api/admin/student-import-files/${id}`, {
    method: "DELETE",
  });
}

export async function fetchStudentClassRequests({ type, status } = {}) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  const query = params.size ? `?${params.toString()}` : "";
  return fetchApi(`/api/admin/student-class-requests${query}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function createStudentClassRequest(studentId, classId) {
  return fetchApi("/api/admin/student-class-requests", {
    method: "POST",
    body: JSON.stringify({ studentId, classId }),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function decideStudentClassRequest(id, status, note = "") {
  return fetchApi(`/api/admin/student-class-requests/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchClasses() {
  return fetchApi("/api/admin/classes", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function createClass(data) {
  return fetchApi("/api/admin/classes", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchTeachingAssignmentsAdmin() {
  return fetchApi("/api/admin/teaching-assignments", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function createTeachingAssignment(data) {
  return fetchApi("/api/admin/teaching-assignments", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchAdmissionCampaignsAdmin() {
  return fetchApi("/api/admin/admission-campaigns", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function createAdmissionCampaign(data) {
  return fetchApi("/api/admin/admission-campaigns", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function updateAdmissionCampaign(id, data) {
  return fetchApi(`/api/admin/admission-campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchContents() {
  return fetchApi("/api/admin/contents", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function createContent(data) {
  return fetchApi("/api/admin/contents", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function updateContent(id, data) {
  return fetchApi(`/api/admin/contents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function deleteContent(id) {
  return fetchApi(`/api/admin/contents/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchPages() {
  return fetchApi("/api/admin/pages", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function updatePage(id, data) {
  return fetchApi(`/api/admin/pages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchContacts() {
  return fetchApi("/api/admin/contact-messages", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function updateContact(id, data) {
  return fetchApi(`/api/admin/contact-messages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchAccountRequests() {
  return fetchApi("/api/admin/account-requests", {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function createAccountRequest(data) {
  return fetchApi("/api/admin/account-requests", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function decideAccountRequest(id, status, note) {
  return fetchApi(`/api/admin/account-requests/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ status, decision_note: note }),
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function createApprovedAccount(id) {
  return fetchApi(`/api/admin/account-requests/${id}/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
}

export async function fetchTeacherAssignments() {
  return fetchApi("/api/teacher/assignments");
}

export async function fetchTeacherGradebook(assignmentId, semesterId = "") {
  const query = semesterId ? `?semesterId=${encodeURIComponent(semesterId)}` : "";
  return fetchApi(`/api/teacher/assignments/${assignmentId}/gradebook${query}`);
}

export async function saveTeacherScores(assignmentId, semesterId, scores) {
  return fetchApi(`/api/teacher/assignments/${assignmentId}/scores`, {
    method: "PUT",
    body: JSON.stringify({ semesterId, scores }),
  });
}

export async function fetchTeacherSchedule(academicYearId = "") {
  const query = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : "";
  return fetchApi(`/api/teacher/schedule${query}`);
}

export async function fetchTeacherResources() {
  return fetchApi("/api/teacher/resources");
}

export async function fetchStudentResources() {
  return fetchApi("/api/student/resources");
}

export async function uploadTeacherResource(formData) {
  const response = await fetch("/api/teacher/resources", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (response.status === 204 && response.ok) return null;
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.message || `Máy chủ phản hồi lỗi (HTTP ${response.status}).`);
  }
  return data;
}

export async function downloadTeacherResource(id, fileName) {
  const response = await fetch(`/api/teacher/resources/${id}/download`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const data = await readJsonResponse(response);
    throw new Error(data.message || `Không thể tải tệp (HTTP ${response.status}).`);
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

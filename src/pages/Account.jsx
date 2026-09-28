import { useEffect, useState } from "react";
import PageTitle from "../components/PageTitle";
import { readJsonResponse } from "../services/api";

export default function Account() {
  const [profile, setProfile] = useState({ username: "", email: "", phone: "", role: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const roleLabels = {
    student: "Học sinh",
    parent: "Phụ huynh",
    teacher: "Giáo viên",
    admin: "Quản trị viên",
    principal: "Ban giám hiệu",
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.user) return;
        setProfile({
          username: data.user.username || "",
          email: data.user.email || "",
          phone: data.user.phone || "",
          role: data.user.role || "",
        });
      })
      .catch(() => {});
  }, []);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Bạn chưa đăng nhập.");
      return;
    }

    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(passwordForm),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.message || "Không thể đổi mật khẩu");
      setMessage("Đổi mật khẩu thành công.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setError(err.message || "Không thể đổi mật khẩu.");
    }
  };

  return <><PageTitle kicker="" title={<>Thông tin<br /><em>cá nhân.</em></>} subtitle="Thông tin cá nhân được hiển thị từ dữ liệu tài khoản của bạn. Chỉ có chức năng đổi mật khẩu." /><div className="mx-auto grid max-w-6xl gap-8 px-5 pb-24 lg:grid-cols-[1.1fr_.9fr]"><div className="bg-white p-7 shadow-sm"><h2 className="font-serif text-3xl">Thông tin cá nhân</h2><div className="mt-7 grid gap-6 md:grid-cols-2"><label className="font-mono text-[10px] uppercase text-stone-500">Username<input value={profile.username} readOnly className="mt-2 w-full border-b border-stone-300 bg-stone-50 py-3 font-sans text-sm text-stone-700 outline-none" /></label><label className="font-mono text-[10px] uppercase text-stone-500">Email<input value={profile.email} readOnly type="email" className="mt-2 w-full border-b border-stone-300 bg-stone-50 py-3 font-sans text-sm text-stone-700 outline-none" /></label><label className="font-mono text-[10px] uppercase text-stone-500">Phone<input value={profile.phone} readOnly className="mt-2 w-full border-b border-stone-300 bg-stone-50 py-3 font-sans text-sm text-stone-700 outline-none" /></label><label className="font-mono text-[10px] uppercase text-stone-500">Role<input value={roleLabels[profile.role] || profile.role || ""} readOnly className="mt-2 w-full border-b border-stone-300 bg-stone-50 py-3 font-sans text-sm text-stone-700 outline-none" /></label></div><p className="mt-7 text-xs uppercase tracking-[0.18em] text-stone-500"></p></div><div className="bg-[#f4f1df] p-7 shadow-sm"><h2 className="font-serif text-3xl">Đổi mật khẩu</h2><form onSubmit={handlePasswordSubmit} className="mt-7 space-y-5"><label className="block font-mono text-[10px] uppercase text-stone-500">Mật khẩu hiện tại<input value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} type="password" placeholder="Nhập mật khẩu hiện tại" className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm outline-none" /></label><label className="block font-mono text-[10px] uppercase text-stone-500">Mật khẩu mới<input value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} type="password" placeholder="Nhập mật khẩu mới" className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm outline-none" /></label><label className="block font-mono text-[10px] uppercase text-stone-500">Xác nhận mật khẩu mới<input value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} type="password" placeholder="Nhập lại mật khẩu mới" className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm outline-none" /></label>{message && <p className="text-sm text-[#248461]">{message}</p>}{error && <p className="text-sm text-[#b12434]">{error}</p>}<button type="submit" className="w-full bg-[#7562ed] px-5 py-3 text-xs text-white">Cập nhật mật khẩu</button></form></div></div></>;
}



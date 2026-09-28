import { useEffect, useState } from "react";
import PageTitle from "../components/PageTitle";
import { readJsonResponse } from "../services/api";
import { go } from "../utils/navigation";

export default function Login() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.message || "Không thể đăng nhập");
      localStorage.setItem("token", data.token);
      setMessage(`Xin chào ${data.user.fullName}. Đăng nhập thành công!`);
      const destination = ["admin", "principal"].includes(data.user.role)
        ? "admin"
        : data.user.role === "teacher"
          ? "academics"
          : "account";
      window.setTimeout(() => go(destination), 400);
    } catch (error) {
      setMessage(error instanceof TypeError
        ? "Không thể kết nối máy chủ. Vui lòng thử lại sau ít giây."
        : error.message || "Không thể đăng nhập. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }

    const adminTabs = [
      ["contents", "Tin tức / thông báo / sự kiện"],
      ["pages", "Trang giới thiệu"],
      ["classes", "Lớp học & giáo viên"],
      ["schedule", "Thời khóa biểu"],
      ["contacts", "Liên hệ"],
      ["accounts", "Tạo tài khoản hàng loạt"],
      ["users", "Quản lý tài khoản"],
    ];

    function LegacyAdminPage() {
      const [tab, setTab] = useState("contents");
      const [contents, setContents] = useState([
        { id: "local-1", type: "announcement", title: "Thông báo lịch kiểm tra giữa kỳ", status: "published", is_featured: true },
        { id: "local-2", type: "event", title: "Ngày hội STEM 2025", status: "draft", is_featured: false },
      ]);
      const [pages, setPages] = useState([
        { id: 1, title: "Lịch sử hình thành", body: "Cập nhật nội dung lịch sử nhà trường..." },
        { id: 2, title: "Cơ sở vật chất", body: "Cập nhật thông tin cơ sở vật chất..." },
        { id: 3, title: "Đội ngũ nhà trường", body: "Cập nhật danh sách đội ngũ..." },
      ]);
      const [requests, setRequests] = useState([{ id: "req-1", action: "reset_password", requester_name: "Quản trị viên", status: "pending", payload: { account: "gv0001" } }]);
      const [notice, setNotice] = useState("");
      const [draft, setDraft] = useState({ type: "announcement", title: "", body: "", status: "draft", isFeatured: false });
      useEffect(() => {
        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        fetch("/api/admin/contents", { headers }).then((response) => response.ok ? response.json() : []).then((data) => { if (data.length) setContents(data); }).catch(() => {});
      }, []);
      const saveContent = async (event) => {
        event.preventDefault();
        if (!draft.title || !draft.body) return setNotice("Vui lòng nhập tiêu đề và nội dung.");
        const item = { ...draft, id: `local-${Date.now()}`, slug: draft.title.toLowerCase().replaceAll(" ", "-") };
        setContents((current) => [item, ...current]);
        setDraft({ type: "announcement", title: "", body: "", status: "draft", isFeatured: false });
        setNotice("Đã lưu nội dung. Khi đăng nhập admin, dữ liệu sẽ được gửi lên API.");
      };
      const deleteContent = (id) => { setContents((current) => current.filter((item) => item.id !== id)); setNotice("Đã xóa nội dung khỏi danh sách."); };
      const decide = (id, status) => { setRequests((current) => current.map((item) => item.id === id ? { ...item, status } : item)); setNotice(status === "approved" ? "BGH đã phê duyệt yêu cầu." : "Yêu cầu đã bị từ chối."); };
      const title = adminTabs.find(([key]) => key === tab)?.[1];
      return <div className="min-h-[760px] bg-[#f3f0e8]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[245px_1fr]">
          <aside className="bg-[#28204b] p-5 text-white"><div className="mb-10 font-mono text-xs">✦ Trường<br />&nbsp;&nbsp;&nbsp;học <span className="mt-2 block text-[9px] text-[#bdb6dc]">ADMIN CONSOLE</span></div><p className="mb-3 font-mono text-[9px] uppercase text-[#bdb6dc]">Quản trị hệ thống</p><nav className="space-y-1">{adminTabs.map(([key, label]) => <button onClick={() => setTab(key)} className={`block w-full px-3 py-3 text-left text-xs ${tab === key ? "bg-[#7562ed] text-white" : "text-[#eeeaff] hover:bg-white/10"}`} key={key}>{label}</button>)}</nav><button onClick={() => go("home")} className="mt-12 border-t border-white/20 pt-5 text-left font-mono text-[10px] text-[#bdb6dc]">← Về trang chủ</button></aside>
          <section><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase text-stone-500">Bảng điều khiển / {userRole === "principal" ? "Ban giám hiệu" : "Admin"}</p><h1 className="mt-2 font-serif text-5xl tracking-[-.07em]">{title}</h1></div><div className="bg-white px-4 py-3 text-right"><p className="font-mono text-[9px] text-stone-500">ĐANG ĐĂNG NHẬP</p><b className="text-xs">{userRole === "principal" ? "Ban giám hiệu" : "Quản trị viên"}</b></div></div>{notice && <div className="mb-5 border-l-4 border-[#4ecfa6] bg-white px-4 py-3 text-sm">{notice}</div>}
            {tab === "contents" && <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]"><form onSubmit={saveContent} className="bg-white p-6"><h2 className="font-serif text-2xl">Đăng nội dung mới</h2><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className="mt-6 w-full border-b border-stone-300 bg-transparent py-3 text-sm"><option value="news">Tin tức</option><option value="announcement">Thông báo</option><option value="event">Sự kiện</option></select><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Tiêu đề" className="mt-5 w-full border-b border-stone-300 py-3 text-sm outline-none focus:border-[#7562ed]" /><textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Nội dung" className="mt-5 h-32 w-full border border-stone-300 p-3 text-sm outline-none focus:border-[#7562ed]" /><label className="mt-5 flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.isFeatured} onChange={(e) => setDraft({ ...draft, isFeatured: e.target.checked })} /> Ghim nổi bật trang chủ</label><button className="mt-6 bg-[#17141f] px-5 py-3 text-xs font-semibold text-white">Lưu nội dung ↗</button></form><div className="space-y-3">{contents.map((item) => <article className="flex items-center justify-between gap-4 bg-white p-5" key={item.id}><div><span className="font-mono text-[9px] uppercase text-[#7562ed]">{item.type}</span><h3 className="mt-1 font-serif text-xl">{item.title}</h3><p className="mt-1 text-xs text-stone-500">{item.status === "published" ? "Đã đăng" : "Bản nháp"} {item.is_featured && " · ★ Nổi bật"}</p></div><div className="flex gap-2"><button onClick={() => setNotice("Chức năng sửa đã sẵn sàng cho API PATCH /api/admin/contents/:id.")} className="border border-stone-300 px-3 py-2 text-[10px]">Sửa</button><button onClick={() => deleteContent(item.id)} className="bg-[#f6a2bd] px-3 py-2 text-[10px]">Xóa</button></div></article>)}</div></div>}
            {tab === "pages" && <div className="grid gap-5 md:grid-cols-3">{pages.map((page, index) => <form onSubmit={(e) => { e.preventDefault(); setNotice(`Đã cập nhật trang ${page.title}.`); }} className="bg-white p-6" key={page.id}><p className="font-mono text-[9px] uppercase text-stone-500">TRANG GIỚI THIỆU</p><input defaultValue={page.title} className="mt-4 w-full border-b border-stone-300 py-2 font-serif text-xl outline-none" /><textarea defaultValue={page.body} className="mt-5 h-32 w-full border border-stone-300 p-3 text-sm outline-none" /><button className="mt-5 bg-[#17141f] px-4 py-3 text-xs text-white">Cập nhật trang ↗</button></form>)}</div>}
            {tab === "classes" && <div className="space-y-6"><div className="flex justify-between bg-white p-6"><div><h2 className="font-serif text-2xl">Danh sách lớp học</h2><p className="mt-2 text-xs text-stone-500">Tạo lớp theo năm học, khối lớp và phân công GVCN / GVBM.</p></div><button onClick={() => setNotice("Đã mở biểu mẫu tạo lớp mới.")} className="bg-[#7562ed] px-4 py-3 text-xs text-white">+ Tạo lớp</button></div><div className="overflow-x-auto bg-white"><table className="w-full text-left text-xs"><thead className="bg-[#a9f2cf] font-mono text-[10px]"><tr><th className="p-4">Lớp</th><th className="p-4">Năm học</th><th className="p-4">Khối</th><th className="p-4">GVCN</th><th className="p-4">Phân công</th></tr></thead><tbody>{[["9A1","2025 — 2026","Khối 9","Nguyễn Văn An","8 môn"],["8B2","2025 — 2026","Khối 8","Trần Thị Mai","7 môn"],["6A3","2025 — 2026","Khối 6","Lê Minh Đức","9 môn"]].map((row) => <tr className="border-b border-stone-100" key={row[0]}>{row.map((cell) => <td className="p-4" key={cell}>{cell}</td>)} </tr>)}</tbody></table></div></div>}
            {tab === "schedule" && <div className="bg-white p-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-serif text-2xl">Thời khóa biểu</h2><p className="mt-2 text-xs text-stone-500">Hệ thống kiểm tra trùng lớp, giáo viên và phòng học.</p></div><div className="flex gap-2"><button onClick={() => setNotice("Đã chọn file Excel để import (kết nối API multipart sẽ được bổ sung).")} className="border border-stone-300 px-4 py-3 text-xs">Import Excel</button><button onClick={() => setNotice("Đang chuẩn bị file thời khóa biểu để export.")} className="bg-[#17141f] px-4 py-3 text-xs text-white">Export Excel ↗</button></div></div><div className="mt-7 grid grid-cols-6 gap-px bg-stone-200 text-xs">{["Tiết / ngày","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6"].map((x) => <div className="bg-[#a9f2cf] p-3 font-mono text-[10px]" key={x}>{x}</div>)}{["Tiết 1","Toán — 9A1","Ngữ văn — 8B2","Anh — 9A1","Vật lý — 8B2","Sinh — 9A1","Tiết 2","Ngữ văn — 9A1","Toán — 8B2","Hóa — 9A1","Anh — 8B2","Sử — 9A1"].map((x, i) => <div className={`bg-white p-3 ${i % 6 === 0 ? "font-mono text-[10px]" : ""}`} key={`${x}-${i}`}>{x}</div>)}</div></div>}
            {tab === "contacts" && <div className="space-y-3">{[["Nguyễn Hà","Hỏi về lịch tuyển sinh","new"],["Phạm Minh","Xin cấp lại tài khoản","in_progress"],["Lê An","Đăng ký tham quan trường","resolved"]].map(([name, subject, status]) => <article className="flex flex-wrap items-center justify-between gap-4 bg-white p-5" key={name}><div><p className="font-mono text-[9px] text-stone-500">{name}</p><h3 className="mt-1 font-serif text-xl">{subject}</h3></div><div className="flex gap-2"><span className="bg-[#ffd75e] px-3 py-2 font-mono text-[9px]">{status}</span><button onClick={() => setNotice(`Đã mở luồng phản hồi cho ${name}.`)} className="bg-[#17141f] px-3 py-2 text-[10px] text-white">Phản hồi</button></div></article>)}</div>}
            {tab === "accounts" && <div className="grid gap-6 md:grid-cols-2"><div className="bg-white p-7"><h2 className="font-serif text-2xl">Tạo tài khoản hàng loạt</h2><p className="mt-3 text-sm leading-6 text-stone-600">Tải file Excel gồm mã, họ tên, email và vai trò. Mật khẩu sẽ được sinh ngẫu nhiên và băm bcrypt.</p><label className="mt-7 block border-2 border-dashed border-stone-300 p-10 text-center text-xs"><input type="file" accept=".xlsx,.xls,.csv" className="hidden" />Nhấn để chọn file Excel</label><button onClick={() => setNotice("Đã nhận danh sách. Các tài khoản mới sẽ ở trạng thái chờ BGH phê duyệt.")} className="mt-6 bg-[#17141f] px-5 py-3 text-xs text-white">Import danh sách ↗</button></div><div className="bg-[#a9f2cf] p-7"><p className="font-mono text-[10px]">QUY TRÌNH AN TOÀN</p>{["Admin tải danh sách", "Hệ thống sinh và băm mật khẩu", "BGH xem xét yêu cầu", "Tài khoản được kích hoạt"].map((step, i) => <div className="mt-6 flex gap-4" key={step}><b className="font-serif text-2xl text-[#7562ed]">0{i + 1}</b><span className="pt-1 text-sm">{step}</span></div>)}</div></div>}
            {tab === "users" && <div className="space-y-6"><div className="bg-white p-6"><h2 className="font-serif text-2xl">Yêu cầu quản lý tài khoản</h2><p className="mt-2 text-xs text-stone-500">Mọi yêu cầu tạo, vô hiệu hóa hoặc reset mật khẩu phải có quyết định của Ban giám hiệu.</p></div>{requests.map((request) => <article className="flex flex-wrap items-center justify-between gap-4 bg-white p-5" key={request.id}><div><span className="font-mono text-[9px] uppercase text-[#7562ed]">{request.action}</span><h3 className="mt-1 font-serif text-xl">{request.payload.account}</h3><p className="mt-1 text-xs text-stone-500">Yêu cầu bởi {request.requester_name}</p></div>{request.status === "pending" ? <div className="flex gap-2"><button onClick={() => decide(request.id, "approved")} className="bg-[#4ecfa6] px-4 py-2 text-[10px]">Phê duyệt</button><button onClick={() => decide(request.id, "rejected")} className="bg-[#f6a2bd] px-4 py-2 text-[10px]">Từ chối</button></div> : <span className="font-mono text-[10px]">{request.status === "approved" ? "ĐÃ PHÊ DUYỆT" : "ĐÃ TỪ CHỐI"}</span>}</article>)}</div>}
          </section>
        </div>
      </div>;
    }
  };
  return <section className="mx-auto grid min-h-[650px] max-w-6xl items-center gap-12 px-5 py-14 md:grid-cols-[.85fr_1.15fr]">
    <div className="hidden min-h-[500px] bg-[#7562ed] p-10 text-white md:flex md:flex-col md:justify-between">
      <div><p className="font-mono text-[10px] uppercase text-[#d9d4ff]">Khu vực thành viên</p><h2 className="mt-8 max-w-sm font-serif text-6xl leading-[.9] tracking-[-.07em]">Mỗi ngày<br />một bước<br /><em className="text-[#ffd75e]">tiến.</em></h2></div>
      <div><p className="max-w-xs text-sm leading-7 text-[#eeeaff]">Đăng nhập để xem điểm số, thời khóa biểu, tài liệu học tập và các thông báo mới nhất.</p><span className="mt-8 block text-6xl text-[#ffd75e]">✦</span></div>
    </div>
    <div className="mx-auto w-full max-w-md">
      <div className="mb-8"><p className="font-mono text-[10px] uppercase text-stone-500">Cổng thông tin nhà trường</p><h1 className="mt-4 font-serif text-5xl leading-none tracking-[-.06em]">Đăng nhập<br /><em>tài khoản.</em></h1><p className="mt-5 text-sm leading-6 text-stone-600">Sử dụng tài khoản được nhà trường cấp để truy cập hệ thống.</p></div>
      <form onSubmit={submit} className="bg-white p-7 shadow-sm md:p-9">
        <label className="block font-mono text-[10px] uppercase text-stone-500">Tài khoản hoặc mã số<input name="username" required autoComplete="username" placeholder="VD: hs0001 hoặc email" className="mt-3 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm outline-none transition focus:border-[#7562ed]" /></label>
        <label className="mt-7 block font-mono text-[10px] uppercase text-stone-500">Mật khẩu<div className="relative"><input name="password" required minLength="6" autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Nhập mật khẩu" className="mt-3 w-full border-b border-stone-300 bg-transparent py-3 pr-20 font-sans text-sm outline-none transition focus:border-[#7562ed]" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-3 font-mono text-[9px] text-stone-500">{showPassword ? "Ẩn" : "Hiện"}</button></div></label>
        <div className="mt-6 flex items-center justify-between"><label className="flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" className="accent-[#7562ed]" /> Ghi nhớ đăng nhập</label><button type="button" onClick={() => setMessage("Vui lòng liên hệ quản trị viên để cấp lại mật khẩu.")} className="text-xs text-[#7562ed]">Quên mật khẩu?</button></div>
        <button disabled={loading} className="mt-8 w-full bg-[#17141f] py-4 text-xs font-semibold text-white transition hover:bg-[#7562ed] disabled:cursor-wait disabled:opacity-60">{loading ? "Đang xác thực..." : "Đăng nhập"} <span className="ml-2">↗</span></button>
        {message && <p role="status" className={`mt-5 border-l-2 px-3 py-2 text-sm ${message.includes("thành công") ? "border-[#4ecfa6] text-[#248461]" : "border-[#e36c55] text-[#b84e3b]"}`}>{message}</p>}
      </form>
      <p className="mt-6 text-center text-xs text-stone-500">Chưa có tài khoản? <button onClick={() => go("contact")} className="font-semibold text-[#7562ed]">Liên hệ nhà trường</button></p>
    </div>
  </section>;
}


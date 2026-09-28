import { useEffect, useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/Header";
import PageTitle from "./components/PageTitle";
import Account from "./pages/Account";
import About from "./pages/About";
import Admissions from "./pages/Admissions";
import Admin from "./pages/Admin";
import Contact from "./pages/Contact";
import Home from "./pages/Home";
import Library from "./pages/Library";
import Login from "./pages/Login";
import News from "./pages/News";
import Scores from "./pages/Scores";
import TeacherDashboard from "./pages/TeacherDashboard";
import { go } from "./utils/navigation";

export default function App() {
  const [page, setPage] = useState(window.location.hash.slice(1) || "home");
  const [menu, setMenu] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const update = async () => {
      const nextPage = window.location.hash.slice(1) || "home";
      const publicPages = new Set(["home", "about", "news", "admissions", "contact", "login"]);
      const token = localStorage.getItem("token");
      if (!token) setUserRole(null);
      if (!publicPages.has(nextPage) && !token) {
        window.location.hash = "login";
        return;
      }
      if (token) {
        try {
          const response = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) throw new Error("invalid session");
          const { user } = await response.json();
          setUserRole(user?.role || null);
        } catch {
          setUserRole(null);
          if (!publicPages.has(nextPage)) {
            localStorage.removeItem("token");
            window.location.hash = "login";
            return;
          }
        }
      }
      setPage(nextPage);
      window.scrollTo(0, 0);
      setMenu(false);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const pages = {
    home: <Home />,
    about: <About />,
    news: <News />,
    admissions: <Admissions />,
    schedule: <Account />,
    academics: <TeacherDashboard />,
    account: <Account />,
    scores: <Scores />,
    library: <Library />,
    contact: <Contact />,
    login: <Login />,
    admin: <Admin />,
    contents: <Admin initialTab="contents" />,
    pages: <Admin initialTab="pages" />,
    classes: <Admin initialTab="classes" />,
    students: <Admin initialTab="students" />,
    teaching_assignments: <Admin initialTab="teaching-assignments" />,
    teaching: <Admin initialTab="teaching-assignments" />,
    contacts: <Admin initialTab="contacts" />,
    accounts: <Admin initialTab="accounts" />,
    users: <Admin initialTab="users" />,
    admission_applicants: <Admin initialTab="admission-applicants" />,
    admission_applicants_admin: <Admin initialTab="admission-applicants" />,
    student_enrollment_approvals: <Admin initialTab="student-enrollment-approvals" />,
    student_transfer_approvals: <Admin initialTab="student-transfer-approvals" />,
    account_approvals: <Admin initialTab="account-approvals" />,
  };
  const isLoggedIn = Boolean(localStorage.getItem("token"));

  return (
    <div className="min-h-screen bg-[#f8f5ec]">
      <Header onMenu={() => setMenu(!menu)} isAdmin={userRole === "admin"} />
      {menu && (
        <div className="fixed inset-x-0 top-20 z-20 bg-[#f8f5ec] p-6 shadow md:hidden">
          <button className="block py-2 text-xs" onClick={() => go("about")}>Giới thiệu</button>
          <button className="block py-2 text-xs" onClick={() => go("admissions")}>Tuyển sinh</button>
          {isLoggedIn && <button className="block py-2 text-xs" onClick={() => go("academics")}>Học vụ giáo viên</button>}
          <button className="block py-2 text-xs" onClick={() => go("schedule")}>Thời khóa biểu</button>
          <button className="block py-2 text-xs" onClick={() => go("scores")}>Điểm số</button>
          <button className="block py-2 text-xs" onClick={() => go("library")}>Tài liệu</button>
          <button className="block py-2 text-xs" onClick={() => go("news")}>Tin tức</button>
          <button className="block py-2 text-xs" onClick={() => go("contact")}>Liên hệ</button>
          {isLoggedIn ? (
            <>
              {userRole === "admin" && <button className="block py-2 text-xs" onClick={() => go("admin")}>Trang quản trị</button>}
              <button className="block py-2 text-xs" onClick={() => go("account")}>Trang tài khoản</button>
              <button className="block py-2 text-xs" onClick={() => { localStorage.removeItem("token"); go("home"); }}>Đăng xuất</button>
            </>
          ) : (
            <button className="block py-2 text-xs" onClick={() => go("login")}>Đăng nhập</button>
          )}
        </div>
      )}
      <main>{pages[page] || <PageTitle kicker="404" title={<>Trang không<br /><em>tồn tại.</em></>} />}</main>
      <Footer />
    </div>
  );
}

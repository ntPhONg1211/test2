import { go } from "../utils/navigation";
import Button from "./Button";

const headerLinkClass = "rounded-sm px-2 py-2 transition-colors hover:bg-[#ffd75e] hover:text-[#17141f] focus-visible:bg-[#ffd75e] focus-visible:text-[#17141f]";

export default function Header({ onMenu, isAdmin }) {
  const isLoggedIn = Boolean(localStorage.getItem("token"));
  const accountButton = isLoggedIn ? (
    <button onClick={() => go("account")} className={`hidden text-xs font-semibold sm:block ${headerLinkClass}`}>
      Trang tài khoản
    </button>
  ) : null;
  const adminButton = isLoggedIn && isAdmin ? (
    <button onClick={() => go("admin")} className={`hidden text-xs font-semibold sm:block ${headerLinkClass}`}>
      Trang quản trị
    </button>
  ) : null;
  const authButton = isLoggedIn ? (
    <button
      onClick={() => {
        localStorage.removeItem("token");
        go("home");
      }}
      className={`hidden text-xs font-semibold sm:block ${headerLinkClass}`}
    >
      Đăng xuất
    </button>
  ) : (
    <button onClick={() => go("login")} className={`hidden text-xs font-semibold sm:block ${headerLinkClass}`}>
      Đăng nhập
    </button>
  );

  return (
    <header className="sticky top-0 z-40 bg-[#1e3a5f] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <button
          onClick={() => go("home")}
          className="flex items-center rounded-sm px-2 py-2 font-mono text-xs leading-none transition-colors hover:bg-[#ffd75e] hover:text-[#17141f] focus-visible:bg-[#ffd75e] focus-visible:text-[#17141f]"
        >
          <span className="mr-2 text-2xl">✦</span>
          <span>
            Trường<br />
            <b>học</b>
          </span>
        </button>
        <nav className="hidden gap-3 text-xs md:flex">
          <button className={headerLinkClass} onClick={() => go("about")}>Giới thiệu</button>
          <button className={headerLinkClass} onClick={() => go("admissions")}>Tuyển sinh</button>
          {isLoggedIn && <button className={headerLinkClass} onClick={() => go("academics")}>Học vụ</button>}
          <button className={headerLinkClass} onClick={() => go("scores")}>Điểm số</button>
          <button className={headerLinkClass} onClick={() => go("library")}>Tài liệu</button>
          <button className={headerLinkClass} onClick={() => go("news")}>Tin tức</button>
          <button className={headerLinkClass} onClick={() => go("contact")}>Liên hệ</button>
        </nav>
        <div className="flex items-center gap-4">
          {accountButton}
          {adminButton}
          {authButton}
          {!isLoggedIn && <Button path="admissions" className="transition-colors hover:bg-[#ffd75e] hover:text-[#17141f]">Tuyển sinh</Button>}
          <button className="rounded-sm px-2 py-1 text-xl transition-colors hover:bg-[#ffd75e] hover:text-[#17141f] focus-visible:bg-[#ffd75e] focus-visible:text-[#17141f] md:hidden" onClick={onMenu} aria-label="Mở menu">
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}

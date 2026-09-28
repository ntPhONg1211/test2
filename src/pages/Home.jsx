import { useEffect, useState } from "react";
import Button from "../components/Button";
import { go, formatDate } from "../utils/navigation";
import { fetchNews } from "../services/api";

export default function Home() {
  const [content, setContent] = useState([
    {
      type: "announcement",
      title: "Lịch tựu trường năm học 2025 — 2026",
      excerpt: "Những điều học sinh và phụ huynh cần chuẩn bị cho ngày tựu trường.",
      published_at: "2025-09-05",
    },
    {
      type: "event",
      title: "Ngày hội STEM 2025",
      excerpt: "Cùng khám phá khoa học, công nghệ và những ý tưởng sáng tạo.",
      published_at: "2025-09-18",
    },
    {
      type: "event",
      title: "Hội thao học sinh cấp trường",
      excerpt: "Sân chơi rèn luyện sức khỏe, tinh thần đồng đội và sự tự tin.",
      published_at: "2025-09-25",
    },
    {
      type: "announcement",
      title: "Thông báo lịch kiểm tra giữa học kỳ",
      excerpt: "Lịch kiểm tra và hướng dẫn ôn tập dành cho các khối lớp.",
      published_at: "2025-10-01",
    },
  ]);

  useEffect(() => {
    fetchNews()
      .then((data) => {
        if (data.length) {
          setContent(
            data.filter((item) => ["announcement", "event"].includes(item.type))
          );
        }
      })
      .catch(() => {});
  }, []);

  const announcements = content
    .filter((item) => item.type === "announcement")
    .slice(0, 3);
  const events = content.filter((item) => item.type === "event").slice(0, 3);

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2">
        <div>
          <p className="mb-6 font-mono text-[10px] uppercase">
            Cổng thông tin nhà trường <span className="text-orange-500">✦</span>
          </p>
          <h1 className="font-serif text-6xl font-bold leading-[.9] tracking-[-.07em] md:text-8xl">
            Nơi mỗi<br />
            <em>học sinh</em>
            <br />
            tỏa sáng.
          </h1>
          <p className="my-8 max-w-xs text-sm leading-7">
            Một không gian số thân thiện, kết nối nhà trường, thầy cô, học sinh
            và phụ huynh trong từng trải nghiệm học tập.
          </p>
          <div className="flex items-center gap-7">
            <Button path="about">Khám phá trường</Button>
            <button onClick={() => go("about")} className="text-xs font-semibold">
              Xem giới thiệu →
            </button>
          </div>
        </div>
        <div className="relative h-[390px] overflow-hidden bg-[#7562ed]">
          <div className="absolute -left-20 top-16 h-64 w-64 rounded-full bg-[#ffd75e]" />
          <div className="absolute left-[15%] top-16 z-[1] h-64 w-[70%] bg-white p-4 shadow-xl">
            <div className="border-b pb-2 font-mono text-[7px]">
              ● ● ●{" "}
              <span className="float-right">BẢNG ĐIỀU KHIỂN</span>
            </div>
            <div className="mt-7 flex gap-4">
              <div className="w-1/5 space-y-6 border-r pr-3">
                <i className="block h-2 bg-[#7562ed]" />
                <i className="block h-2 bg-gray-200" />
                <i className="block h-2 bg-gray-200" />
              </div>
              <div className="flex-1">
                <p className="text-[10px]">Xin chào</p>
                <div className="mt-5 flex gap-2">
                  <div className="w-1/2 border-l-4 border-[#7562ed] bg-[#f7f5fd] p-3 text-[8px]">
                    <strong className="mt-1 block font-serif text-xl"></strong>
                  </div>
                  <div className="w-1/2 border-l-4 border-[#4ecfa6] bg-[#f7f5fd] p-3 text-[8px]">
                    <strong className="mt-1 block font-serif text-xl"></strong>
                  </div>
                </div>
                <div className="mt-6 flex h-20 items-end gap-2 border-b px-3">
                  {[30, 45, 36, 70, 53, 82, 95].map((h, i) => (
                    <i
                      key={i}
                      style={{ height: `${h}%` }}
                      className={`w-1/6 ${
                        i === 6 ? "bg-[#4ecfa6]" : "bg-[#7562ed]"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute right-5 top-12 z-[2] rotate-3 bg-white p-3 font-serif text-xs">
            Học kỳ I<br />
            <b className="text-[9px] text-[#7562ed]">Đang diễn ra</b>
          </div>
          <span className="absolute bottom-14 right-8 text-5xl text-[#ffd75e]">✦</span>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="mb-5 font-mono text-[10px] uppercase text-stone-500">
          01 — Tầm nhìn
        </p>
        <h2 className="font-serif text-5xl font-bold tracking-[-.07em] md:text-7xl">
          Học tập không chỉ là<br />
          <em>điểm số.</em>
        </h2>
        <p className="mx-auto mt-7 max-w-sm text-sm leading-7">
          Chúng tôi xây dựng môi trường để mỗi học sinh được lắng nghe, được
          khuyến khích khám phá và tự tin bước vào tương lai.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase text-stone-500">
              01 — Cập nhật
            </p>
            <h2 className="mt-3 font-serif text-5xl tracking-[-.07em]">
              Thông báo & <em>sự kiện</em>
            </h2>
          </div>
          <button onClick={() => go("news")} className="hidden text-xs font-semibold md:block">
            Xem tất cả →
          </button>
        </div>
        <div className="grid gap-7 md:grid-cols-2">
          <div className="bg-white p-7">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-serif text-2xl">Thông báo nhà trường</h3>
              <span className="bg-[#ffd75e] px-2 py-1 font-mono text-[9px]">
                MỚI
              </span>
            </div>
            {announcements.map((item) => (
              <article className="border-t border-stone-200 py-5" key={item.title}>
                <p className="font-mono text-[9px] text-stone-500">
                  {formatDate(item.published_at)}
                </p>
                {item.is_featured && (
                  <span className="mt-2 inline-block bg-[#ffd75e] px-2 py-1 font-mono text-[9px]">
                    ★ Nổi bật
                  </span>
                )}
                <h4 className="mt-2 font-serif text-xl leading-tight">
                  {item.title}
                </h4>
                <p className="mt-2 text-xs leading-5 text-stone-600">
                  {item.excerpt}
                </p>
              </article>
            ))}
          </div>
          <div className="bg-[#a9f2cf] p-7">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-serif text-2xl">Sự kiện sắp tới</h3>
              <span className="bg-white px-2 py-1 font-mono text-[9px]">
                LỊCH
              </span>
            </div>
            {events.map((item) => (
              <article className="border-t border-black/15 py-5" key={item.title}>
                <div className="flex gap-4">
                  <time className="flex h-12 w-12 shrink-0 flex-col items-center justify-center bg-[#7562ed] font-mono text-[9px] text-white">
                    {new Date(item.published_at).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </time>
                  <div>
                    {item.is_featured && (
                      <span className="bg-white px-2 py-1 font-mono text-[9px]">
                        ★ Nổi bật
                      </span>
                    )}
                    <h4 className="font-serif text-xl leading-tight">
                      {item.title}
                    </h4>
                    <p className="mt-2 text-xs leading-5 text-stone-700">
                      {item.excerpt}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-7 px-5 md:grid-cols-3">
        {[
          [
            "bg-[#7562ed]",
            "02 — Học vụ",
            "Mọi thông tin học tập,",
            "rõ ràng",
            "Tra cứu thời khóa biểu, điểm số và lớp học.",
          ],
          [
            "bg-[#a9f2cf]",
            "03 — Tuyển sinh",
            "Khởi đầu hành trình mới",
            "thật nhẹ nhàng.",
            "Đăng ký hồ sơ và nhận số thứ tự online.",
          ],
          [
            "bg-[#ffd75e]",
            "04 — Thư viện",
            "Tri thức mở ra",
            "mỗi ngày.",
            "Kho bài giảng và học liệu số.",
          ],
        ].map(([bg, kicker, title, accent, desc]) => (
          <button
            onClick={() =>
              go(
                kicker.includes("Học vụ")
                  ? "academics"
                  : kicker.includes("Tuyển sinh")
                  ? "admissions"
                  : "library"
              )
            }
            key={kicker}
            className={`p-8 text-left ${bg}`}
          >
            <p className="font-mono text-[10px]">{kicker}</p>
            <h3 className="mt-12 font-serif text-3xl leading-none">
              {title}
              <br />
              <em>{accent}</em>
            </h3>
            <p className="mt-6 text-sm">{desc} →</p>
          </button>
        ))}
      </section>
    </>
  );
}

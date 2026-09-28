import { useEffect, useState } from "react";
import PageTitle from "../components/PageTitle";
import { fetchNews } from "../services/api";

export default function News() {
  const defaultItems = [
    ["TIN TỨC", "Thông báo lịch kiểm tra giữa kỳ", "Lịch kiểm tra và hướng dẫn ôn tập dành cho các khối lớp.", "bg-[#f6a2bd]"],
    ["TIN TỨC", "Ngày hội STEM 2025", "Cùng khám phá khoa học, công nghệ và những ý tưởng sáng tạo.", "bg-[#b7d9fc]"],
    ["TIN TỨC", "Hội thao học sinh cấp trường", "Sân chơi rèn luyện sức khỏe, tinh thần đồng đội.", "bg-[#b8e4bc]"],
  ];
  const [items, setItems] = useState(defaultItems);

  useEffect(() => {
    fetchNews()
      .then((data) => {
        if (data.length) {
          setItems(
            data.map((item, i) => [
              "TIN TỨC",
              item.title,
              item.excerpt || "Thông tin mới nhất từ nhà trường.",
              ["bg-[#f6a2bd]", "bg-[#b7d9fc]", "bg-[#b8e4bc]"][i % 3],
            ])
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <PageTitle
        kicker=""
        title={
          <>
            Từ mái trường<br />
            <em>thân thương.</em>
          </>
        }
        subtitle="Những câu chuyện, thành tích và thông báo mới nhất từ cộng đồng nhà trường."
      />
      <div className="mx-auto grid max-w-6xl gap-7 px-5 pb-24 md:grid-cols-3">
        {items.map(([tag, title, desc, bg]) => (
          <article key={title}>
            <div className={`relative h-60 ${bg} p-5`}>
              <span className="font-mono text-[9px]">{tag}</span>
              <b className="absolute bottom-5 left-5 max-w-[80%] font-serif text-3xl leading-none">
                {title}
              </b>
            </div>
            <p className="mt-5 font-mono text-[9px] text-stone-500">18.09.2025 — Tin tức</p>
            <h3 className="my-2 font-serif text-xl leading-tight">{desc}</h3>
            <button className="font-mono text-[10px]">Đọc thêm ↗</button>
          </article>
        ))}
      </div>
    </>
  );
}

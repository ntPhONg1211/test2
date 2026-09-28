import { useEffect, useState } from "react";
import PageTitle from "../components/PageTitle";
import { fetchSchoolPages } from "../services/api";

const PAGE_ORDER = ["gioi-thieu", "lich-su", "co-so-vat-chat", "doi-ngu"];

export default function About() {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSchoolPages()
      .then((data) => {
        const orderedPages = PAGE_ORDER
          .map((slug) => data.find((page) => page.slug === slug))
          .filter(Boolean);
        setPages(orderedPages);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  const introduction = pages.find((page) => page.slug === "gioi-thieu");
  const detailPages = pages.filter((page) => page.slug !== "gioi-thieu");

  return (
    <>
      <PageTitle
        kicker="01 — Giới thiệu"
        title={
          <>
            {introduction?.title || "Giới thiệu"}<br />
            <em>nhà trường.</em>
          </>
        }
        subtitle={introduction?.body || "Thông tin về hành trình phát triển, cơ sở vật chất và đội ngũ nhà trường."}
      />
      <section className="mx-auto max-w-6xl px-5 pb-24">
        {error ? (
          <p role="alert" className="border-l-2 border-[#e36c55] px-3 py-2 text-sm text-[#b84e3b]">
            {error}
          </p>
        ) : detailPages.length ? (
          <div className="grid gap-6 md:grid-cols-3">
            {detailPages.map((page, index) => (
              <article
                className={index === 1 ? "bg-[#a9f2cf] p-7" : "bg-white p-7"}
                key={page.slug}
              >
                <p className="font-mono text-[10px] uppercase text-stone-500">
                  0{index + 2} — Giới thiệu
                </p>
                <h2 className="mt-4 font-serif text-3xl">{page.title}</h2>
                <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                  {page.body}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-500">Đang tải thông tin nhà trường...</p>
        )}
      </section>
    </>
  );
}

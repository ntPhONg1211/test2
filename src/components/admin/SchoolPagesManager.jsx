import { useEffect, useState } from "react";
import { fetchPages, updatePage } from "../../services/api";

const MANAGED_SLUGS = new Set(["lich-su", "co-so-vat-chat", "doi-ngu"]);

export default function SchoolPagesManager({ onMessage }) {
  const [pages, setPages] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPages = async () => {
    setLoading(true);
    try {
      const allPages = await fetchPages();
      setPages(allPages.filter((page) => MANAGED_SLUGS.has(page.slug)));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const updateLocalPage = (id, field, value) => {
    setPages((current) => current.map((page) =>
      page.id === id ? { ...page, [field]: value } : page
    ));
  };

  const save = async (page) => {
    setSavingId(page.id);
    try {
      const updated = await updatePage(page.id, { title: page.title, body: page.body });
      setPages((current) => current.map((item) => item.id === updated.id ? updated : item));
      onMessage(`Đã cập nhật ${updated.title}.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 bg-white p-6">
        <p className="font-mono text-[10px] uppercase text-stone-500">Trang giới thiệu</p>
        <h2 className="mt-2 font-serif text-2xl">Nội dung nhà trường</h2>
        <p className="mt-2 text-sm text-stone-600">
          Cập nhật trực tiếp lịch sử hình thành, cơ sở vật chất và đội ngũ nhà trường.
        </p>
      </div>
      {loading ? (
        <div className="bg-white p-6 text-sm text-stone-500">Đang tải các trang giới thiệu...</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {pages.map((page) => (
            <article className="bg-white p-6" key={page.id}>
              <label className="font-mono text-[9px] uppercase text-stone-500">
                Tiêu đề
                <input
                  value={page.title}
                  onChange={(event) => updateLocalPage(page.id, "title", event.target.value)}
                  className="mt-3 w-full border-b border-stone-300 py-2 font-serif text-xl outline-none"
                />
              </label>
              <label className="mt-5 block font-mono text-[9px] uppercase text-stone-500">
                Nội dung
                <textarea
                  value={page.body}
                  onChange={(event) => updateLocalPage(page.id, "body", event.target.value)}
                  className="mt-3 h-40 w-full border border-stone-300 p-3 font-sans text-sm outline-none"
                />
              </label>
              <button
                onClick={() => save(page)}
                disabled={savingId === page.id}
                className="mt-5 bg-[#17141f] px-4 py-3 text-xs text-white disabled:cursor-wait disabled:opacity-60"
              >
                {savingId === page.id ? "Đang cập nhật..." : "Cập nhật ↗"}
              </button>
            </article>
          ))}
        </div>
      )}
      {!loading && !pages.length && (
        <div className="mt-5 bg-white p-6 text-sm text-stone-500">
          Chưa có các trang giới thiệu cần quản lý trong cơ sở dữ liệu.
        </div>
      )}
    </div>
  );
}

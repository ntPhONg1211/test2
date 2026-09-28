import { useEffect, useState } from "react";
import {
  createContent,
  deleteContent,
  fetchContents,
  updateContent,
} from "../../services/api";

const EMPTY_FORM = {
  type: "news",
  title: "",
  excerpt: "",
  body: "",
  status: "published",
  isFeatured: false,
};

const TYPE_LABELS = {
  news: "Tin tức",
  announcement: "Thông báo",
  event: "Sự kiện",
};

function createSlug(title) {
  return `${title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${Date.now()}`;
}

export default function ContentManager({ onMessage }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadContents = async () => {
    setLoading(true);
    try {
      setItems(await fetchContents());
    } catch (error) {
      onMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContents();
  }, []);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      const saved = editingId
        ? await updateContent(editingId, payload)
        : await createContent({ ...payload, slug: createSlug(form.title) });

      setItems((current) => editingId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current]);
      onMessage(editingId ? "Đã cập nhật nội dung." : "Đã đăng nội dung mới.");
      resetForm();
    } catch (error) {
      onMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({
      type: item.type,
      title: item.title,
      excerpt: item.excerpt || "",
      body: item.body || "",
      status: item.status,
      isFeatured: item.is_featured,
    });
  };

  const remove = async (item) => {
    if (!window.confirm(`Xóa "${item.title}"? Thao tác này không thể hoàn tác.`)) {
      return;
    }
    try {
      await deleteContent(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editingId === item.id) {
        resetForm();
      }
      onMessage("Đã xóa nội dung.");
    } catch (error) {
      onMessage(error.message);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={submit} className="bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase text-stone-500">Nội dung website</p>
            <h2 className="mt-2 font-serif text-2xl">
              {editingId ? "Chỉnh sửa nội dung" : "Đăng nội dung mới"}
            </h2>
          </div>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs text-[#7562ed]">
              Hủy sửa
            </button>
          )}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="font-mono text-[10px] uppercase text-stone-500">
            Phân loại
            <select
              value={form.type}
              onChange={(event) => updateForm("type", event.target.value)}
              className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
            >
              <option value="news">Tin tức</option>
              <option value="announcement">Thông báo</option>
              <option value="event">Sự kiện</option>
            </select>
          </label>
          <label className="font-mono text-[10px] uppercase text-stone-500">
            Trạng thái
            <select
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
              className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm"
            >
              <option value="published">Xuất bản</option>
              <option value="draft">Bản nháp</option>
              <option value="archived">Lưu trữ</option>
            </select>
          </label>
        </div>

        <label className="mt-5 block font-mono text-[10px] uppercase text-stone-500">
          Tiêu đề
          <input
            required
            value={form.title}
            onChange={(event) => updateForm("title", event.target.value)}
            className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 font-sans text-sm outline-none"
          />
        </label>
        <label className="mt-5 block font-mono text-[10px] uppercase text-stone-500">
          Tóm tắt
          <textarea
            value={form.excerpt}
            onChange={(event) => updateForm("excerpt", event.target.value)}
            className="mt-2 h-20 w-full border border-stone-300 p-3 font-sans text-sm outline-none"
          />
        </label>
        <label className="mt-5 block font-mono text-[10px] uppercase text-stone-500">
          Nội dung
          <textarea
            required
            value={form.body}
            onChange={(event) => updateForm("body", event.target.value)}
            className="mt-2 h-40 w-full border border-stone-300 p-3 font-sans text-sm outline-none"
          />
        </label>
        <label className="mt-5 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.isFeatured}
            onChange={(event) => updateForm("isFeatured", event.target.checked)}
            className="accent-[#7562ed]"
          />
          Ghim nổi bật trên trang chủ
        </label>
        <button
          disabled={saving}
          className="mt-6 bg-[#17141f] px-5 py-3 text-xs text-white disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Đang lưu..." : editingId ? "Cập nhật nội dung ↗" : "Đăng nội dung ↗"}
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">Danh sách nội dung</h2>
          <button onClick={loadContents} className="font-mono text-[10px] text-[#7562ed]">
            Làm mới
          </button>
        </div>
        {loading ? (
          <div className="bg-white p-6 text-sm text-stone-500">Đang tải nội dung...</div>
        ) : items.length ? items.map((item) => (
          <article className="flex flex-wrap items-center justify-between gap-4 bg-white p-5" key={item.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] uppercase text-[#7562ed]">
                  {TYPE_LABELS[item.type]}
                </span>
                {item.is_featured && <span className="bg-[#ffd75e] px-2 py-1 font-mono text-[9px]">★ Nổi bật</span>}
              </div>
              <h3 className="mt-1 font-serif text-xl">{item.title}</h3>
              <p className="mt-1 text-xs text-stone-500">
                {item.status === "published" ? "Đã xuất bản" : item.status === "draft" ? "Bản nháp" : "Lưu trữ"}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => edit(item)} className="border border-stone-300 px-3 py-2 text-[10px]">
                Sửa
              </button>
              <button onClick={() => remove(item)} className="bg-[#f6a2bd] px-3 py-2 text-[10px]">
                Xóa
              </button>
            </div>
          </article>
        )) : (
          <div className="bg-white p-6 text-sm text-stone-500">Chưa có nội dung nào.</div>
        )}
      </div>
    </div>
  );
}

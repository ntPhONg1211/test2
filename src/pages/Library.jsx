import { useEffect, useMemo, useState } from "react";
import PageTitle from "../components/PageTitle";
import { fetchCurrentUser, fetchStudentResources } from "../services/api";

const colorMap = ["bg-[#f6a2bd]", "bg-[#b7d9fc]", "bg-[#b8e4bc]", "bg-[#ffd75e]", "bg-[#f5d7ae]", "bg-[#d5d2ff]"];

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Library() {
  const [user, setUser] = useState(null);
  const [resources, setResources] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const profile = await fetchCurrentUser();
        if (!active) return;
        setUser(profile.user);
        if (profile.user.role === "student") {
          const nextResources = await fetchStudentResources();
          setResources(nextResources);
        }
      } catch (loadError) {
        if (active) setError(loadError.message || "Không thể tải tài liệu.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredResources = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return resources;
    return resources.filter((resource) => {
      const haystack = [
        resource.title,
        resource.description,
        resource.subject_name,
        resource.class_name,
        resource.original_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [resources, search]);

  const downloadResource = async (resource) => {
    try {
      const response = await fetch(`/api/student/resources/${resource.id}/download`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Không thể tải tài liệu.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resource.original_name || resource.title;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || "Không thể tải tài liệu.");
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl px-5 py-24 text-sm text-stone-600">Đang tải tài liệu...</div>;
  }

  const isStudent = user?.role === "student";

  return (
    <>
      <PageTitle
        kicker=""
        title={
          <>
            Tài liệu học tập<br />
            <em>mỗi ngày.</em>
          </>
        }
        subtitle="Tìm kiếm bài giảng, tài liệu ôn tập và học liệu số theo môn học."
      />
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {error && (
          <p role="alert" className="mb-5 border-l-2 border-[#e36c55] bg-white px-4 py-3 text-sm text-[#b84e3b]">
            {error}
          </p>
        )}

        {isStudent ? (
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm kiếm tài liệu theo tên, môn, lớp..."
              className="w-full border-b border-stone-400 bg-transparent px-0 py-4 font-mono text-sm outline-none"
            />

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {filteredResources.length ? (
                filteredResources.map((resource, index) => (
                  <article className={`${colorMap[index % colorMap.length]} p-6`} key={resource.id}>
                    <span className="font-mono text-[10px] uppercase">{resource.mime_type || "FILE"}</span>
                    <h3 className="mt-12 font-serif text-2xl leading-tight">{resource.title}</h3>
                    <p className="mt-4 text-xs">
                      {resource.subject_name || "Môn học"} · {resource.class_name || "Lớp học"} · {formatSize(Number(resource.file_size))}
                    </p>
                    {resource.description && <p className="mt-3 text-xs text-stone-700">{resource.description}</p>}
                    <button
                      type="button"
                      onClick={() => downloadResource(resource)}
                      className="mt-6 border-b border-current pb-1 font-mono text-[10px]"
                    >
                      Xem tài liệu ↗
                    </button>
                  </article>
                ))
              ) : (
                <div className="md:col-span-3 bg-white p-6 text-sm text-stone-600">
                  Chưa có tài liệu nào được chia sẻ cho lớp bạn. Vui lòng chờ giáo viên đăng tài liệu cho môn/lớp tương ứng.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded bg-white p-8 text-sm text-stone-600">
            Bạn cần đăng nhập bằng tài khoản học sinh để xem tài liệu lớp học được chia sẻ.
          </div>
        )}
      </div>
    </>
  );
}

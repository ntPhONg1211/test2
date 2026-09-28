import { useState } from "react";
import PageTitle from "../components/PageTitle";
import { submitContact } from "../services/api";

export default function Contact() {
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", text: "" });

  const submit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setFeedback({ type: "", text: "" });
    try {
      const data = await submitContact({
        senderName: form.get("senderName"),
        senderEmail: form.get("senderEmail"),
        subject: form.get("subject"),
        message: form.get("message"),
      });
      formElement.reset();
      setFeedback({ type: "success", text: `Đã tiếp nhận liên hệ #${data.id}.` });
    } catch (error) {
      setFeedback({ type: "error", text: error.message || "Không gửi được liên hệ. Vui lòng thử lại." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle
        kicker="07 — Liên hệ & Hỏi đáp"
        title={
          <>
            Luôn sẵn sàng<br />
            <em>lắng nghe bạn.</em>
          </>
        }
        subtitle="Gửi câu hỏi đến nhà trường hoặc tìm câu trả lời nhanh trong các câu hỏi thường gặp."
      />
      <div className="mx-auto grid max-w-6xl gap-8 px-5 pb-24 md:grid-cols-2">
        <form
          onSubmit={submit}
          onChange={() => setFeedback({ type: "", text: "" })}
          className="bg-white p-8"
        >
          <h2 className="font-serif text-3xl">Gửi liên hệ</h2>
          <input
            name="senderName"
            required
            placeholder="Họ và tên"
            className="mt-6 block w-full border-b border-stone-300 bg-transparent py-3 text-sm outline-none"
          />
          <input
            name="senderEmail"
            type="email"
            placeholder="Email"
            className="mt-6 block w-full border-b border-stone-300 bg-transparent py-3 text-sm outline-none"
          />
          <input
            name="subject"
            required
            placeholder="Chủ đề"
            className="mt-6 block w-full border-b border-stone-300 bg-transparent py-3 text-sm outline-none"
          />
          <textarea
            name="message"
            required
            placeholder="Nội dung câu hỏi"
            className="mt-6 h-28 w-full border-b border-stone-300 bg-transparent py-3 text-sm outline-none"
          />
          <button disabled={submitting} className="mt-7 bg-[#17141f] px-5 py-3 text-xs text-white disabled:opacity-60">
            {submitting ? "Đang gửi..." : feedback.type === "success" ? "Đã gửi thành công ✓" : "Gửi câu hỏi ↗"}
          </button>
          {feedback.text && (
            <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-4 text-sm ${feedback.type === "error" ? "text-[#b84e3b]" : "text-[#248461]"}`}>
              {feedback.text}
            </p>
          )}
        </form>
        <div className="bg-[#ffd75e] p-8">
          <h2 className="font-serif text-3xl">Câu hỏi thường gặp</h2>
          {["Làm sao để đăng ký tuyển sinh?", "Phụ huynh xem điểm của con ở đâu?", "Tài khoản được cấp như thế nào?"].map(
            (q) => (
              <details
                className="mt-6 border-b border-black/20 pb-4 text-sm"
                key={q}
              >
                <summary className="cursor-pointer font-semibold">{q}</summary>
                <p className="mt-3 text-xs leading-6">
                  Bạn có thể sử dụng cổng thông tin trực tuyến hoặc liên hệ văn
                  phòng nhà trường để được hướng dẫn.
                </p>
              </details>
            )
          )}
        </div>
      </div>
    </>
  );
}

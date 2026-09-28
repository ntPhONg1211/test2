import PageTitle from "../components/PageTitle";

export default function Scores() {
  return (
    <>
      <PageTitle
        kicker=""
        title={
          <>
            Điểm số<br />
            <em>của bạn.</em>
          </>
        }
        subtitle="Tra cứu kết quả học tập và tiến độ các môn học trong học kỳ hiện tại."
      />
      <div className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["Điểm trung bình", "8.7", "border-[#7562ed]"],
            ["Chuyên cần", "96%", "border-[#4ecfa6]"],
            ["Bài tập hoàn thành", "24/28", "border-[#f16f55]"],
          ].map(([label, value, border]) => (
            <div className={`border-l-4 bg-white p-6 ${border}`} key={label}>
              <span className="font-mono text-[10px]">{label}</span>
              <b className="mt-3 block font-serif text-4xl">{value}</b>
            </div>
          ))}
        </div>
        <div className="mt-8 overflow-x-auto bg-white p-7">
          <h2 className="font-serif text-2xl">Kết quả học kỳ I</h2>
          <table className="mt-5 w-full min-w-[520px] text-left text-sm">
            <thead className="border-b font-mono text-[10px] text-stone-500">
              <tr>
                <th className="py-3">Môn học</th>
                <th className="py-3">Miệng</th>
                <th className="py-3">15 phút</th>
                <th className="py-3">Giữa kỳ</th>
                <th className="py-3">Tổng kết</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Toán học", "9.0", "8.5", "9.0", "8.8"],
                ["Ngữ văn", "8.5", "8.0", "9.0", "8.5"],
                ["Tiếng Anh", "9.5", "9.0", "9.2", "9.2"],
              ].map((row) => (
                <tr className="border-b last:border-0" key={row[0]}>
                  {row.map((cell, index) => (
                    <td
                      className={`py-4 ${index === 0 ? "font-serif text-lg" : ""}`}
                      key={`${row[0]}-${cell}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

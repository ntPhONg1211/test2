export default function Footer() {
  return (
    <footer className="mt-16 bg-[#17141f] px-5 py-12 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
        <div className="font-mono text-xs">
          ✦ Trường<br />
          &nbsp;&nbsp;&nbsp;học
        </div>
        <p className="font-serif text-2xl">
          Nuôi dưỡng những<br />
          <em>ước mơ lớn.</em>
        </p>
        <div className="flex flex-col gap-2 font-mono text-[10px]">
          <span className="text-stone-400">Liên hệ</span>
          <a href="mailto:hello@truonghoc.edu.vn">hello@truonghoc.edu.vn</a>
          <a href="tel:02412345678">024 1234 5678</a>
        </div>
      </div>
    </footer>
  );
}

export default function PageTitle({ kicker, title, subtitle }) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-14">
      <p className="mb-5 font-mono text-[10px] uppercase text-stone-500">{kicker}</p>
      <h1 className="max-w-3xl font-serif text-5xl font-bold leading-[.95] tracking-[-.07em] md:text-7xl">
        {title}
      </h1>
      {subtitle && <p className="mt-7 max-w-lg text-sm leading-7 text-stone-600">{subtitle}</p>}
    </div>
  );
}

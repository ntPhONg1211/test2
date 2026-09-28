import { go } from "../utils/navigation";

export default function Button({ children, path = "admissions", light = false, className = "" }) {
  return (
    <button
      onClick={() => go(path)}
      className={`inline-flex items-center justify-between gap-8 px-4 py-3 text-xs font-semibold transition-colors ${
        light ? "bg-white text-[#17141f]" : "bg-[#17141f] text-white"
      } ${className}`}
    >
      {children}
      <span>↗</span>
    </button>
  );
}

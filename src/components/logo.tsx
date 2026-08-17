export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-marca-500 to-verde-400 text-lg font-bold text-white shadow-lg"
      >
        F
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-wide">
          TESOURARIA
        </span>
        <span className="block text-xs uppercase tracking-[0.28em] opacity-70">
          Fonte
        </span>
      </span>
    </div>
  );
}

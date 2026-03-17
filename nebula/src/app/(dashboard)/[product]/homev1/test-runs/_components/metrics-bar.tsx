interface MetricsBarProps {
  passed: number;
  failed: number;
  blocked: number;
}

export function MetricsBar({ passed, failed, blocked }: MetricsBarProps) {
  const total = failed + passed + blocked;

  return (
    <div className="flex flex-col w-5 h-28 rounded-full overflow-hidden relative border  border-gray-300">
      {/* Blocked */}
      {blocked != 0 && (
        <div
          className="bg-gray-400 p-0.5 font-semibold flex items-center justify-center text-xs text-white"
          style={{ height: `${(blocked / total) * 100}%,` }}
        >
          {blocked}
        </div>
      )}

      {/* Failed */}
      {failed != 0 && (
        <div
          className="bg-red-500 p-0.5 font-semibold flex items-center justify-center text-xs text-white"
          style={{ height: `${(failed / total) * 100}%` }}
        >
          {failed}
        </div>
      )}

      {/* Passed */}
      {passed != 0 && (
        <div
          className="bg-emerald-500 p-0.5 font-semibold flex items-center justify-center text-xs text-white"
          style={{ height: `${(passed / total) * 100}%` }}
        >
          {passed}
        </div>
      )}
    </div>
  );
}

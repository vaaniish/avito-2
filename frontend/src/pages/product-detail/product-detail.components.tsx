export function ModalRatingStars({
  value,
  size = 16,
  gap = 1,
}: {
  value: number;
  size?: number;
  gap?: number;
}) {
  return (
    <span className="inline-flex items-center" style={{ gap }} aria-label={`Рейтинг ${value.toFixed(1)}`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fillPercent = Math.max(0, Math.min(1, value - index)) * 100;
        return (
          <span
            key={index}
            className="relative inline-block flex-shrink-0 overflow-hidden"
            style={{ width: size, height: size, fontSize: size, lineHeight: `${size}px` }}
            aria-hidden="true"
          >
            <span className="absolute inset-0 text-gray-300">★</span>
            <span className="absolute inset-0 overflow-hidden text-yellow-400" style={{ width: `${fillPercent}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

import type { ReactNode } from "react";

export function Info({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  const prefersAggressiveWrap =
    value.length > 28 || /[@/\\#]|https?:|vk\.com|t\.me/i.test(value) || /\d{7,}/.test(value);

  return (
    <div className="info-item">
      <div className="info-item-label">
        {icon ? <span className="info-item-icon">{icon}</span> : null}
        <span className="info-item-label-text">{label}</span>
      </div>
      <strong className={prefersAggressiveWrap ? "info-item-value-break" : undefined}>{value}</strong>
    </div>
  );
}

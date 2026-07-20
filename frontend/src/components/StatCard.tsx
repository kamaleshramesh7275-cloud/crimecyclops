type Props = {
  title: string;
  value: string | number;
  icon?: string;
  accent?: string;
};

export default function StatCard({ title, value, icon, accent }: Props) {
  return (
    <div className="stat-card">
      {icon && (
        <div className="stat-icon" style={{ color: accent || '#c084fc' }}>
          {icon}
        </div>
      )}
      <div className="stat-label">{title}</div>
      <div className="stat-value" style={{ color: accent || '#c084fc' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

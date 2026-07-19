type Props = {
  title: string;
  value: string | number;
};

export default function StatCard({ title, value }: Props) {
  return (
    <div style={{ border: '1px solid #d0d7de', borderRadius: 12, padding: 16, background: '#fff' }}>
      <div style={{ fontSize: 12, color: '#57606a' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{value}</div>
    </div>
  );
}

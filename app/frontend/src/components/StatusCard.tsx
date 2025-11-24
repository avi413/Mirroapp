interface Props {
  title: string;
  value: string;
  hint?: string;
}

export const StatusCard = ({ title, value, hint }: Props) => (
  <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
    <div className="text-sm uppercase text-white/50">{title}</div>
    <div className="text-3xl font-semibold mt-2">{value}</div>
    {hint && <div className="text-sm text-white/60 mt-1">{hint}</div>}
  </div>
);

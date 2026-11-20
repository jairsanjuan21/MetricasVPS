export function Barra({ valor, alta = 80 }: { valor: number; alta?: number }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="barra" role="presentation">
      <div className={v >= alta ? "barra__relleno barra__relleno--alta" : "barra__relleno"} style={{ width: `${Math.max(v, 0.5)}%` }} />
    </div>
  );
}

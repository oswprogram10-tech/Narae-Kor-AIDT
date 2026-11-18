export interface Bar {
  id: string;
  label: string;
  value: number;
  color: string;
}

/**
 * 가로 막대그래프(인라인 SVG, 차트 라이브러리 없음). 막대마다 이름표와 값을 글로 직접 적고,
 * 화면 읽기 프로그램을 위해 같은 내용을 표로도 둔다.
 */
export function BarChart({ bars, unit = "분", title, max }: { bars: Bar[]; unit?: string; title: string; max?: number }) {
  const top = Math.max(max ?? 0, ...bars.map((b) => b.value), 1);
  const rowH = 36;
  const labelW = 128;
  const valueW = 72;
  const chartW = 230;
  const h = bars.length * rowH + 8;
  const total = labelW + chartW + valueW;
  return (
    <figure className="w-full max-w-xl">
      <figcaption className="mb-2 font-semibold">{title}</figcaption>
      <svg viewBox={`0 0 ${total} ${h}`} role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${b.value}${unit}`).join(", ")}`} className="w-full" data-testid="bar-chart">
        {bars.map((b, i) => {
          const y = i * rowH + 4;
          const w = Math.max(b.value > 0 ? 3 : 0, (b.value / top) * chartW);
          return (
            <g key={b.id}>
              <text x={labelW - 8} y={y + 23} textAnchor="end" fontSize="17" fill="#44403c">{b.label}</text>
              <rect x={labelW} y={y + 4} width={chartW} height={22} rx={5} fill="#eceae4" />
              <rect x={labelW} y={y + 4} width={w} height={22} rx={5} fill={b.color} data-bar={b.id} />
              <text x={labelW + chartW + 8} y={y + 23} fontSize="17" fontWeight="600" fill="#1f2a26">{b.value}{unit}</text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.id}>
              <th scope="row">{b.label}</th>
              <td>{b.value}{unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

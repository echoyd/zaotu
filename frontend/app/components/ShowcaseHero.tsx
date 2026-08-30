import type { ReactNode } from 'react'

type Metric = { value: number; label: string }
type Props = { actions: ReactNode; dateLabel: string; timeLabel: string; metrics: Metric[]; nextMove: string }

/** Dashboard hero for the public ZAOTU workspace. */
export default function ShowcaseHero({ actions, dateLabel, timeLabel, metrics, nextMove }: Props) {
  return <section className="job-hero">
    <div className="job-panel job-focus"><span className="job-eyebrow">TODAY&apos;S FOCUS</span><h2>ONE RIGHT MOVE<br />&gt; TEN RUSHED ONES.</h2><div className="job-focus-actions">{actions}</div></div>
    <aside className="job-panel job-today"><div className="job-today-top"><div><span className="job-today-kicker">LOCAL WORKSPACE · READY</span><span className="job-today-title">TODAY</span></div><div className="job-today-time"><span>{dateLabel}</span><strong>{timeLabel}</strong></div></div><div className="job-stat-list">{metrics.map(metric => <div className="job-stat" key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div><div className="job-today-next"><span>NEXT MOVE</span><strong>{nextMove}</strong></div></aside>
  </section>
}

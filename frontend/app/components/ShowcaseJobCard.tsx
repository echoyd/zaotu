import type { ReactNode } from 'react'

type Props = {
  title: string
  company?: string | null
  meta?: ReactNode
  score?: ReactNode
  summary?: ReactNode
  skills?: string[]
  children?: ReactNode
  onClick?: () => void
}

/** Visual contract for public ZAOTU job cards. */
export default function ShowcaseJobCard({ title, company, meta, score, summary, skills = [], children, onClick }: Props) {
  return <article className="job-panel job-card" onClick={onClick}>
    <div className="job-card-head"><div><h3>{title}{company && ` · ${company}`}</h3>{meta && <p className="job-card-meta">{meta}</p>}</div>{score && <span className="job-score">{score}</span>}</div>
    {summary && <p className="job-card-copy">{summary}</p>}
    {skills.length > 0 && <div className="job-profile-skills">{skills.map(skill => <span className="job-skill" key={skill}>{skill}</span>)}</div>}
    {children}
  </article>
}

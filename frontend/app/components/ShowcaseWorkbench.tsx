import type { ReactNode } from 'react'

type Props = {
  title: ReactNode
  headAction?: ReactNode
  summary?: ReactNode
  controls?: ReactNode
  children?: ReactNode
  className?: string
}

/** Shared materials-workbench frame. Product-specific actions and data stay in slots. */
export default function ShowcaseWorkbench({ title, headAction, summary, controls, children, className = '' }: Props) {
  return <div className={`job-workbench ${className}`}>
    <div className="job-workbench-head"><strong>{title}</strong>{headAction}</div>
    {summary && <p>{summary}</p>}
    {controls && <div className="job-card-actions job-card-actions--kit">{controls}</div>}
    {children}
  </div>
}

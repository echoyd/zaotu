'use client'

import Link from 'next/link'
import type { IconType } from 'react-icons'
import { BiBriefcaseAlt2, BiLayer } from 'react-icons/bi'

export type ShowcaseNavigationItem = {
  href: string
  label: string
  icon: IconType
  active?: boolean
  count?: number
  onNavigate?: () => void
}

type Props = {
  brand: string
  subtitle: string
  homeHref: string
  homeLabel: string
  markText?: string
  brandStyle?: 'default' | 'zaotu'
  navigation: ShowcaseNavigationItem[]
  captureHref: string
  captureLabel?: string
  onCapture?: () => void
  privacy: string
}

/** Navigation shell for the public ZAOTU workspace. */
export default function ShowcaseSidebar({ brand, subtitle, homeHref, homeLabel, markText, brandStyle = 'default', navigation, captureHref, captureLabel = '添加职位', onCapture, privacy }: Props) {
  const isInternalRoute = (href: string) => href.startsWith('/')
  const mark = brandStyle === 'zaotu'
    ? <span className="job-brand-mark job-brand-mark--zaotu" aria-hidden="true"><svg viewBox="0 0 48 48" role="img"><defs><linearGradient id="zaotu-mark-flow" x1="7" y1="8" x2="42" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#8B5CFF" /><stop offset=".5" stopColor="#2E9CFF" /><stop offset="1" stopColor="#29E0C1" /></linearGradient><linearGradient id="zaotu-mark-sheen" x1="11" y1="8" x2="31" y2="37" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF" stopOpacity=".92" /><stop offset="1" stopColor="#C7F7FF" stopOpacity=".05" /></linearGradient></defs><rect x="2.5" y="2.5" width="43" height="43" rx="15" fill="url(#zaotu-mark-sheen)" /><path d="M10.5 13.2H35.8L15.1 34.8H37.5" fill="none" stroke="url(#zaotu-mark-flow)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5.4" /><circle cx="10.5" cy="13.2" r="3.15" fill="#EFFFFB" stroke="#7D63FF" strokeWidth="1.8" /><path d="M38.2 30.2V38.4M34.1 34.3H42.3" stroke="#EFFFFB" strokeLinecap="round" strokeWidth="1.9" /></svg></span>
    : <span className="job-brand-mark" aria-hidden="true"><i /><b>{markText}</b><em /></span>
  const identity = <><>{mark}</><span><strong>{brand}</strong><small>{subtitle}</small></span></>
  return <aside className="job-sidebar">
    {isInternalRoute(homeHref) ? <Link href={homeHref} className="job-brand" aria-label={homeLabel}>
      {identity}
    </Link> : <a href={homeHref} className="job-brand" aria-label={homeLabel}>
      {identity}
    </a>}
    <nav className="job-nav" aria-label="主导航">
      <p className="job-nav-label">工作空间</p>
      {navigation.map(item => {
        const Icon = item.icon
        const content = <><Icon /><span>{item.label}</span>{typeof item.count === 'number' && <em>{item.count}</em>}</>
        if (isInternalRoute(item.href) && !item.onNavigate) return <Link key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined} className={`job-nav-item ${item.active ? 'is-active' : ''}`}>{content}</Link>
        return <a key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined} onClick={event => { if (!item.onNavigate) return; event.preventDefault(); item.onNavigate() }} className={`job-nav-item ${item.active ? 'is-active' : ''}`}>
          {content}
        </a>
      })}
    </nav>
    <div className="job-sidebar-bottom">
      <p className="job-nav-label">使用方式</p>
      {isInternalRoute(captureHref) && !onCapture ? <Link href={captureHref} className="job-nav-item"><BiBriefcaseAlt2 /><span>{captureLabel}</span></Link> : <a href={captureHref} className="job-nav-item" onClick={event => { if (!onCapture) return; event.preventDefault(); onCapture() }}><BiBriefcaseAlt2 /><span>{captureLabel}</span></a>}
      <div className="job-privacy"><BiLayer /><span>{privacy}</span></div>
    </div>
  </aside>
}

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '造途 ZAOTU｜工程技术求职材料与决策工具',
  description: '把真实工程经历整理为职业资产，结合 JD 生成匹配证据、双视角预审、ATS 与可编辑 Word。',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>
}

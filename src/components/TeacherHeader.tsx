import Link from "next/link";
import { logout } from "@/app/actions/teacher";

export function TeacherHeader({ name, crumbs = [] }: { name: string; crumbs?: { href: string; label: string }[] }) {
  return (
    <header className="border-b border-black/5 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/teacher" className="font-bold text-brand-700">국어나래</Link>
        {crumbs.map((c) => (
          <span key={c.href} className="flex items-center gap-3 text-sm text-stone-500">
            <span>›</span>
            <Link href={c.href} className="hover:text-stone-800">{c.label}</Link>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-stone-500 sm:inline">{name}</span>
          <form action={logout}>
            <button className="text-stone-500 underline hover:text-stone-800">로그아웃</button>
          </form>
        </div>
      </div>
    </header>
  );
}

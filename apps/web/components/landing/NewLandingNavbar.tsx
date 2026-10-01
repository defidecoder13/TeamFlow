'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Show, UserButton } from '@clerk/nextjs';
import { TeamFlowLogo } from '../brand/TeamFlowLogo';

const NAV_ITEMS = [
  { label: 'Product', href: '#product' },
  { label: 'Features', href: '#features' },
  { label: 'Solutions', href: '#solutions' },
] as const;

type NavHref = (typeof NAV_ITEMS)[number]['href'];

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

export function NewLandingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHref, setActiveHref] = useState<NavHref>('#product');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const id = setTimeout(() => firstLinkRef.current?.focus(), 30);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(id);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  // --- Active / hover fix: scroll-spy + instant click feedback ---
  useEffect(() => {
    const ids = NAV_ITEMS.map((i) => i.href.slice(1));
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;

    const syncFromHash = () => {
      const hash = window.location.hash as NavHref | '';
      if (hash && ids.includes(hash.slice(1))) {
        setActiveHref(hash as NavHref);
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveHref(`#${visible.target.id}` as NavHref);
        }
      },
      { rootMargin: '-80px 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, []);

  const closeMenu = () => {
    setMenuOpen(false);
    setTimeout(() => menuButtonRef.current?.focus(), 10);
  };

  const handleNavClick = (href: NavHref) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    setActiveHref(href);
    const el = document.getElementById(href.slice(1));
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', href);
    }
    if (menuOpen) closeMenu();
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b border-[#E2E1E1] bg-[#F8F7F6]/85 shadow-[0_1px_4px_rgba(20,25,35,0.03)] backdrop-blur-md ${FONT_STACK}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-12">
        {/* LEFT: logo */}
        <Link
          href="/"
          aria-label="TeamFlow home"
          className="inline-flex shrink-0 items-center rounded-md text-[#171A21] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5]"
        >
          <TeamFlowLogo size={26} wordmarkClassName="text-[18px] font-semibold tracking-tight text-[#171A21]" />
        </Link>

        {/* CENTER: desktop nav */}
        <nav aria-label="Primary navigation" className="hidden md:block">
          <ul className="flex items-center gap-1 lg:gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={handleNavClick(item.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none',
                      'hover:bg-[#F0EFF2] hover:text-[#171A21] active:bg-[#E9E8EE]',
                      isActive ? 'bg-[#E9E8EE]/70 text-[#171A21] font-semibold' : 'text-[#4F5360]',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5]',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* RIGHT: desktop actions */}
        <div className="hidden items-center gap-4 md:flex">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="rounded px-2.5 py-1.5 text-[13px] font-medium text-[#4F5360] transition-colors hover:bg-[#F0EFF2] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-1.5 rounded-lg bg-black bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white shadow-xs transition-[background-color,scale] duration-150 ease-out-expo hover:bg-[#1F242C] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Start Free
              <span
                aria-hidden="true"
                className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              >
                →
              </span>
            </Link>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>

        {/* MOBILE: hamburger */}
        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="new-landing-mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#171A21] transition-colors hover:bg-[#F0EFF2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] md:hidden motion-reduce:transition-none"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <span className="relative block h-4 w-4" aria-hidden="true">
            <span
              className={[
                'absolute left-0 top-[3px] h-0.5 w-4 rounded bg-current transition-[translate,rotate] duration-200 motion-reduce:transition-none',
                menuOpen ? 'translate-y-[5px] rotate-45' : '',
              ].join(' ')}
            />
            <span
              className={[
                'absolute left-0 top-[8px] h-0.5 w-4 rounded bg-current transition-opacity duration-150 motion-reduce:transition-none',
                menuOpen ? 'opacity-0' : 'opacity-100',
              ].join(' ')}
            />
            <span
              className={[
                'absolute left-0 top-[13px] h-0.5 w-4 rounded bg-current transition-[translate,rotate] duration-200 motion-reduce:transition-none',
                menuOpen ? '-translate-y-[5px] -rotate-45' : '',
              ].join(' ')}
            />
          </span>
        </button>
      </div>

      {/* MOBILE MENU: overlay */}
      <div
        aria-hidden={!menuOpen}
        onClick={closeMenu}
        className={[
          'fixed inset-0 top-16 z-40 bg-[#171A21]/20 backdrop-blur-xs md:hidden',
          'transition-opacity duration-200 motion-reduce:transition-none',
          menuOpen
            ? 'visible pointer-events-auto opacity-100'
            : 'invisible pointer-events-none opacity-0',
        ].join(' ')}
      />

      {/* MOBILE MENU: panel */}
      <div
        id="new-landing-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={[
          'fixed inset-x-4 top-[72px] z-50 origin-top rounded-2xl border border-[#E2E1E1] bg-white p-4 shadow-[0_16px_36px_-4px_rgba(20,25,35,0.12)] md:hidden',
          'transition-[opacity,translate] duration-200 ease-out-expo motion-reduce:transition-none',
          menuOpen
            ? 'visible pointer-events-auto translate-y-0 opacity-100'
            : 'invisible pointer-events-none -translate-y-2 opacity-0',
        ].join(' ')}
      >
        <nav aria-label="Mobile">
          <ul className="flex flex-col">
            {NAV_ITEMS.map((item, idx) => {
              const isActive = activeHref === item.href;
              return (
                <li key={item.label}>
                  <Link
                    ref={idx === 0 ? firstLinkRef : undefined}
                    href={item.href}
                    onClick={handleNavClick(item.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'flex h-11 items-center rounded-lg px-3 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none',
                      'hover:bg-[#F0EFF2] hover:text-[#171A21] active:bg-[#E9E8EE]',
                      isActive ? 'bg-[#E9E8EE]/70 font-semibold text-[#171A21]' : 'text-[#4F5360]',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div aria-hidden="true" className="my-3 h-px bg-[#E2E1E1]" />
          <div className="flex flex-col gap-2">
            <Show when="signed-out">
              <Link
                href="/sign-in"
                onClick={closeMenu}
                className="inline-flex h-11 items-center justify-center rounded-lg px-5 text-[14px] font-medium text-[#171A21] transition-colors hover:bg-[#F0EFF2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                onClick={closeMenu}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-black bg-[#2E3440] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#1F242C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none"
              >
                Start Free <span aria-hidden="true">→</span>
              </Link>
            </Show>
            <Show when="signed-in">
              <div className="flex h-11 items-center justify-center">
                <UserButton />
              </div>
            </Show>
          </div>
        </nav>
      </div>
    </header>
  );
}

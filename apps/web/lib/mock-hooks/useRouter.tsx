import { useRouter as useNextRouter, usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

export function useRouter() {
  const router = useNextRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(() => {
    return {
      pathname: pathname || '/app',
      searchParams: searchParams || new URLSearchParams(),
      currentUrl: `${pathname}?${searchParams?.toString()}`,
      push: router.push,
      replace: router.replace,
    };
  }, [router, pathname, searchParams]);
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

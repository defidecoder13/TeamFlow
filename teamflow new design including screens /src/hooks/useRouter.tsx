import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

interface RouterContextType {
  pathname: string;
  searchParams: URLSearchParams;
  currentUrl: string;
  push: (url: string) => void;
  replace: (url: string) => void;
}

const RouterContext = createContext<RouterContextType | null>(null);

function getInitialUrl(): string {
  if (typeof window === 'undefined') return '/app';
  const path = window.location.pathname;
  if (path === '/' || path === '') {
    return '/app' + window.location.search;
  }
  return path + window.location.search;
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUrl, setCurrentUrl] = useState<string>(getInitialUrl);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname || '/app';
      setCurrentUrl(path + window.location.search);
    };

    window.addEventListener('popstate', handlePopState);
    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.history.replaceState(null, '', '/app');
      setCurrentUrl('/app');
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const push = useCallback((url: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', url);
      setCurrentUrl(url);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  const replace = useCallback((url: string) => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', url);
      setCurrentUrl(url);
    }
  }, []);

  const { pathname, searchParams } = useMemo(() => {
    const [path, search] = currentUrl.split('?');
    const params = new URLSearchParams(search || '');
    return {
      pathname: path || '/app',
      searchParams: params,
    };
  }, [currentUrl]);

  const value = useMemo(
    () => ({
      pathname,
      searchParams,
      currentUrl,
      push,
      replace,
    }),
    [pathname, searchParams, currentUrl, push, replace]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

export function useRouter(): RouterContextType {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}


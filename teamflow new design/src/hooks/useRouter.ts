import { useCallback, useEffect, useMemo, useState } from 'react';

export function useRouter() {
  const [currentUrl, setCurrentUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '/app';
    const path = window.location.pathname;
    if (path === '/' || path === '') {
      return '/app' + window.location.search;
    }
    return path + window.location.search;
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname || '/app';
      setCurrentUrl(path + window.location.search);
    };

    window.addEventListener('popstate', handlePopState);
    // If initially on '/', update URL without reload to '/app'
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

  return {
    pathname,
    searchParams,
    push,
    replace,
  };
}

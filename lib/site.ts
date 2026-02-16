export const SITE_URL = 'https://crypto-compliance-framework.vercel.app' as const;
export const SITE_NAME = 'Crypto Compliance Framework' as const;

export function absoluteUrl(pathname: string): string {
  const safePath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_URL}${safePath}`;
}


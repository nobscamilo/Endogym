import { NextResponse } from 'next/server';

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function proxy(request) {
  const canonicalUrlRaw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!canonicalUrlRaw) return NextResponse.next();

  const currentHostHeader = request.headers.get('host');
  if (!currentHostHeader) return NextResponse.next();

  const currentHost = currentHostHeader.split(':')[0].toLowerCase();
  if (isLocalHost(currentHost)) return NextResponse.next();

  let canonicalUrl;
  try {
    canonicalUrl = new URL(canonicalUrlRaw);
  } catch {
    return NextResponse.next();
  }

  const canonicalHost = canonicalUrl.hostname.toLowerCase();
  if (currentHost === canonicalHost) return NextResponse.next();

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = canonicalUrl.protocol;
  redirectUrl.hostname = canonicalUrl.hostname;
  redirectUrl.port = canonicalUrl.port;

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

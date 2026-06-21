import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public paths that do not require auth
    if (
        pathname.startsWith('/_next') ||
        pathname.includes('/favicon.ico') ||
        pathname === '/login' ||
        pathname === '/api/auth/login' ||
        pathname === '/api/auth/debug' ||
        pathname === '/api/auth/logout'
    ) {
        return NextResponse.next();
    }

    const session = request.cookies.get("session")?.value;
    let payload = null;
    if (session) {
        payload = await verifyToken(session);
    }

    // Redirect to login if not authenticated and trying to access protected route (page or api)
    if (!payload) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    // If authenticated but trying to hit /admin without admin role
    if (pathname.startsWith('/admin') && payload.role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

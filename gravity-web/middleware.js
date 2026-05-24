import { next } from '@vercel/functions';

const ISO_COUNTRY = /^[A-Z]{2}$/;

function resolveCountryCode(request) {
  const raw = request.headers.get('x-vercel-ip-country');
  if (!raw) return 'US';

  const code = raw.trim().toUpperCase();
  return ISO_COUNTRY.test(code) ? code : 'US';
}

export const config = {
  matcher: [
    '/((?!.*\\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2|woff|ttf|otf|eot|wasm|map|json)$).*)',
  ],
};

export default function middleware(request) {
  const countryCode = resolveCountryCode(request);
  const response = next();
  const cookie = `gravity_country=${countryCode}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;

  response.headers.append('Set-Cookie', cookie);

  return response;
}

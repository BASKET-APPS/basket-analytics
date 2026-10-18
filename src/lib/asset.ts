export const basePath = process.env.NODE_ENV === 'production' ? '/basket-analytics' : '';

export function asset(path: string): string {
  if (!path || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${clean}`;
}

export const LOGO_PATH = asset('/club/logo.png');

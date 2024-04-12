import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function absoluteUrl(path: string) {
  // If we're on the client side, return the relative path
  if (typeof window !== "undefined") return path;

  // If the VERCEL_URL environment variable is set, use it to construct the absolute URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}${path}`;

  // If the VERCEL_URL environment variable is not set, use localhost as the base URL for development SSR
  return `http://localhost:3000${path}`;
}


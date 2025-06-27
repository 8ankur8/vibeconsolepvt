import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateLobbyCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export function generateQRCode(url: string): Promise<string> {
  // For now, return a placeholder data URL
  // In a production app, you would use a QR code library like 'qrcode'
  return Promise.resolve(`data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-size="12">QR Code for: ${encodeURIComponent(url)}</text></svg>`);
}
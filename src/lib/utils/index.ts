import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges CSS class names with tailwind classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number to standard financial Indian style (Lakhs/Crores) or millions/billions.
 */
export function formatCurrency(value: number, currency = 'INR', style: 'short' | 'full' = 'short'): string {
  if (currency === 'INR') {
    if (style === 'short') {
      if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
      if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: value >= 1000000 ? 'compact' : 'standard'
  }).format(value);
}

/**
 * Formats a percentage value.
 */
export function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

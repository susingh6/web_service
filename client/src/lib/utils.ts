import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date to a human-readable string
 * Shows "Today, hh:mm a" for today, "Yesterday, hh:mm a" for yesterday, or "MMM d, yyyy" for older dates
 * @param date Date to format (Date object or string)
 * @returns Formatted date string
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date';
  }
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  try {
    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();
    const dateObjStr = dateObj.toDateString();
    
    if (dateObjStr === todayStr) {
      return `Today, ${format(dateObj, 'hh:mm a')}`;
    } else if (dateObjStr === yesterdayStr) {
      return `Yesterday, ${format(dateObj, 'hh:mm a')}`;
    } else {
      return format(dateObj, 'MMM d, yyyy');
    }
  } catch (error) {
    return format(dateObj, 'MMM d, yyyy');
  }
}

/**
 * Format a duration in seconds to a human-readable string
 * @param seconds Duration in seconds
 * @returns Formatted duration string (e.g. "2h 30m" or "45s")
 */
export function formatDuration(seconds: number): string {
  if (!seconds && seconds !== 0) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  let result = '';
  
  if (hours > 0) {
    result += `${hours}h `;
  }
  
  if (minutes > 0 || hours > 0) {
    result += `${minutes}m `;
  }
  
  if (remainingSeconds > 0 || (hours === 0 && minutes === 0)) {
    result += `${remainingSeconds}s`;
  }
  
  return result.trim();
}

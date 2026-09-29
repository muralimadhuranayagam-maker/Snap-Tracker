import React from 'react';

export interface SnapLogoProps {
  size?: number;
  className?: string;
  variant?: 'original' | 'adaptive' | 'white';
}

export const SnapLogo: React.FC<SnapLogoProps> = ({
  size = 28,
  className = '',
  variant = 'adaptive',
}) => {
  if (variant === 'white') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="SnapServe Logo"
      >
        <rect x="5" y="15" width="70" height="20" rx="10" fill="#FFFFFF" />
        <rect x="15" y="40" width="70" height="20" rx="10" fill="rgba(255, 255, 255, 0.72)" />
        <rect x="25" y="65" width="70" height="20" rx="10" fill="rgba(255, 255, 255, 0.45)" />
      </svg>
    );
  }

  if (variant === 'original') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="SnapServe Logo"
      >
        <rect x="5" y="15" width="70" height="20" rx="10" fill="#000000" />
        <rect x="15" y="40" width="70" height="20" rx="10" fill="#666666" />
        <rect x="25" y="65" width="70" height="20" rx="10" fill="#A3A3A3" />
      </svg>
    );
  }

  // Adaptive for light and dark backgrounds
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`snap-logo ${className}`}
      aria-label="SnapServe Logo"
    >
      <rect x="5" y="15" width="70" height="20" rx="10" className="snap-logo-bar-1" fill="#0F172A" />
      <rect x="15" y="40" width="70" height="20" rx="10" className="snap-logo-bar-2" fill="#64748B" />
      <rect x="25" y="65" width="70" height="20" rx="10" className="snap-logo-bar-3" fill="#94A3B8" />
    </svg>
  );
};

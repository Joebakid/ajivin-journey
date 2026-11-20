// app/components/Container.tsx
import { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export default function Container({ children, className = '' }: ContainerProps) {
  return (
    <div className={`w-full max-w-5xl mx-auto px-1 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
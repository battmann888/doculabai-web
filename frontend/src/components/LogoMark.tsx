import logo from '@/assets/logo.png';

interface LogoMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-[4.5rem] w-[4.5rem]',
} as const;

export function LogoMark({ size = 'sm', className = '' }: LogoMarkProps) {
  return (
    <div
      className={`logo-mark ${SIZE_MAP[size]} ${className}`}
      aria-hidden={false}
    >
      <img
        src={logo}
        alt="DoculabAI"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';

interface AvatarImageProps {
  src?: string | null;
  name: string;
  className: string;
  size?: number;
  background?: string;
  color?: string;
}

const buildFallbackAvatarUrl = (
  name: string,
  size: number,
  background: string,
  color: string
): string => (
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${background}&color=${color}&size=${size}`
);

export const AvatarImage = ({
  src,
  name,
  className,
  size = 64,
  background = '171717',
  color = 'fafafa',
}: AvatarImageProps) => {
  const fallbackSrc = useMemo(
    () => buildFallbackAvatarUrl(name, size, background, color),
    [name, size, background, color]
  );
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc);

  useEffect(() => {
    setCurrentSrc(src || fallbackSrc);
  }, [src, fallbackSrc]);

  const handleError = () => {
    setCurrentSrc((value) => (value === fallbackSrc ? value : fallbackSrc));
  };

  return (
    <img
      src={currentSrc}
      alt={name}
      className={className}
      onError={handleError}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
};

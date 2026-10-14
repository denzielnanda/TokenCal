import mark from '../assets/brand/mark.json';
export default function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path className="brand-t" d={mark.t} fill="currentColor" />
      <path className="brand-c" d={mark.c} fill="#397dff" />
    </svg>
  );
}

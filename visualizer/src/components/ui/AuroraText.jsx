export default function AuroraText({ children, className = '' }) {
  return <span className={`aurora-text ${className}`.trim()}>{children}</span>;
}

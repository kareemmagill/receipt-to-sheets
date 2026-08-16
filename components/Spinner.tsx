export function Spinner({ style }: { style?: React.CSSProperties }) {
  return <span className="spinner" style={{ marginRight: 8, verticalAlign: -2, ...style }} />;
}

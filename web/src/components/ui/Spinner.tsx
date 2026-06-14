export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-label={label}>
      <span className="spinner__ring" />
    </div>
  );
}

import './shell.css';

interface EmbedShellProps {
  children: React.ReactNode;
}

export function EmbedShell({ children }: EmbedShellProps) {
  return <div className="embed-shell">{children}</div>;
}

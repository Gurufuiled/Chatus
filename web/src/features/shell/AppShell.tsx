import './shell.css';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return <div className="app-shell">{children}</div>;
}

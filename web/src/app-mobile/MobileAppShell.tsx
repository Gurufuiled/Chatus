import './mobile-app.css';

interface MobileAppShellProps {
  children: React.ReactNode;
}

export function MobileAppShell({ children }: MobileAppShellProps) {
  return (
    <div className="mobile-app">
      <div className="mobile-app-shell">
        <div className="mobile-app-shell__inner">{children}</div>
      </div>
    </div>
  );
}

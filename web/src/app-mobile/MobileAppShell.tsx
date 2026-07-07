import './mobile-app.css';
import { useMobileAppearance } from './hooks/useMobileAppearance';

interface MobileAppShellProps {
  children: React.ReactNode;
}

export function MobileAppShell({ children }: MobileAppShellProps) {
  useMobileAppearance();

  return (
    <div className="mobile-app">
      <div className="mobile-app-shell">
        <div className="mobile-app-shell__inner">{children}</div>
      </div>
    </div>
  );
}

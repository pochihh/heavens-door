import { AppBoundary } from './Recovery';
import { createRoot } from 'react-dom/client';
import { App, session } from './App';
import './styles.css';

session.connectWindow();
void session.resume().catch(() => undefined);
createRoot(document.getElementById('root')!).render(<AppBoundary session={session}><App/></AppBoundary>);

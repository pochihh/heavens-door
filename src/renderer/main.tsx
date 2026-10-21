import { ui } from '../text/ui';
import { AppBoundary } from './Recovery';
import { createRoot } from 'react-dom/client';
import { App, session } from './App';
import 'katex/dist/katex.min.css';
import './styles.css';
import {installScrollbarSpace} from './scrollbar-space';

const disposeScrollbarSpace=installScrollbarSpace();
if(import.meta.hot)import.meta.hot.dispose(disposeScrollbarSpace);

document.title=ui.common.appName;
session.connectWindow();
void session.resume().catch(() => undefined);
createRoot(document.getElementById('root')!).render(<AppBoundary session={session}><App/></AppBoundary>);

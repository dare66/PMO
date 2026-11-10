import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { SessionProvider, useSession } from './lib/session';
import { ToastProvider, LoadingBlock, Empty } from './components/ui';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
// Route-level code splitting: each page module is fetched on first visit.
const lz = <M extends Record<string, any>>(load: () => Promise<M>, name: keyof M) => lazy(() => load().then((m) => ({ default: m[name] as ComponentType<any> })));
const CommandCentre = lz(() => import('./pages/CommandCentre'), 'CommandCentre');
const ProjectsList = lz(() => import('./pages/Projects'), 'ProjectsList');
const ProjectWorkspace = lz(() => import('./pages/Projects'), 'ProjectWorkspace');
const ProductsList = lz(() => import('./pages/Products'), 'ProductsList');
const ProductWorkspace = lz(() => import('./pages/Products'), 'ProductWorkspace');
const DiscoveryPage = lz(() => import('./pages/Products'), 'DiscoveryPage');
const ChangesPage = lz(() => import('./pages/Delivery'), 'ChangesPage');
const MyWork = lz(() => import('./pages/Delivery'), 'MyWork');
const OperationsPage = lz(() => import('./pages/Delivery'), 'OperationsPage');
const QualityPage = lz(() => import('./pages/Delivery'), 'QualityPage');
const RaidPage = lz(() => import('./pages/Delivery'), 'RaidPage');
const BiaDetail = lz(() => import('./pages/Resilience'), 'BiaDetail');
const ProcessesPage = lz(() => import('./pages/Resilience'), 'ProcessesPage');
const ResiliencePage = lz(() => import('./pages/Resilience'), 'ResiliencePage');
const FinancePage = lz(() => import('./pages/Enterprise'), 'FinancePage');
const PortfolioPage = lz(() => import('./pages/Enterprise'), 'PortfolioPage');
const ProgrammesPage = lz(() => import('./pages/Enterprise'), 'ProgrammesPage');
const ResourcesPage = lz(() => import('./pages/Enterprise'), 'ResourcesPage');
const StrategyPage = lz(() => import('./pages/Enterprise'), 'StrategyPage');
const AdminPage = lz(() => import('./pages/Knowledge'), 'AdminPage');
const AiPage = lz(() => import('./pages/Knowledge'), 'AiPage');
const ArchitecturePage = lz(() => import('./pages/Knowledge'), 'ArchitecturePage');
const DocumentsPage = lz(() => import('./pages/Knowledge'), 'DocumentsPage');
const GovernancePage = lz(() => import('./pages/Knowledge'), 'GovernancePage');
const ResourcePage = lz(() => import('./pages/Knowledge'), 'ResourcePage');
const VendorsPage = lz(() => import('./pages/Knowledge'), 'VendorsPage');
const DemandPage = lz(() => import('./pages/Frs'), 'DemandPage');

function App() {
  const { me, loading, can } = useSession();
  if (loading) return <div style={{ padding: 40 }}><LoadingBlock rows={6} /></div>;
  if (!me) return <Login />;
  return (
    <Shell>
      <Suspense fallback={<div style={{ padding: 24 }}><LoadingBlock rows={6} /></div>}>
      <Routes>
        <Route path="/" element={can('dashboard:read') ? <CommandCentre /> : <MyWork />} />
        <Route path="/my-work" element={<MyWork />} />
        <Route path="/strategy" element={<StrategyPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/demand" element={<DemandPage />} />
        <Route path="/programmes" element={<ProgrammesPage />} />
        <Route path="/projects" element={<ProjectsList />} />
        <Route path="/projects/:id" element={<ProjectWorkspace />} />
        <Route path="/products" element={<ProductsList />} />
        <Route path="/products/:id" element={<ProductWorkspace />} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/raid" element={<RaidPage />} />
        <Route path="/changes" element={<ChangesPage />} />
        <Route path="/quality" element={<QualityPage />} />
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/resilience" element={<ResiliencePage />} />
        <Route path="/resilience/bia/:id" element={<BiaDetail />} />
        <Route path="/processes" element={<ProcessesPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/architecture" element={<ArchitecturePage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/r/:key" element={<ResourcePage />} />
        <Route path="*" element={<Empty title="Page not found" art="search" />} />
      </Routes>
      </Suspense>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><SessionProvider><ToastProvider><App /></ToastProvider></SessionProvider></BrowserRouter></StrictMode>,
);

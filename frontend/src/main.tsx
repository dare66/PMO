import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { SessionProvider, useSession } from './lib/session';
import { ToastProvider, LoadingBlock, Empty } from './components/ui';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { CommandCentre } from './pages/CommandCentre';
import { ProjectsList, ProjectWorkspace } from './pages/Projects';
import { ProductsList, ProductWorkspace, DiscoveryPage } from './pages/Products';
import { ChangesPage, MyWork, OperationsPage, QualityPage, RaidPage } from './pages/Delivery';
import { BiaDetail, ProcessesPage, ResiliencePage } from './pages/Resilience';
import { FinancePage, PortfolioPage, ProgrammesPage, ResourcesPage, StrategyPage } from './pages/Enterprise';
import { AdminPage, AiPage, ArchitecturePage, DocumentsPage, GovernancePage, ResourcePage, VendorsPage } from './pages/Knowledge';

function App() {
  const { me, loading, can } = useSession();
  if (loading) return <div style={{ padding: 40 }}><LoadingBlock rows={6} /></div>;
  if (!me) return <Login />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={can('dashboard:read') ? <CommandCentre /> : <MyWork />} />
        <Route path="/my-work" element={<MyWork />} />
        <Route path="/strategy" element={<StrategyPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
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
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><SessionProvider><ToastProvider><App /></ToastProvider></SessionProvider></BrowserRouter></StrictMode>,
);

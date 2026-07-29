import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { PlatformProtectedRoute } from '@/components/common/PlatformProtectedRoute';
import { ApprovalGate } from '@/components/common/ApprovalGate';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LoginPage } from '@/pages/Auth/LoginPage';
import { RegisterPage } from '@/pages/Auth/RegisterPage';
import { PlatformLoginPage } from '@/pages/Admin/PlatformLoginPage';
import { PlatformAdminLayout } from '@/components/layout/PlatformAdminLayout';
import { PlatformDashboardPage } from '@/pages/Admin/PlatformDashboardPage';
import { PlatformCompaniesPage } from '@/pages/Admin/PlatformCompaniesPage';
import { PlatformBranchesPage } from '@/pages/Admin/PlatformBranchesPage';
import { PlatformStaffPage } from '@/pages/Admin/PlatformStaffPage';
import { CompanyDetailPage } from '@/pages/Admin/CompanyDetailPage';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage';
import { InventoryHomePage } from '@/pages/Inventory/InventoryHomePage';
import { ProductsPage } from '@/pages/Inventory/ProductsPage';
import { CatalogSettingsPage } from '@/pages/Inventory/CatalogSettingsPage';
import { WarehousesPage } from '@/pages/Warehouse/WarehousesPage';
import { StockPage } from '@/pages/Warehouse/StockPage';
import { StockAdjustmentPage } from '@/pages/Warehouse/StockAdjustmentPage';
import { VanLoadingHomePage } from '@/pages/Van/VanLoadingHomePage';
import { VanLoadingPage } from '@/pages/Van/VanLoadingPage';
import { VansPage } from '@/pages/Van/VansPage';
import { VanUnloadingPage } from '@/pages/Van/VanUnloadingPage';
import { SalesHomePage } from '@/pages/Sales/SalesHomePage';
import { POSPage } from '@/pages/Sales/POSPage';
import { SalesHistoryPage } from '@/pages/Sales/SalesHistoryPage';
import { CollectionsPage } from '@/pages/Collections/CollectionsPage';
import { ReturnsPage } from '@/pages/Returns/ReturnsPage';
import { PaymentsPage } from '@/pages/Payments/PaymentsPage';
import { GpsTrackingPage } from '@/pages/Gps/GpsTrackingPage';
import { RoutesPage } from '@/pages/Routes/RoutesPage';
import { VisitsPage } from '@/pages/Routes/VisitsPage';
import { PurchasesHomePage } from '@/pages/Purchases/PurchasesHomePage';
import { PurchaseOrdersPage } from '@/pages/Purchases/PurchaseOrdersPage';
import { GoodsReceiptsPage } from '@/pages/Purchases/GoodsReceiptsPage';
import { AccountingHomePage } from '@/pages/Accounting/AccountingHomePage';
import { PLSummaryPage } from '@/pages/Accounting/PLSummaryPage';
import { ExpensesPage } from '@/pages/Accounting/ExpensesPage';
import { CompanySettingsPage } from '@/pages/Settings/CompanySettingsPage';
import { lazy, Suspense } from 'react';
const ReportsPage = lazy(() => import('@/pages/Reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));

export default function App() {
  const { loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/platform-admin/login" element={<PlatformLoginPage />} />
        <Route element={<PlatformProtectedRoute />}>
          <Route path="/platform-admin" element={<PlatformAdminLayout />}>
            <Route index element={<PlatformDashboardPage />} />
            <Route path="companies" element={<PlatformCompaniesPage />} />
            <Route path="companies/:companyId" element={<CompanyDetailPage />} />
            <Route path="branches" element={<PlatformBranchesPage />} />
            <Route path="staff" element={<PlatformStaffPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<ApprovalGate />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<DashboardPage />} />

            <Route path="inventory" element={<InventoryHomePage />}>
              <Route index element={<ProductsPage />} />
              <Route path="catalog" element={<CatalogSettingsPage />} />
            </Route>

            <Route path="warehouse" element={<WarehousesPage />} />
            <Route path="warehouse/stock/:warehouseId" element={<StockPage />} />
            <Route path="warehouse/adjustments/:warehouseId" element={<StockAdjustmentPage />} />

            <Route path="van-loading" element={<VanLoadingHomePage />}>
              <Route index element={<VanLoadingPage />} />
              <Route path="vans" element={<VansPage />} />
            </Route>
            <Route path="van-unloading" element={<VanUnloadingPage />} />

            <Route path="sales" element={<SalesHomePage />}>
              <Route index element={<POSPage />} />
              <Route path="history" element={<SalesHistoryPage />} />
            </Route>

            <Route path="routes" element={<RoutesPage />} />
            <Route path="visits" element={<VisitsPage />} />
            <Route path="purchases" element={<PurchasesHomePage />}>
              <Route index element={<PurchaseOrdersPage />} />
              <Route path="receipts" element={<GoodsReceiptsPage />} />
            </Route>
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="returns" element={<ReturnsPage />} />

            <Route path="accounting" element={<AccountingHomePage />}>
              <Route index element={<PLSummaryPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
            </Route>

            {/* Phase 7+ modules — routed so navigation never 404s, built out next */}
            <Route path="reports" element={
              <Suspense fallback={<LoadingScreen label="Loading reports…" />}>
                <ReportsPage />
              </Suspense>
            } />
            <Route path="hr" element={<PlaceholderPage title="HR" />} />
            <Route path="gps" element={<GpsTrackingPage />} />
            <Route path="settings" element={<CompanySettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LoginPage } from '@/pages/Auth/LoginPage';
import { RegisterPage } from '@/pages/Auth/RegisterPage';
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

export default function App() {
  const { loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
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

            {/* Phase 4+ modules — routed so navigation never 404s, built out next */}
            <Route path="routes" element={<PlaceholderPage title="Route Planning" />} />
            <Route path="visits" element={<PlaceholderPage title="Customer Visits" />} />
            <Route path="purchases" element={<PlaceholderPage title="Purchases" />} />
            <Route path="payments" element={<PlaceholderPage title="Payments" />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="returns" element={<ReturnsPage />} />

            {/* Phase 5+ modules — routed so navigation never 404s, built out next */}
            <Route path="accounting" element={<PlaceholderPage title="Accounting" />} />
            <Route path="reports" element={<PlaceholderPage title="Reports" />} />
            <Route path="hr" element={<PlaceholderPage title="HR" />} />
            <Route path="gps" element={<PlaceholderPage title="GPS Tracking" />} />
            <Route path="settings" element={<PlaceholderPage title="Settings" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}

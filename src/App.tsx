import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { PlatformProtectedRoute } from '@/components/common/PlatformProtectedRoute';
import { ApprovalGate } from '@/components/common/ApprovalGate';
import { LoadingScreen } from '@/components/common/LoadingScreen';
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
import { QuickScanPage } from '@/pages/Inventory/QuickScanPage';
import { ProductsPage } from '@/pages/Inventory/ProductsPage';
import { CatalogSettingsPage } from '@/pages/Inventory/CatalogSettingsPage';
import { SerialsPage } from '@/pages/Inventory/SerialsPage';
const LabelPrintingPage = lazy(() => import('@/pages/Inventory/LabelPrintingPage').then((m) => ({ default: m.LabelPrintingPage })));
import { WarehousesPage } from '@/pages/Warehouse/WarehousesPage';
import { WarehouseHomePage } from '@/pages/Warehouse/WarehouseHomePage';
import { WarehouseLocationsPage } from '@/pages/Warehouse/WarehouseLocationsPage';
import { StockTransferPage } from '@/pages/Warehouse/StockTransferPage';
import { StockPage } from '@/pages/Warehouse/StockPage';
import { StockAdjustmentPage } from '@/pages/Warehouse/StockAdjustmentPage';
import { VanLoadingHomePage } from '@/pages/Van/VanLoadingHomePage';
import { VanLoadingPage } from '@/pages/Van/VanLoadingPage';
import { VansPage } from '@/pages/Van/VansPage';
import { VanDetailPage } from '@/pages/Van/VanDetailPage';
import { VanStaffReportPage } from '@/pages/Van/VanStaffReportPage';
import { VanUnloadingPage } from '@/pages/Van/VanUnloadingPage';
import { SalesHomePage } from '@/pages/Sales/SalesHomePage';
import { SalesOrdersListPage } from '@/pages/Sales/SalesOrdersListPage';
import { SalesOrderEntryPage } from '@/pages/Sales/SalesOrderEntryPage';
import { SalesOrderDetailPage } from '@/pages/Sales/SalesOrderDetailPage';
import { ApprovalQueuePage } from '@/pages/Sales/ApprovalQueuePage';
import { OrderControlReportsPage } from '@/pages/Sales/OrderControlReportsPage';
import { SyncConflictsPage } from '@/pages/Sales/SyncConflictsPage';
import { SalesInvoicesListPage } from '@/pages/Sales/SalesInvoicesListPage';
import { SalesInvoiceEntryPage } from '@/pages/Sales/SalesInvoiceEntryPage';
import { SalesInvoiceDetailPage } from '@/pages/Sales/SalesInvoiceDetailPage';
import { InvoiceReportsPage } from '@/pages/Sales/InvoiceReportsPage';
import { VoidRequestsPage } from '@/pages/Sales/VoidRequestsPage';
import { InvoiceSyncConflictsPage } from '@/pages/Sales/InvoiceSyncConflictsPage';
import { SalesReturnEntryPage } from '@/pages/Sales/SalesReturnEntryPage';
import { SalesReturnsListPage } from '@/pages/Sales/SalesReturnsListPage';
import { SalesReturnDetailPage } from '@/pages/Sales/SalesReturnDetailPage';
import { ReturnSyncConflictsPage } from '@/pages/Sales/ReturnSyncConflictsPage';
import { ReturnReportsPage } from '@/pages/Sales/ReturnReportsPage';
import { ReturnReversalQueuePage } from '@/pages/Sales/ReturnReversalQueuePage';
import { ReplacementOrdersPage } from '@/pages/Sales/ReplacementOrdersPage';
import { CashRefundRequestsPage } from '@/pages/Sales/CashRefundRequestsPage';
import { CreditNoteAllocationPage } from '@/pages/Sales/CreditNoteAllocationPage';
import { ReturnOfflineAcceptancePage } from '@/pages/Sales/ReturnOfflineAcceptancePage';
import { CollectionsHomePage } from '@/pages/Collections/CollectionsHomePage';
import { ReceiptVouchersListPage } from '@/pages/Collections/ReceiptVouchersListPage';
import { ReceiptEntryPage } from '@/pages/Collections/ReceiptEntryPage';
import { ReceiptVoucherDetailPage } from '@/pages/Collections/ReceiptVoucherDetailPage';
import { ReceiptSyncConflictsPage } from '@/pages/Collections/ReceiptSyncConflictsPage';
import { PaymentPromisesPage } from '@/pages/Collections/PaymentPromisesPage';
import { ReceiptReportsPage } from '@/pages/Collections/ReceiptReportsPage';
import { RouteCollectionPage } from '@/pages/Collections/RouteCollectionPage';
import { ReversalQueuePage } from '@/pages/Collections/ReversalQueuePage';
import { AdvanceUnallocatedPage } from '@/pages/Collections/AdvanceUnallocatedPage';
import { ChequeDepositBatchPage } from '@/pages/Collections/ChequeDepositBatchPage';
import { CustomerMasterPage } from '@/pages/Sales/CustomerMasterPage';
import { CreditDashboardPage } from '@/pages/Sales/CreditDashboardPage';
import { PriceListsPage } from '@/pages/Sales/PriceListsPage';
import { PricingDashboardPage } from '@/pages/Sales/PricingDashboardPage';
import { CustomerProfilePage } from '@/pages/Sales/CustomerProfilePage';
import { POSPage } from '@/pages/Sales/POSPage';
import { SalesHistoryPage } from '@/pages/Sales/SalesHistoryPage';
import { CollectionsPage } from '@/pages/Collections/CollectionsPage';
import { ReturnsPage } from '@/pages/Returns/ReturnsPage';
import { PaymentsPage } from '@/pages/Payments/PaymentsPage';
import { GpsTrackingPage } from '@/pages/Gps/GpsTrackingPage';
import { GpsHomePage } from '@/pages/Gps/GpsHomePage';
const GpsHistoryPage = lazy(() => import('@/pages/Gps/GpsHistoryPage').then((m) => ({ default: m.GpsHistoryPage })));
import { FuelManagementPage } from '@/pages/Van/FuelManagementPage';
import { MaintenancePage } from '@/pages/Van/MaintenancePage';
import { DailyVanOperationsPage } from '@/pages/Van/DailyVanOperationsPage';
import { VanTransferPage } from '@/pages/Van/VanTransferPage';
import { DeviceManagementPage } from '@/pages/Settings/DeviceManagementPage';
import { PrintSettingsPage } from '@/pages/Settings/PrintSettingsPage';
import { DeviceReportsPage } from '@/pages/Settings/DeviceReportsPage';
import { SyncManagementPage } from '@/pages/Settings/SyncManagementPage';
import { CustomerMasterSettingsPage } from '@/pages/Settings/CustomerMasterSettingsPage';
import { CreditSettingsPage } from '@/pages/Settings/CreditSettingsPage';
import { GeofencesPage } from '@/pages/Gps/GeofencesPage';
import { VehicleAlertsPage } from '@/pages/Gps/VehicleAlertsPage';
import { StaffPage } from '@/pages/HR/StaffPage';
import { HRHomePage } from '@/pages/HR/HRHomePage';
import { DriverManagementPage } from '@/pages/HR/DriverManagementPage';
import { SalesmanManagementPage } from '@/pages/HR/SalesmanManagementPage';
import { RoutesPage } from '@/pages/Routes/RoutesPage';
import { VisitsPage } from '@/pages/Routes/VisitsPage';
import { BeatPlansPage } from '@/pages/Routes/BeatPlansPage';
import { BeatPlanDetailPage } from '@/pages/Routes/BeatPlanDetailPage';
import { DailyVisitPlansPage } from '@/pages/Routes/DailyVisitPlansPage';
import { DailyVisitPlanDetailPage } from '@/pages/Routes/DailyVisitPlanDetailPage';
import { RouteExecutionPage } from '@/pages/Routes/RouteExecutionPage';
import { SupervisorMonitoringPage } from '@/pages/Routes/SupervisorMonitoringPage';
import { RouteReportsPage } from '@/pages/Routes/RouteReportsPage';
import { PurchasesHomePage } from '@/pages/Purchases/PurchasesHomePage';
import { PurchaseOrdersPage } from '@/pages/Purchases/PurchaseOrdersPage';
import { GoodsReceiptsPage } from '@/pages/Purchases/GoodsReceiptsPage';
import { AccountingHomePage } from '@/pages/Accounting/AccountingHomePage';
import { PLSummaryPage } from '@/pages/Accounting/PLSummaryPage';
import { ExpensesPage } from '@/pages/Accounting/ExpensesPage';
import { CompanySettingsPage } from '@/pages/Settings/CompanySettingsPage';
import { SettingsHomePage } from '@/pages/Settings/SettingsHomePage';
import { SecuritySettingsPage } from '@/pages/Settings/SecuritySettingsPage';
import { RolesPermissionsPage } from '@/pages/Settings/RolesPermissionsPage';
import { LoginHistoryPage } from '@/pages/Settings/LoginHistoryPage';
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
              <Route path="serials" element={<SerialsPage />} />
              <Route path="labels" element={
                <Suspense fallback={<LoadingScreen label="Loading label printing…" />}>
                  <LabelPrintingPage />
                </Suspense>
              } />
              <Route path="quick-scan" element={<QuickScanPage />} />
            </Route>

            <Route path="warehouse" element={<WarehouseHomePage />}>
              <Route index element={<WarehousesPage />} />
              <Route path="locations" element={<WarehouseLocationsPage />} />
              <Route path="transfers" element={<StockTransferPage />} />
            </Route>
            <Route path="warehouse/stock/:warehouseId" element={<StockPage />} />
            <Route path="warehouse/adjustments/:warehouseId" element={<StockAdjustmentPage />} />

            <Route path="van-loading" element={<VanLoadingHomePage />}>
              <Route index element={<VanLoadingPage />} />
              <Route path="vans" element={<VansPage />} />
              <Route path="staff-report" element={<VanStaffReportPage />} />
              <Route path="fuel" element={<FuelManagementPage />} />
              <Route path="maintenance" element={<MaintenancePage />} />
              <Route path="daily-operations" element={<DailyVanOperationsPage />} />
              <Route path="van-transfers" element={<VanTransferPage />} />
            </Route>
            <Route path="van-loading/vans/:vanId" element={<VanDetailPage />} />
            <Route path="van-unloading" element={<VanUnloadingPage />} />

            <Route path="customers" element={<CustomerMasterPage />} />
            <Route path="customers/credit-dashboard" element={<CreditDashboardPage />} />
            <Route path="customers/price-lists" element={<PriceListsPage />} />
            <Route path="customers/pricing-dashboard" element={<PricingDashboardPage />} />
            <Route path="customers/:customerId" element={<CustomerProfilePage />} />

            <Route path="sales" element={<SalesHomePage />}>
              <Route index element={<POSPage />} />
              <Route path="orders" element={<SalesOrdersListPage />} />
              <Route path="invoices" element={<SalesInvoicesListPage />} />
              <Route path="invoice-reports" element={<InvoiceReportsPage />} />
              <Route path="void-requests" element={<VoidRequestsPage />} />
              <Route path="invoice-sync-conflicts" element={<InvoiceSyncConflictsPage />} />
              <Route path="returns/new" element={<SalesReturnEntryPage />} />
              <Route path="returns" element={<SalesReturnsListPage />} />
              <Route path="returns/:returnId" element={<SalesReturnDetailPage />} />
              <Route path="return-sync-conflicts" element={<ReturnSyncConflictsPage />} />
              <Route path="return-reports" element={<ReturnReportsPage />} />
              <Route path="return-reversal-requests" element={<ReturnReversalQueuePage />} />
              <Route path="replacement-orders" element={<ReplacementOrdersPage />} />
              <Route path="cash-refund-requests" element={<CashRefundRequestsPage />} />
              <Route path="credit-note-allocation" element={<CreditNoteAllocationPage />} />
              <Route path="return-offline-acceptance" element={<ReturnOfflineAcceptancePage />} />
              <Route path="approvals" element={<ApprovalQueuePage />} />
              <Route path="reports" element={<OrderControlReportsPage />} />
              <Route path="sync-conflicts" element={<SyncConflictsPage />} />
              <Route path="history" element={<SalesHistoryPage />} />
            </Route>
            <Route path="sales/orders/new" element={<SalesOrderEntryPage />} />
            <Route path="sales/orders/:orderId" element={<SalesOrderDetailPage />} />
            <Route path="sales/invoices/new" element={<SalesInvoiceEntryPage />} />
            <Route path="sales/invoices/:invoiceId" element={<SalesInvoiceDetailPage />} />

            <Route path="collections" element={<CollectionsHomePage />}>
              <Route index element={<Navigate to="receipts" replace />} />
              <Route path="receipts" element={<ReceiptVouchersListPage />} />
              <Route path="route-collection" element={<RouteCollectionPage />} />
              <Route path="reversal-requests" element={<ReversalQueuePage />} />
              <Route path="advance-unallocated" element={<AdvanceUnallocatedPage />} />
              <Route path="cheque-deposits" element={<ChequeDepositBatchPage />} />
              <Route path="sync-conflicts" element={<ReceiptSyncConflictsPage />} />
              <Route path="payment-promises" element={<PaymentPromisesPage />} />
              <Route path="reports" element={<ReceiptReportsPage />} />
            </Route>
            <Route path="collections/receipts/new" element={<ReceiptEntryPage />} />
            <Route path="collections/receipts/:receiptId" element={<ReceiptVoucherDetailPage />} />

            <Route path="routes" element={<RoutesPage />} />
            <Route path="routes/beat-plans" element={<BeatPlansPage />} />
            <Route path="routes/beat-plans/:beatPlanId" element={<BeatPlanDetailPage />} />
            <Route path="routes/daily-plans" element={<DailyVisitPlansPage />} />
            <Route path="routes/daily-plans/:planId" element={<DailyVisitPlanDetailPage />} />
            <Route path="routes/execution/:planId" element={<RouteExecutionPage />} />
            <Route path="routes/monitoring" element={<SupervisorMonitoringPage />} />
            <Route path="routes/reports" element={<RouteReportsPage />} />
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
            <Route path="hr" element={<HRHomePage />}>
              <Route index element={<StaffPage />} />
              <Route path="drivers" element={<DriverManagementPage />} />
              <Route path="salesmen" element={<SalesmanManagementPage />} />
            </Route>
            <Route path="gps" element={<GpsHomePage />}>
              <Route index element={<GpsTrackingPage />} />
              <Route path="history" element={
                <Suspense fallback={<LoadingScreen label="Loading map…" />}>
                  <GpsHistoryPage />
                </Suspense>
              } />
              <Route path="geofences" element={<GeofencesPage />} />
              <Route path="alerts" element={<VehicleAlertsPage />} />
            </Route>
            <Route path="settings" element={<SettingsHomePage />}>
              <Route index element={<CompanySettingsPage />} />
              <Route path="security" element={<SecuritySettingsPage />} />
              <Route path="roles" element={<RolesPermissionsPage />} />
              <Route path="login-history" element={<LoginHistoryPage />} />
              <Route path="devices" element={<DeviceManagementPage />} />
              <Route path="print" element={<PrintSettingsPage />} />
              <Route path="device-reports" element={<DeviceReportsPage />} />
              <Route path="sync" element={<SyncManagementPage />} />
              <Route path="customer-master" element={<CustomerMasterSettingsPage />} />
              <Route path="credit" element={<CreditSettingsPage />} />
            </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}

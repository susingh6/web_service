import { Suspense, lazy, useState } from "react";
import { Switch, Route, useRoute } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { useInactivityTimeout } from "@/hooks/use-inactivity-timeout";
import { Toaster } from "@/components/ui/toaster";
import { AdminRoute } from "@/lib/admin-route";
import AppLayout from "./components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Summary from "@/pages/dashboard/Summary";
import AdminPage from "@/pages/admin/AdminPage";
import { Box, CircularProgress } from "@mui/material";
import type { Entity } from "@shared/schema";

// Lazy load components for better performance
const TeamDashboard = lazy(() => import("@/pages/dashboard/TeamDashboard"));

// Import modals
const EditEntityModal = lazy(() => import("@/components/modals/EditEntityModal"));
const AddEntityModal = lazy(() => import("@/components/modals/AddEntityModal"));
const BulkUploadModal = lazy(() => import("@/components/modals/BulkUploadModal"));
const ConfirmDialog = lazy(() => import("@/components/modals/ConfirmDialog"));

// Wrapper component to handle TeamDashboard props
const TeamDashboardWrapper = () => {
  // Get team ID from route params
  const [match, params] = useRoute("/team/:id");
  const teamId = params?.id;
  
  // Modal state management
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openBulkModal, setOpenBulkModal] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  // Handler functions
  const handleEditEntity = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenEditModal(true);
  };

  const handleDeleteEntity = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenDeleteDialog(true);
  };

  const handleViewDetails = (entity: Entity) => {
    // For now, just log - view details functionality would need proper implementation
    console.log('View details for entity:', entity);
  };

  const handleAddEntity = () => {
    setOpenAddModal(true);
  };

  const handleBulkUpload = () => {
    setOpenBulkModal(true);
  };

  const handleNotificationTimeline = (entity: Entity) => {
    // For now, just log - notification timeline functionality would need proper implementation
    console.log('Notification timeline for entity:', entity);
  };

  const handleViewTasks = (entity: Entity) => {
    // For now, just log - view tasks functionality would need proper implementation
    console.log('View tasks for entity:', entity);
  };

  const handleConfirmDelete = () => {
    if (selectedEntity) {
      console.log('Deleting entity:', selectedEntity);
      setOpenDeleteDialog(false);
      setSelectedEntity(null);
    }
  };

  const teamDashboardProps = {
    teamName: `Team ${teamId}`,
    tenantName: 'Data Engineering',
    onEditEntity: handleEditEntity,
    onDeleteEntity: handleDeleteEntity,
    onViewDetails: handleViewDetails,
    onAddEntity: handleAddEntity,
    onBulkUpload: handleBulkUpload,
    onNotificationTimeline: handleNotificationTimeline,
    onViewTasks: handleViewTasks
  };

  return (
    <>
      <TeamDashboard {...teamDashboardProps} />
      
      {/* Modals */}
      <Suspense fallback={null}>
        <EditEntityModal
          open={openEditModal}
          onClose={() => setOpenEditModal(false)}
          entity={selectedEntity}
          teams={[{ id: Number(teamId), name: `Team ${teamId}` }]}
          initialTenantName="Data Engineering"
          initialTeamName={`Team ${teamId}`}
        />
        
        <AddEntityModal
          open={openAddModal}
          onClose={() => setOpenAddModal(false)}
          teams={[{ id: Number(teamId), name: `Team ${teamId}` }]}
          initialTenantName="Data Engineering"
          initialTeamName={`Team ${teamId}`}
        />
        
        <BulkUploadModal
          open={openBulkModal}
          onClose={() => setOpenBulkModal(false)}
        />
        
        <ConfirmDialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
          onConfirm={handleConfirmDelete}
          title="Delete Entity"
          content={`Are you sure you want to delete "${selectedEntity?.name}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmColor="error"
        />
      </Suspense>
    </>
  );
};

// Loading fallback for lazy-loaded components
const LazyLoadingFallback = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
    <CircularProgress />
  </Box>
);

function Router() {
  return (
    <Switch>
      {/* Auth routes */}
      <Route path="/auth" component={AuthPage} />
      
      {/* Admin-only Dashboard routes */}
      <AdminRoute path="/" component={Summary} />
      <AdminRoute path="/admin" component={AdminPage} />
      <AdminRoute 
        path="/team/:id" 
        component={() => (
          <Suspense fallback={<LazyLoadingFallback />}>
            <TeamDashboardWrapper />
          </Suspense>
        )} 
      />
      
      {/* No separate DAGs route anymore */}
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

// Component to handle inactivity timeout
function InactivityHandler() {
  useInactivityTimeout();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InactivityHandler />
        <AppLayout>
          <Router />
        </AppLayout>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

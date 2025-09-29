import React, { useState, useEffect, useRef } from 'react';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { cacheKeys, invalidateAdminCaches } from '@/lib/cacheKeys';
import { Box, Typography, Tabs, Tab, Card, CardContent, Chip, Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, IconButton, Grid } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon, Person as PersonIcon, Edit as EditIcon, Delete as DeleteIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchEntities, fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { Entity, Team } from '@shared/schema';
import { calculateMetrics } from '@shared/cache-types';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import { apiClient } from '@/config/api';
import { entitiesApi } from '@/features/sla/api';
import { apiRequest } from '@/lib/queryClient';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { teamMemberSchema } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useTeamMemberMutationV2 } from '@/utils/cache-management';
import { useRealTimeEntities } from '@/hooks/useRealTimeEntities';
import { useQueryClient } from '@tanstack/react-query';
import { TeamNotificationSettings } from '@/components/team/TeamNotificationSettings';
import NotificationSummary from '@/components/team/NotificationSummary';

interface TeamDashboardProps {
  teamName: string;
  tenantName: string;
  dateRange?: { startDate: Date; endDate: Date; label: string };
  onDateRangeChange?: (range: { startDate: Date; endDate: Date; label: string }) => void;
  onEditEntity: (entity: Entity) => void;
  onDeleteEntity: (entity: Entity) => void;
  onViewDetails: (entity: Entity) => void;
  onAddEntity: () => void;
  onBulkUpload: () => void;
  onNotificationTimeline: (entity: Entity) => void;
  onViewTasks: (entity: Entity) => void;
}

const TeamDashboard = ({ 
  teamName, 
  tenantName, 
  dateRange,
  onDateRangeChange,
  onEditEntity, 
  onDeleteEntity, 
  onViewDetails, 
  onAddEntity, 
  onBulkUpload, 
  onNotificationTimeline, 
  onViewTasks 
}: TeamDashboardProps) => {
  const dispatch = useAppDispatch();
  const { list: allEntities, teamLists, teams, isLoading } = useAppSelector((state) => state.entities);
  
  // Find current team ID from teamName
  const currentTeam = teams.find(team => team.name === teamName);
  const teamId = currentTeam?.id;
  
  // Get team-specific entities from teamLists bucket, fallback to empty array
  const entities = teamId && teamLists[teamId] ? teamLists[teamId] : [];
  const {} = useAppSelector((state) => state.dashboard);
  const queryClient = useQueryClient();

  const [tabValue, setTabValue] = useState(0);
  const { addMember, removeMember } = useTeamMemberMutationV2();
  const [chartFilter, setChartFilter] = useState('All');
  const [entitiesChartFilter, setEntitiesChartFilter] = useState('All');
  const [teamDateRange, setTeamDateRange] = useState({
    startDate: dateRange?.startDate || startOfDay(subDays(new Date(), 29)),
    endDate: dateRange?.endDate || endOfDay(new Date()),
    label: dateRange?.label || 'Last 30 Days',
  });

  // Helpers to compute activity within the selected date range
  const getEntityTimestamp = (e: any): Date | null => {
    const ts = (e.lastRefreshed as any) || (e.updatedAt as any) || (e.createdAt as any) || null;
    if (!ts) return null;
    return ts instanceof Date ? ts : new Date(ts);
  };
  const isWithinTeamRange = (e: any): boolean => {
    const ts = getEntityTimestamp(e);
    if (!ts) return false;
    if (teamDateRange?.startDate && ts < teamDateRange.startDate) return false;
    if (teamDateRange?.endDate && ts > teamDateRange.endDate) return false;
    return true;
  };

  // Keep local state in sync with parent-provided dateRange
  useEffect(() => {
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      setTeamDateRange(prev => ({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        label: dateRange.label || prev.label,
      }));
    }
  }, [dateRange?.startDate?.getTime?.(), dateRange?.endDate?.getTime?.(), dateRange?.label]);

  // Get current team info by name
  const team = teams.find((t: Team) => t.name === teamName);

  // Local state for team entities to avoid affecting Summary dashboard
  const [teamEntities, setTeamEntities] = useState<Entity[]>([]);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const { toast } = useToast();

  // React Query to fetch team members - automatically updates when cache changes
  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery({
    queryKey: cacheKeys.teamMembers(tenantName, team?.id),
    queryFn: async () => {
      if (!team?.name) return [];
      const response = await apiClient.teams.getMembers(team.name);
      return await response.json();
    },
    enabled: !!team?.name && !!team?.id,
  });

  // Ensure teams are loaded when visiting TeamDashboard directly
  // Use ref to prevent infinite loops during cache invalidations
  const hasInitiallyLoadedTeams = useRef(false);
  useEffect(() => {
    if (!hasInitiallyLoadedTeams.current && (!teams || teams.length === 0)) {
      dispatch(fetchTeams());
      hasInitiallyLoadedTeams.current = true;
    }
    if (teams && teams.length > 0) {
      hasInitiallyLoadedTeams.current = true;
    }
  }, [teams, dispatch]);

  // Listen for admin panel team updates (rename/member changes) and refresh members immediately
  const teamIdRef = useRef(team?.id);
  useEffect(() => {
    teamIdRef.current = team?.id;
  });
  
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail || {};
      if (!teamIdRef.current) return;
      // Always refresh team members for current team when admin updates fire
      queryClient.invalidateQueries({ queryKey: cacheKeys.teamMembers(tenantName, teamIdRef.current) });
      queryClient.refetchQueries({ queryKey: cacheKeys.teamMembers(tenantName, teamIdRef.current) });
    };
    window.addEventListener('admin-teams-updated', handler);
    return () => window.removeEventListener('admin-teams-updated', handler);
  }, [tenantName, queryClient]);

  // Fetch data when team is found
  // Use React Query for team entities so cache invalidation works
  const { data: teamEntitiesFromQuery = [], isLoading: isLoadingTeamEntities } = useQuery({
    queryKey: cacheKeys.entitiesByTenantAndTeam(tenantName, team?.id),
    queryFn: async () => {
      if (!team?.id) return [];
      return await entitiesApi.getByTeam(team.id);
    },
    enabled: !!team?.id,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Update local state when query data changes
  useEffect(() => {
    if (teamEntitiesFromQuery) {
      setTeamEntities(teamEntitiesFromQuery);
    }
  }, [teamEntitiesFromQuery]);

  // Filter entities for this team from local state (for backward compatibility)
  // For team dashboard: show ALL entities (active and inactive) for team visibility
  const activeTeamEntities = teamEntities; // Show all entities, don't filter by is_active

  // Fetch tenant-level summary for this team's selected date range (scoped to component)
  const { data: teamSummaryData, isLoading: teamSummaryLoading, isError: teamSummaryError } = useQuery({
    queryKey: cacheKeys.dashboardSummary(
      tenantName,
      team?.id,
      format(teamDateRange.startDate, 'yyyy-MM-dd'),
      format(teamDateRange.endDate, 'yyyy-MM-dd')
    ),
    queryFn: async () => {
      if (!tenantName || !team?.id) return null;
      const params = new URLSearchParams({
        tenant: tenantName,
        team: teamName,
        startDate: format(teamDateRange.startDate, 'yyyy-MM-dd'),
        endDate: format(teamDateRange.endDate, 'yyyy-MM-dd'),
      });
      const generalUrl = `/api/dashboard/summary?${params.toString()}`;
      const response = await apiRequest('GET', generalUrl);
      return response.json();
    },
    enabled: !!tenantName && !!team?.id,
    staleTime: 30 * 1000,
  });

  // Determine if server has any data for the selected range
  const hasRangeData = !!(
    teamSummaryData &&
    teamSummaryData.complianceTrends &&
    Array.isArray(teamSummaryData.complianceTrends.trend) &&
    teamSummaryData.complianceTrends.trend.length > 0
  );
  const canDisplayTrends = hasRangeData && activeTeamEntities.length > 0;

  // Set up real-time updates for this team page
  const { isRealTimeEnabled } = useRealTimeEntities({
    tenantName,
    teamName,
    teamId: team?.id,
    onEntityUpdated: (data) => {
      const operation: 'created' | 'updated' | 'deleted' = data.type || 'updated';
      
      // Refresh team entities when real-time update received
      queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenantAndTeam(tenantName, team?.id) });
      // Also refresh dashboard summary
      queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(tenantName, team?.id) });
      // Only refresh specific team entities via React Query, avoid Redux to prevent cross-contamination
      queryClient.refetchQueries({ queryKey: ['entities', 'team', team?.id] });

      // Show toast notification
      const messages: Record<'created' | 'updated' | 'deleted', string> = {
        created: `${data.entityName} has been created successfully`,
        updated: `${data.entityName} has been updated successfully`,
        deleted: `${data.entityName} has been deleted successfully`
      };

      toast({
        title: `Entity ${operation.charAt(0).toUpperCase() + operation.slice(1)}`,
        description: messages[operation] || messages.updated,
        variant: "default",
      });
    },
    onTeamMembersUpdated: (data) => {
      // Refresh team members when real-time update received
      queryClient.invalidateQueries({ queryKey: cacheKeys.teamMembers(tenantName, team?.id) });
    }
  });

  // Guard Select values at render time to prevent MUI out-of-range warnings
  // Use the same filtered list we render for options
  const filteredAvailableUsers = (availableUsers || [])
    .filter((user: any) => user.is_active !== false)
    .filter((user: any) => !(teamMembers as any[]).some((member: any) => member.id === user.id));

  const addValue = selectedUserId && filteredAvailableUsers.some((u: any) => u.id === Number(selectedUserId))
    ? selectedUserId
    : '';
  const removeValue = selectedMemberId && (teamMembers as any[]).some((m: any) => m.id === Number(selectedMemberId))
    ? selectedMemberId
    : '';


  const fetchAvailableUsers = async () => {
    try {
      const response = await apiClient.users.getAll();
      const data = await response.json();
      setAvailableUsers(data || []);
    } catch (error) {
      // Handle error silently
    }
  };

  const handleAddMember = async () => {
    await fetchAvailableUsers();
    setSelectedUserId('');
    setAddMemberDialogOpen(true);
  };

  const handleRemoveMember = () => {
    setSelectedMemberId('');
    setRemoveMemberDialogOpen(true);
  };

  // Clear add-member selection if current value no longer exists in options
  useEffect(() => {
    if (!selectedUserId) return;
    const exists = availableUsers.some((u: any) => u.id === Number(selectedUserId));
    if (!exists) setSelectedUserId('');
  }, [availableUsers, selectedUserId]);

  // Clear remove-member selection if current value no longer exists in team members
  useEffect(() => {
    if (!selectedMemberId) return;
    const exists = (teamMembers as any[]).some((m: any) => m.id === Number(selectedMemberId));
    if (!exists) setSelectedMemberId('');
  }, [teamMembers, selectedMemberId]);

  const onAddMember = async () => {
    if (!selectedUserId) return;

    // Find the selected user for optimistic update
    const selectedUser = availableUsers.find(user => user.id === parseInt(selectedUserId));
    if (!selectedUser) return;

    try {
      // CRITICAL: Pass tenantName and teamId for proper cache invalidation
      await addMember(teamName, selectedUserId, selectedUser, tenantName, team?.id);

      toast({
        title: 'Success',
        description: 'Team member added successfully',
      });

      setAddMemberDialogOpen(false);
      setSelectedUserId('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add team member',
        variant: 'destructive',
      });
    }
  };

  const onRemoveMember = async () => {
    if (!selectedMemberId) return;

    try {
      // CRITICAL: Pass tenantName and teamId for proper cache invalidation
      await removeMember(teamName, selectedMemberId, tenantName, team?.id);

      toast({
        title: 'Success',
        description: 'Team member removed successfully',
      });

      setRemoveMemberDialogOpen(false);
      setSelectedMemberId('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove team member',
        variant: 'destructive',
      });
    }
  };

  const tables = activeTeamEntities.filter((entity) => entity.type === 'table');
  const dags = activeTeamEntities.filter((entity) => entity.type === 'dag');

  // Use server-computed, date-filtered metrics from /api/dashboard/summary (preferred)
  // Fall back to client-side calculation only if server data is unavailable
  const teamMetrics = teamSummaryData?.metrics || (activeTeamEntities.length > 0 
    ? calculateMetrics(activeTeamEntities, tables, dags)
    : null);

  // Extract individual metrics for display
  const overallComplianceAvg = teamMetrics?.overallCompliance || 0;
  const tablesComplianceAvg = teamMetrics?.tablesCompliance || 0;
  const dagsComplianceAvg = teamMetrics?.dagsCompliance || 0;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Listen for parent request to switch sub-tab after add/update
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      if (detail.teamName !== teamName) return;
      const type = detail.type as 'table' | 'dag';
      setTabValue(type === 'dag' ? 1 : 0);
    };
    window.addEventListener('switch-team-subtab', handler);
    return () => window.removeEventListener('switch-team-subtab', handler);
  }, [teamName]);

  // Show loading state when team is not found or still loading
  if (!team || (teams.length === 0 && isLoading)) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="text.secondary">
          Loading team dashboard for {teamName}...
        </Typography>
      </Box>
    );
  }

  // Show error state if team is not found after loading
  if (teams.length > 0 && !team) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="error">
          Team "{teamName}" not found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box mb={4}>
        <Paper elevation={0} sx={{ p: 3, borderRadius: 2, mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography variant="h4" component="h1" fontWeight={600} fontFamily="Inter, sans-serif">
                {team.name}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                {team.description || `Team dashboard for ${team.name}`}
              </Typography>
              <Box display="flex" alignItems="center" mt={2} gap={1} flexWrap="wrap">
                <Chip 
                  label={`${teamMetrics?.entitiesCount || activeTeamEntities.length} Entities`} 
                  size="small" 
                  sx={{ bgcolor: 'primary.light', color: 'white' }} 
                />
                <Chip 
                  label={`${teamMetrics?.tablesCount || tables.length} Tables`} 
                  size="small" 
                  sx={{ bgcolor: 'info.light', color: 'white' }} 
                />
                <Chip 
                  label={`${teamMetrics?.dagsCount || dags.length} DAGs`} 
                  size="small" 
                  sx={{ bgcolor: 'secondary.light', color: 'white' }} 
                />
                <Chip 
                  icon={<PersonIcon fontSize="small" />}
                  label={`${teamMembers.length} Members`} 
                  size="small" 
                  sx={{ bgcolor: 'success.light', color: 'white' }} 
                />
              </Box>

              {/* Team Members Section */}
              <Box mt={2}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Team Members:
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      startIcon={<PersonAddIcon />}
                      onClick={handleAddMember}
                      sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
                    >
                      Add Member
                    </Button>
                    <Button
                      size="small"
                      startIcon={<DeleteIcon />}
                      onClick={handleRemoveMember}
                      color="error"
                      sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
                      disabled={teamMembers.length === 0}
                    >
                      Remove Member
                    </Button>
                  </Box>
                </Box>
                <Box display="flex" flexWrap="wrap" gap={0.5} mb={2}>
                  {teamMembersLoading ? (
                    // Show loading skeleton for team members
                    Array.from({ length: 3 }).map((_, index) => (
                      <Box
                        key={index}
                        sx={{
                          width: '80px',
                          height: '24px',
                          bgcolor: 'grey.200',
                          borderRadius: '12px',
                          animation: 'pulse 1.5s ease-in-out infinite',
                          '@keyframes pulse': {
                            '0%': { opacity: 1 },
                            '50%': { opacity: 0.5 },
                            '100%': { opacity: 1 }
                          }
                        }}
                      />
                    ))
                  ) : teamMembers.length > 0 ? (
                    teamMembers.map((member: any) => {
                      const isExpired = !member.is_active;
                      return (
                        <Chip 
                          key={member.id}
                          label={
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <span
                                style={{
                                  textDecoration: isExpired ? 'line-through' : 'none',
                                  fontWeight: isExpired ? 400 : 500,
                                }}
                              >
                                {member.displayName || member.username}
                              </span>
                              {isExpired && (
                                <Box
                                  component="span"
                                  sx={{
                                    bgcolor: '#dc3545',
                                    color: 'white',
                                    borderRadius: '3px',
                                    px: 0.5,
                                    py: 0.1,
                                    fontSize: '0.55rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.02em'
                                  }}
                                >
                                  EXPIRED
                                </Box>
                              )}
                            </Box>
                          }
                          size="small"
                          variant={isExpired ? "outlined" : "filled"}
                          sx={{ 
                            fontSize: '0.75rem',
                            height: '26px',
                            fontWeight: 500,
                            // Active member styling
                            ...(!isExpired && {
                              bgcolor: '#e3f2fd',
                              color: '#1565c0',
                              borderColor: '#90caf9',
                              '&:hover': {
                                bgcolor: '#bbdefb'
                              }
                            }),
                            // Expired member styling
                            ...(isExpired && {
                              bgcolor: '#ffebee',
                              color: '#d32f2f',
                              borderColor: '#ef5350',
                              opacity: 0.85,
                              '&:hover': {
                                bgcolor: '#ffcdd2'
                              }
                            }),
                            '& .MuiChip-label': { px: 1.5 }
                          }}
                        />
                      );
                    })
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No team members found
                    </Typography>
                  )}
                </Box>

                {/* Notification Summary */}
                <NotificationSummary team={team} tenantName={tenantName} />
              </Box>
            </Box>

            <Box display="flex" alignItems="center" gap={2}>
              <DateRangePicker 
                value={teamDateRange} 
                onChange={(range) => {
                  setTeamDateRange(range);
                  if (onDateRangeChange) onDateRangeChange(range);
                }} 
              />

              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={onAddEntity}
              >
                Add Entity
              </Button>

              <Button
                variant="outlined"
                color="primary"
                startIcon={<UploadIcon />}
                onClick={onBulkUpload}
              >
                Bulk Upload
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Metrics Cards */}
        <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
          {(() => {
            const teamRangeText = (teamDateRange?.label === 'Custom Range' && teamDateRange.startDate && teamDateRange.endDate)
              ? `${format(teamDateRange.startDate, 'MMM d, yyyy')} - ${format(teamDateRange.endDate, 'MMM d, yyyy')}`
              : teamDateRange.label;
            return [
            { 
              title: `Overall SLA Compliance (${teamRangeText})`, 
              value: hasRangeData ? overallComplianceAvg : 0, 
              trend: hasRangeData && teamMetrics ? 1.2 : 0, 
              progress: hasRangeData ? overallComplianceAvg : undefined, 
              suffix: "%",
              loading: teamSummaryLoading,
              showDataUnavailable: !teamSummaryLoading && !hasRangeData,
              infoTooltip: `Average SLA compliance across all tables and DAGs for ${team.name} in the selected date range.`
            },
            { 
              title: `Tables SLA Compliance (${teamRangeText})`, 
              value: hasRangeData ? tablesComplianceAvg : 0, 
              trend: hasRangeData && teamMetrics ? 0.8 : 0, 
              progress: hasRangeData ? tablesComplianceAvg : undefined, 
              suffix: "%",
              loading: teamSummaryLoading,
              showDataUnavailable: !teamSummaryLoading && !hasRangeData,
              infoTooltip: `Average SLA compliance across all table entities for ${team.name} in the selected date range.`
            },
            { 
              title: `DAGs SLA Compliance (${teamRangeText})`, 
              value: hasRangeData ? dagsComplianceAvg : 0, 
              trend: hasRangeData && teamMetrics ? 1.5 : 0, 
              progress: hasRangeData ? dagsComplianceAvg : undefined, 
              suffix: "%",
              loading: teamSummaryLoading,
              showDataUnavailable: !teamSummaryLoading && !hasRangeData,
              infoTooltip: `Average SLA compliance across all DAG entities for ${team.name} in the selected date range.`
            },
            { 
              title: "Entities Monitored", 
              value: (() => {
                // Count entities exactly like EntityTable displays them
                let filteredForDisplay = teamEntities.filter((entity: Entity) => entity.is_active);
                
                // Apply same filtering logic as EntityTable:
                // If metrics unavailable for selected range, show only recent entities
                if (!canDisplayTrends) {
                  const isEntityRecent = (entity: Entity): boolean => {
                    if (!entity.lastRefreshed && !entity.updatedAt) return false;
                    const updateTime = entity.lastRefreshed || entity.updatedAt;
                    if (!updateTime) return false;
                    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
                    const entityUpdateTime = new Date(updateTime);
                    return entityUpdateTime >= sixHoursAgo;
                  };
                  filteredForDisplay = filteredForDisplay.filter(isEntityRecent);
                }
                
                return filteredForDisplay.length;
              })(),
              trend: 0, 
              suffix: "",
              loading: teamSummaryLoading,
              showDataUnavailable: false, // Never show unavailable - always show actual count
              subtitle: (() => {
                // Calculate breakdown using same filtering as count above
                let tablesForDisplay = teamEntities.filter((entity: Entity) => 
                  entity.type === 'table' && entity.is_active
                );
                let dagsForDisplay = teamEntities.filter((entity: Entity) => 
                  entity.type === 'dag' && entity.is_active
                );
                
                // Apply recent filter if metrics unavailable (same as EntityTable logic)
                if (!canDisplayTrends) {
                  const isEntityRecent = (entity: Entity): boolean => {
                    if (!entity.lastRefreshed && !entity.updatedAt) return false;
                    const updateTime = entity.lastRefreshed || entity.updatedAt;
                    if (!updateTime) return false;
                    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
                    const entityUpdateTime = new Date(updateTime);
                    return entityUpdateTime >= sixHoursAgo;
                  };
                  tablesForDisplay = tablesForDisplay.filter(isEntityRecent);
                  dagsForDisplay = dagsForDisplay.filter(isEntityRecent);
                }
                
                return `${tablesForDisplay.length} Tables • ${dagsForDisplay.length} DAGs`;
              })()
            }
          ].map((card, idx) => (
            <Box key={card.title} flex="1 1 250px" minWidth="250px">
              <MetricCard {...card} />
            </Box>
          ));
          })()}
        </Box>

        {/* Charts */}
        <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title="Compliance Trend Snapshot"
              infoTooltip={`Each data point shows cumulative SLA compliance for ${(team?.name || teamName)} team up to that date: (Passed + Pending) ÷ all historical runs.`}
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setChartFilter}
              loading={teamSummaryLoading}
              chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} data={canDisplayTrends ? (teamSummaryData?.complianceTrends?.trend || []) : []} entities={canDisplayTrends ? activeTeamEntities : []} loading={teamSummaryLoading} />}
            />
          </Box>

          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title={`Top 5 Entities Performance (${(teamDateRange?.label === 'Custom Range' && teamDateRange.startDate && teamDateRange.endDate) ? `${format(teamDateRange.startDate, 'MMM d, yyyy')} - ${format(teamDateRange.endDate, 'MMM d, yyyy')}` : teamDateRange.label})`}
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setEntitiesChartFilter}
              infoTooltip={`Shows the top 5 entities by SLA performance for the selected date range.`}
              loading={teamSummaryLoading}
              chart={<EntityPerformanceChart entities={hasRangeData ? activeTeamEntities : []} filter={entitiesChartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} dateRange={teamDateRange} />}
            />
          </Box>
        </Box>

        {/* Tables/DAGs Sub-tabs */}
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3 }}>
          <Tab 
            label="Tables" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
          <Tab 
            label="DAGs" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
        </Tabs>

        <Box role="tabpanel" hidden={tabValue !== 0}>
          {tabValue === 0 && (
            isLoadingTeamEntities ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Loading tables...
                </Typography>
              </Box>
            ) : (
              <EntityTable
                entities={tables}
                type="table"
                teams={teams}
                onEditEntity={onEditEntity}
                onDeleteEntity={onDeleteEntity}
                onViewHistory={() => {}}
                onViewDetails={onViewDetails}
                onSetNotificationTimeline={onNotificationTimeline}
                showActions={true}
                isTeamDashboard={true}
                hasMetrics={canDisplayTrends}
                trendLabel={`${(teamDateRange?.label === 'Custom Range' && teamDateRange.startDate && teamDateRange.endDate) ? `${format(teamDateRange.startDate, 'MMM d, yyyy')} - ${format(teamDateRange.endDate, 'MMM d, yyyy')}` : teamDateRange.label} Trend`}
              />
            )
          )}
        </Box>

        <Box role="tabpanel" hidden={tabValue !== 1}>
          {tabValue === 1 && (
            isLoadingTeamEntities ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Loading DAGs...
                </Typography>
              </Box>
            ) : (
              <EntityTable
                entities={dags}
                type="dag"
                teams={teams}
                onEditEntity={onEditEntity}
                onDeleteEntity={onDeleteEntity}
                onViewHistory={() => {}}
                onViewDetails={onViewDetails}
                onViewTasks={onViewTasks}
                onSetNotificationTimeline={onNotificationTimeline}
                showActions={true}
                isTeamDashboard={true}
                hasMetrics={canDisplayTrends}
                trendLabel={`${(teamDateRange?.label === 'Custom Range' && teamDateRange.startDate && teamDateRange.endDate) ? `${format(teamDateRange.startDate, 'MMM d, yyyy')} - ${format(teamDateRange.endDate, 'MMM d, yyyy')}` : teamDateRange.label} Trend`}
              />
            )
          )}
        </Box>

        {/* Add Member Dialog */}
        <Dialog open={addMemberDialogOpen} onClose={() => setAddMemberDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogContent>
            <Box pt={1}>
              <FormControl fullWidth size="small">
                <InputLabel>Select User to Add</InputLabel>
                <Select
                  value={addValue}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  label="Select User to Add"
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                      },
                    },
                  }}
                >
                  {availableUsers
                    .filter(user => user.is_active !== false) // Filter out inactive users
                    .filter(user => !teamMembers.some((member: any) => member.id === user.id))
                    .map((user) => (
                      <MenuItem key={user.id} value={user.id}>
                        <Box>
                          <Typography variant="body2">{user.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {user.email}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddMemberDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={onAddMember} 
              variant="contained"
              disabled={!selectedUserId}
            >
              Add Member
            </Button>
          </DialogActions>
        </Dialog>

        {/* Remove Member Dialog */}
        <Dialog open={removeMemberDialogOpen} onClose={() => setRemoveMemberDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Remove Team Member</DialogTitle>
          <DialogContent>
            <Box pt={1}>
              <FormControl fullWidth size="small">
                <InputLabel>Select Member to Remove</InputLabel>
                <Select
                  value={removeValue}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  label="Select Member to Remove"
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                      },
                    },
                  }}
                >
                  {teamMembers.map((member: any) => (
                    <MenuItem key={member.id} value={member.id}>
                      <Box>
                        <Typography variant="body2">{member.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {member.email}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRemoveMemberDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={onRemoveMember} 
              variant="contained"
              color="error"
              disabled={!selectedMemberId}
            >
              Remove Member
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default TeamDashboard;
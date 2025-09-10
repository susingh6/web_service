import React, { useState, useEffect } from 'react';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Tabs, Tab, Card, CardContent, Chip, Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, IconButton } from '@mui/material';
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
import { apiRequest } from '@/lib/queryClient';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { teamMemberSchema } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useTeamMemberMutation } from '@/utils/cache-management';
import { useRealTimeEntities } from '@/hooks/useRealTimeEntities';
import { useQueryClient } from '@tanstack/react-query';

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
  const { list: entities, teams, isLoading } = useAppSelector((state) => state.entities);
  const {} = useAppSelector((state) => state.dashboard);
  const queryClient = useQueryClient();

  const [tabValue, setTabValue] = useState(0);
  const { addMember, removeMember } = useTeamMemberMutation();
  const [chartFilter, setChartFilter] = useState('All');
  const [entitiesChartFilter, setEntitiesChartFilter] = useState('All');
  const [teamDateRange, setTeamDateRange] = useState({
    startDate: dateRange?.startDate || startOfDay(subDays(new Date(), 29)),
    endDate: dateRange?.endDate || endOfDay(new Date()),
    label: dateRange?.label || 'Last 30 Days',
  });

  // Keep local state in sync with parent-provided dateRange
  useEffect(() => {
    if (dateRange) {
      setTeamDateRange({ ...dateRange });
    }
  }, [+dateRange?.startDate, +dateRange?.endDate, dateRange?.label]);

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
    queryKey: ['teamMembers', tenantName, team?.id],
    queryFn: async () => {
      if (!teamName) return [];
      const response = await apiClient.teams.getMembers(teamName);
      return await response.json();
    },
    enabled: !!teamName && !!team?.id,
  });

  // Ensure teams are loaded when visiting TeamDashboard directly
  useEffect(() => {
    if (!teams || teams.length === 0) {
      dispatch(fetchTeams());
    }
  }, [teams, dispatch]);

  // Fetch data when team is found
  // Use React Query for team entities so cache invalidation works
  const { data: teamEntitiesFromQuery = [], isLoading: isLoadingTeamEntities } = useQuery({
    queryKey: ['entities', tenantName, team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const response = await apiRequest('GET', `/api/entities?teamId=${team.id}`);
      return response.json();
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

  // Fetch tenant-level summary for this team's selected date range (scoped to component)
  const { data: teamSummaryData, isLoading: teamSummaryLoading, isError: teamSummaryError } = useQuery({
    queryKey: ['dashboardSummary', tenantName, team?.id, format(teamDateRange.startDate, 'yyyy-MM-dd'), format(teamDateRange.endDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!tenantName || !team?.id) return null;
      const params = new URLSearchParams({
        tenant: tenantName,
        team: teamName,
        startDate: format(teamDateRange.startDate, 'yyyy-MM-dd'),
        endDate: format(teamDateRange.endDate, 'yyyy-MM-dd'),
      });
      const response = await apiRequest('GET', `/api/dashboard/summary?${params.toString()}`);
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
  const canDisplayTrends = hasRangeData && teamEntities.length > 0;

  // Set up real-time updates for this team page
  const { isRealTimeEnabled } = useRealTimeEntities({
    tenantName,
    teamName,
    teamId: team?.id,
    onEntityUpdated: (data) => {
      // Refresh team entities when real-time update received
      queryClient.invalidateQueries({ queryKey: ['entities', tenantName, team?.id] });
      // Also refresh dashboard summary
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', tenantName, team?.id] });
      // Also refresh Redux store
      dispatch(fetchEntities({ tenant: tenantName }));
    },
    onTeamMembersUpdated: (data) => {
      // Refresh team members when real-time update received
      queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, team?.id] });
    }
  });


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

  const onAddMember = async () => {
    if (!selectedUserId) return;

    // Find the selected user for optimistic update
    const selectedUser = availableUsers.find(user => user.id === parseInt(selectedUserId));
    if (!selectedUser) return;

    try {
      await addMember(teamName, selectedUserId, selectedUser);

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
      await removeMember(teamName, selectedMemberId);

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

  // Filter entities for this team from local state (for backward compatibility)
  const tables = teamEntities.filter((entity) => entity.type === 'table');
  const dags = teamEntities.filter((entity) => entity.type === 'dag');

  // Use server-computed, date-filtered metrics from /api/dashboard/summary (preferred)
  // Fall back to client-side calculation only if server data is unavailable
  const teamMetrics = teamSummaryData?.metrics || (teamEntities.length > 0 
    ? calculateMetrics(teamEntities, tables, dags)
    : null);

  // Extract individual metrics for display
  const overallComplianceAvg = teamMetrics?.overallCompliance || 0;
  const tablesComplianceAvg = teamMetrics?.tablesCompliance || 0;
  const dagsComplianceAvg = teamMetrics?.dagsCompliance || 0;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

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
                  label={`${teamMetrics?.entitiesCount || teamEntities.length} Entities`} 
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
                <Box display="flex" flexWrap="wrap" gap={0.5}>
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
                    teamMembers.map((member: any) => (
                      <Chip 
                        key={member.id}
                        label={member.displayName || member.username}
                        size="small"
                        variant="outlined"
                        sx={{ 
                          fontSize: '0.75rem',
                          height: '24px',
                          '& .MuiChip-label': { px: 1 }
                        }}
                      />
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No team members found
                    </Typography>
                  )}
                </Box>
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
          {[
            { 
              title: "Overall SLA Compliance", 
              value: hasRangeData ? overallComplianceAvg : 0, 
              trend: hasRangeData && teamMetrics ? 1.2 : 0, 
              progress: hasRangeData ? overallComplianceAvg : undefined, 
              suffix: "%",
              loading: teamSummaryLoading,
              showDataUnavailable: !teamSummaryLoading && !hasRangeData,
              infoTooltip: `Average SLA compliance calculated across all tables and DAGs for ${team.name} team`
            },
            { 
              title: "Tables SLA Compliance", 
              value: hasRangeData ? tablesComplianceAvg : 0, 
              trend: hasRangeData && teamMetrics ? 0.8 : 0, 
              progress: hasRangeData ? tablesComplianceAvg : undefined, 
              suffix: "%",
              loading: teamSummaryLoading,
              showDataUnavailable: !teamSummaryLoading && !hasRangeData,
              infoTooltip: `Average SLA compliance percentage calculated across all table entities for ${team.name} team`
            },
            { 
              title: "DAGs SLA Compliance", 
              value: hasRangeData ? dagsComplianceAvg : 0, 
              trend: hasRangeData && teamMetrics ? 1.5 : 0, 
              progress: hasRangeData ? dagsComplianceAvg : undefined, 
              suffix: "%",
              loading: teamSummaryLoading,
              showDataUnavailable: !teamSummaryLoading && !hasRangeData,
              infoTooltip: `Average SLA compliance percentage calculated across all DAG entities for ${team.name} team`
            },
            { 
              title: "Entities Monitored", 
              value: hasRangeData ? (teamMetrics?.entitiesCount || 0) : 0, 
              trend: 0, 
              suffix: "",
              loading: teamSummaryLoading,
              showDataUnavailable: !teamSummaryLoading && !hasRangeData,
              subtitle: teamMetrics ? `${teamMetrics.tablesCount} Tables • ${teamMetrics.dagsCount} DAGs` : ""
            }
          ].map((card, idx) => (
            <Box key={card.title} flex="1 1 250px" minWidth="250px">
              <MetricCard {...card} />
            </Box>
          ))}
        </Box>

        {/* Charts */}
        <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title="Compliance Trend"
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setChartFilter}
              loading={teamSummaryLoading}
              chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} data={canDisplayTrends ? (teamSummaryData?.complianceTrends?.trend || []) : []} entities={canDisplayTrends ? teamEntities : []} loading={teamSummaryLoading} />}
            />
          </Box>

          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title="Top 5 Entities Performance"
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setEntitiesChartFilter}
              loading={teamSummaryLoading}
              chart={<EntityPerformanceChart entities={hasRangeData ? teamEntities : []} filter={entitiesChartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
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
                trendLabel={`${teamDateRange.label} Trend`}
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
                trendLabel={`${teamDateRange.label} Trend`}
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
                  value={selectedUserId}
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
                  value={selectedMemberId}
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
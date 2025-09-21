import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { entitiesApi, teamsApi } from '../api';
import { Entity, Team, InsertEntity } from '@shared/schema';

// Define local types for the slice
interface EntityFilter {
  search: string;
  status: 'all' | 'healthy' | 'warning' | 'critical';
  teamId?: number;
  type?: string;
  sortBy: 'name' | 'status' | 'slaTarget' | 'lastRefreshed';
  sortDirection: 'asc' | 'desc';
}

interface CreateEntityPayload extends InsertEntity {}

interface UpdateEntityPayload {
  id: number;
  type: 'table' | 'dag';
  entity: any;
  updates: any;
}

interface EntitiesState {
  list: Entity[]; // For tenant-wide entities (Summary dashboard)
  teamLists: Record<number, Entity[]>; // For team-specific entities (Team dashboards)
  teams: Team[];
  selectedEntity: Entity | null;
  filter: EntityFilter;
  isLoading: boolean;
  error: string | null;
}

const initialState: EntitiesState = {
  list: [],
  teamLists: {},
  teams: [],
  selectedEntity: null,
  filter: {
    search: '',
    status: 'all',
    teamId: undefined,
    type: undefined,
    sortBy: 'name',
    sortDirection: 'asc',
  },
  isLoading: false,
  error: null,
};

// Async thunks
export const fetchEntities = createAsyncThunk(
  'entities/fetchAll',
  async (params: { teamId?: number; type?: string; tenant?: string } = {}) => {
    let entities;
    if (params.teamId) {
      entities = await entitiesApi.getByTeam(params.teamId);
      return { entities, isTeamSpecific: true, teamId: params.teamId };
    } else if (params.type) {
      entities = await entitiesApi.getByType(params.type);
      return { entities, isTeamSpecific: false };
    }
    entities = await entitiesApi.getAll(params.tenant);
    return { entities, isTeamSpecific: false };
  }
);

export const fetchEntity = createAsyncThunk(
  'entities/fetchOne',
  async (id: number) => {
    return await entitiesApi.getById(id);
  }
);

export const fetchTeams = createAsyncThunk(
  'entities/fetchTeams',
  async (teamName?: string) => {
    return await teamsApi.getAll(teamName);
  }
);


const entitiesSlice = createSlice({
  name: 'entities',
  initialState,
  reducers: {
    selectEntity: (state, action: PayloadAction<Entity | null>) => {
      state.selectedEntity = action.payload;
    },
    updateFilter: (state, action: PayloadAction<Partial<EntityFilter>>) => {
      state.filter = { ...state.filter, ...action.payload };
    },
    resetFilter: (state) => {
      state.filter = initialState.filter;
    },
    resetEntities: () => initialState,
    // Precise single-entity update without shared references
    upsertEntity: (state, action: PayloadAction<Entity>) => {
      const updatedEntity = action.payload;
      
      // Update in main tenant list with deep clone to prevent nested reference sharing
      const mainIndex = state.list.findIndex((entity: Entity) => entity.id === updatedEntity.id);
      if (mainIndex !== -1) {
        state.list[mainIndex] = structuredClone(updatedEntity);
      }
      
      // Update in all team lists where this entity exists with separate deep clones
      Object.keys(state.teamLists).forEach(teamIdStr => {
        const teamId = parseInt(teamIdStr);
        const teamIndex = state.teamLists[teamId].findIndex((entity: Entity) => entity.id === updatedEntity.id);
        if (teamIndex !== -1) {
          state.teamLists[teamId][teamIndex] = structuredClone(updatedEntity);
        }
      });
      
      // Update selected entity if it matches with deep clone
      if (state.selectedEntity && state.selectedEntity.id === updatedEntity.id) {
        state.selectedEntity = structuredClone(updatedEntity);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchEntities
      .addCase(fetchEntities.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchEntities.fulfilled, (state, action) => {
        state.isLoading = false;
        const { entities, isTeamSpecific, teamId } = action.payload;
        
        if (isTeamSpecific && teamId !== undefined) {
          // Store team-specific entities in teamLists bucket - deep clone to prevent nested reference sharing
          state.teamLists[teamId] = entities.map((e: Entity) => structuredClone(e));
        } else {
          // Store tenant-wide entities in main list - deep clone to prevent nested reference sharing
          state.list = entities.map((e: Entity) => structuredClone(e));
        }
      })
      .addCase(fetchEntities.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch entities';
      })
      
      // fetchEntity
      .addCase(fetchEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        // Deep clone to prevent nested reference sharing with list entities
        state.selectedEntity = structuredClone(action.payload);
      })
      .addCase(fetchEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch entity';
      })
      
      // fetchTeams
      .addCase(fetchTeams.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTeams.fulfilled, (state, action) => {
        state.isLoading = false;
        state.teams = action.payload;
      })
      .addCase(fetchTeams.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch teams';
      });
  },
});

export const { 
  selectEntity, 
  updateFilter, 
  resetFilter, 
  resetEntities,
  upsertEntity
} = entitiesSlice.actions;

export default entitiesSlice.reducer;

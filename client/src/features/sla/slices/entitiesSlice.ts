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

export const createEntity = createAsyncThunk(
  'entities/createEntity',
  async (entity: CreateEntityPayload) => {
    return await entitiesApi.create(entity);
  }
);

export const updateEntity = createAsyncThunk(
  'entities/updateEntity',
  async (payload: UpdateEntityPayload) => {
    return await entitiesApi.update(payload);
  }
);

export const deleteEntity = createAsyncThunk(
  'entities/deleteEntity',
  async (id: number) => {
    await entitiesApi.delete(id);
    return id;
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
          // Store team-specific entities in teamLists bucket
          state.teamLists[teamId] = entities;
        } else {
          // Store tenant-wide entities in main list
          state.list = entities;
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
        state.selectedEntity = action.payload;
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
      })
      
      // createEntity
      .addCase(createEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        const newEntity = action.payload;
        
        // Add to main tenant list
        state.list.push(newEntity);
        
        // Add to team bucket if entity has teamId
        if (newEntity.teamId && state.teamLists[newEntity.teamId]) {
          state.teamLists[newEntity.teamId].push(newEntity);
        }
      })
      .addCase(createEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to create entity';
      })
      
      // updateEntity
      .addCase(updateEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        const updatedEntity = action.payload;
        
        // Update in main tenant list
        const mainIndex = state.list.findIndex((entity: Entity) => entity.id === updatedEntity.id);
        if (mainIndex !== -1) {
          state.list[mainIndex] = updatedEntity;
        }
        
        // Update in all team lists where this entity exists
        Object.keys(state.teamLists).forEach(teamIdStr => {
          const teamId = parseInt(teamIdStr);
          const teamIndex = state.teamLists[teamId].findIndex((entity: Entity) => entity.id === updatedEntity.id);
          if (teamIndex !== -1) {
            state.teamLists[teamId][teamIndex] = updatedEntity;
          }
        });
        
        // Update selected entity if it matches
        if (state.selectedEntity && state.selectedEntity.id === updatedEntity.id) {
          state.selectedEntity = updatedEntity;
        }
      })
      .addCase(updateEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to update entity';
      })
      
      // deleteEntity
      .addCase(deleteEntity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteEntity.fulfilled, (state, action) => {
        state.isLoading = false;
        const deletedId = action.payload;
        
        // Remove from main tenant list
        state.list = state.list.filter((entity: Entity) => entity.id !== deletedId);
        
        // Remove from all team lists
        Object.keys(state.teamLists).forEach(teamIdStr => {
          const teamId = parseInt(teamIdStr);
          state.teamLists[teamId] = state.teamLists[teamId].filter((entity: Entity) => entity.id !== deletedId);
        });
        
        // Clear selected entity if it was deleted
        if (state.selectedEntity && state.selectedEntity.id === deletedId) {
          state.selectedEntity = null;
        }
      })
      .addCase(deleteEntity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to delete entity';
      });
  },
});

export const { 
  selectEntity, 
  updateFilter, 
  resetFilter, 
  resetEntities 
} = entitiesSlice.actions;

export default entitiesSlice.reducer;

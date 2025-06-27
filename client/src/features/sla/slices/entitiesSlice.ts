import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { entitiesApi, teamsApi } from '../api';
import { Entity, Team, EntityFilter, CreateEntityPayload, UpdateEntityPayload } from '../types';

interface EntitiesState {
  list: Entity[];
  teams: Team[];
  selectedEntity: Entity | null;
  filter: EntityFilter;
  isLoading: boolean;
  error: string | null;
}

const initialState: EntitiesState = {
  list: [],
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
  async (params: { teamId?: number; type?: string } = {}, { rejectWithValue }) => {
    try {
      return await entitiesApi.getAll(params);
    } catch (error) {
      console.error('Failed to fetch entities:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch entities');
    }
  }
);

export const fetchEntity = createAsyncThunk(
  'entities/fetchOne',
  async (id: number, { rejectWithValue }) => {
    try {
      return await entitiesApi.getById(id);
    } catch (error) {
      console.error('Failed to fetch entity:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch entity');
    }
  }
);

export const fetchTeams = createAsyncThunk(
  'entities/fetchTeams',
  async (_, { rejectWithValue }) => {
    try {
      return await teamsApi.getAll();
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch teams');
    }
  }
);

export const createEntity = createAsyncThunk(
  'entities/createEntity',
  async (entity: CreateEntityPayload, { rejectWithValue }) => {
    try {
      return await entitiesApi.create(entity);
    } catch (error) {
      console.error('Failed to create entity:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create entity');
    }
  }
);

export const updateEntity = createAsyncThunk(
  'entities/updateEntity',
  async (payload: UpdateEntityPayload, { rejectWithValue }) => {
    try {
      return await entitiesApi.update(payload.id, payload);
    } catch (error) {
      console.error('Failed to update entity:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to update entity');
    }
  }
);

export const deleteEntity = createAsyncThunk(
  'entities/deleteEntity',
  async (id: number, { rejectWithValue }) => {
    try {
      await entitiesApi.delete(id);
      return id;
    } catch (error) {
      console.error('Failed to delete entity:', error);
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to delete entity');
    }
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
        state.list = action.payload;
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
        state.list.push(action.payload);
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
        const index = state.list.findIndex(entity => entity.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        if (state.selectedEntity && state.selectedEntity.id === action.payload.id) {
          state.selectedEntity = action.payload;
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
        state.list = state.list.filter(entity => entity.id !== action.payload);
        if (state.selectedEntity && state.selectedEntity.id === action.payload) {
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

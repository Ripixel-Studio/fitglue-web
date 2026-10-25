import { describe, it, expect } from 'vitest';
import { createStore } from 'jotai';
import {
  pipelineRunsAtom,
  activityStatsAtom,
  unsynchronizedAtom,
  pipelineRunsLastUpdatedAtom,
  unsynchronizedLastUpdatedAtom,
  isStatsLoadedAtom,
  isUnsynchronizedLoadedAtom,
} from '../activitiesState';
import {
  pendingInputsAtom,
  inputsLastUpdatedAtom,
  isLoadingInputsAtom,
  isInputsLoadedAtom,
} from '../inputsState';
import {
  userProfileAtom,
  profileLoadingAtom,
  profileErrorAtom,
  profilePictureUrlAtom,
} from '../userState';
import { userAtom, authLoadingAtom } from '../authState';
import {
  pluginRegistryAtom,
  pluginRegistryLastUpdatedAtom,
  isLoadingPluginRegistryAtom,
  isPluginRegistryLoadedAtom,
  pluginRegistryErrorAtom,
} from '../pluginRegistryState';

describe('activitiesState defaults', () => {
  const store = createStore();
  it('has sensible initial values', () => {
    expect(store.get(pipelineRunsAtom)).toEqual([]);
    expect(store.get(activityStatsAtom)).toEqual({ synchronizedCount: 0 });
    expect(store.get(unsynchronizedAtom)).toEqual([]);
    expect(store.get(pipelineRunsLastUpdatedAtom)).toBeNull();
    expect(store.get(unsynchronizedLastUpdatedAtom)).toBeNull();
    expect(store.get(isStatsLoadedAtom)).toBe(false);
    expect(store.get(isUnsynchronizedLoadedAtom)).toBe(false);
  });

  it('is writable', () => {
    store.set(isStatsLoadedAtom, true);
    expect(store.get(isStatsLoadedAtom)).toBe(true);
  });
});

describe('inputsState defaults', () => {
  const store = createStore();
  it('has sensible initial values', () => {
    expect(store.get(pendingInputsAtom)).toEqual([]);
    expect(store.get(inputsLastUpdatedAtom)).toBeNull();
    expect(store.get(isLoadingInputsAtom)).toBe(false);
    expect(store.get(isInputsLoadedAtom)).toBe(false);
  });
});

describe('userState defaults', () => {
  const store = createStore();
  it('has sensible initial values', () => {
    expect(store.get(userProfileAtom)).toBeNull();
    expect(store.get(profileLoadingAtom)).toBe(false);
    expect(store.get(profileErrorAtom)).toBeNull();
    expect(store.get(profilePictureUrlAtom)).toBeUndefined();
  });
});

describe('authState defaults', () => {
  const store = createStore();
  it('starts unauthenticated and loading', () => {
    expect(store.get(userAtom)).toBeNull();
    expect(store.get(authLoadingAtom)).toBe(true);
  });
});

describe('pluginRegistryState defaults', () => {
  const store = createStore();
  it('has sensible initial values', () => {
    expect(store.get(pluginRegistryAtom)).toBeNull();
    expect(store.get(pluginRegistryLastUpdatedAtom)).toBeNull();
    expect(store.get(isLoadingPluginRegistryAtom)).toBe(false);
    expect(store.get(isPluginRegistryLoadedAtom)).toBe(false);
    expect(store.get(pluginRegistryErrorAtom)).toBeNull();
  });
});

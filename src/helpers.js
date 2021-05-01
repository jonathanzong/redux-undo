// parseActions helper: takes a string (or array)
//                      and makes it an array if it isn't yet
export function parseActions (rawActions, defaultValue = []) {
  if (Array.isArray(rawActions)) {
    return rawActions
  } else if (typeof rawActions === 'string') {
    return [rawActions]
  }
  return defaultValue
}

// isHistory helper: check for a valid history object
export function isHistory (history) {
  return typeof history.present !== 'undefined' &&
    typeof history._allStates !== 'undefined' &&
    typeof history._parentIds !== 'undefined' &&
    typeof history._childrenIds !== 'undefined' &&
    typeof history._activeChildIds !== 'undefined' &&
    Array.isArray(history._allStates) &&
    Array.isArray(history._parentIds) &&
    Array.isArray(history._childrenIds) &&
    Array.isArray(history._activeChildIds)
}

// includeAction helper: whitelist actions to be added to the history
export function includeAction (rawActions) {
  const actions = parseActions(rawActions)
  return (action) => actions.indexOf(action.type) >= 0
}

// excludeAction helper: blacklist actions from being added to the history
export function excludeAction (rawActions) {
  const actions = parseActions(rawActions)
  return (action) => actions.indexOf(action.type) < 0
}

// combineFilters helper: combine multiple filters to one
export function combineFilters (...filters) {
  return filters.reduce((prev, curr) =>
    (action, currentState, previousHistory) =>
      prev(action, currentState, previousHistory) &&
      curr(action, currentState, previousHistory)
  , () => true)
}

export function groupByActionTypes (rawActions) {
  const actions = parseActions(rawActions)
  return (action) => actions.indexOf(action.type) >= 0 ? action.type : null
}

export function idOfState(state, history) {
  return history._allStates.indexOf(state);
}

export function getStateById(stateId, history) {
  return history._allStates[stateId];
}

export function getParentOfState(stateId, history) {
  const parentId = history._parentIds[stateId];
  return parentId;
}

export function getActiveChildOfState(stateId, history) {
  const activeChildId = history._activeChildIds[stateId];
  return activeChildId;
}

export function setActiveChildOfState(stateId, childId, history) {
  if (!history.childrenIds[stateId].includes(childId)) {
    return;
  }
  history._activeChildIds[stateId] = childId;
}

export function getChildrenOfState(stateId, history) {
  const childrenIds = history._childrenIds[stateId];
  return childrenIds;
}

export function canUndo(history) {
  const presentId = idOfState(history.present, history);
  const parentId = getParentOfState(presentId, history);
  return parentId !== null;
}

export function canRedo(history) {
  const presentId = idOfState(history.present, history);
  const activeChildId = getActiveChildOfState(presentId, history);
  return activeChildId !== null;
}

/*
{
  present,
  _allStates,
  _parentIds,
  _childrenIds,
  _activeChildIds,
  _latestUnfiltered,
  group
}
*/
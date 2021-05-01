import * as debug from './debug'
import { ActionTypes } from './actions'
import { parseActions, isHistory, idOfState, getStateById, getActiveChildOfState, getParentOfState } from './helpers'

// createHistory
function createHistory (state, ignoreInitialState) {
  const history = {
    present: state,
    _allStates: [state],
    _parentIds: [null],
    _childrenIds: [[]],
    _activeChildIds: [null],
    _latestUnfiltered: state,
    group: null
  }
  if (ignoreInitialState) {
    history._latestUnfiltered = null
  }
  return history;
}

// insert: insert `state` into history
function insert (history, state, limit, group) {

  debug.log('inserting', state)

  const {
    present,
    _allStates,
    _parentIds,
    _childrenIds,
    _activeChildIds
  } = history;

  const presentId = idOfState(present, history);
  const stateId = history._allStates.length;

  const new_allStates = [..._allStates, state];
  const new_parentIds = [..._parentIds, presentId];
  const new_childrenIds = [..._childrenIds, []];
  const new_activeChildIds = [..._activeChildIds, null];
  new_childrenIds[presentId] = [...new_childrenIds[presentId], stateId]
  new_activeChildIds[presentId] = stateId;

  return {
    present: state,
    _allStates: new_allStates,
    _parentIds: new_parentIds,
    _childrenIds: new_childrenIds,
    _activeChildIds: new_activeChildIds,
    _latestUnfiltered: state,
    group
  }
}

// jumpTo: jump to requested index in history
function jumpTo (history, stateId) {
  if (stateId < 0 || stateId >= history._allStates.length) return history

  const newState = getStateById(stateId, history);

  return {
    ...history,
    present: newState,
    _latestUnfiltered: newState
  }  
}

function jumpNext(history) {
  const {
    present
  } = history;

  const presentId = idOfState(present, history);
  const activeChildId = getActiveChildOfState(presentId, history);
  const newState = getStateById(activeChildId, history)

  return {
    ...history,
    present: newState,
    _latestUnfiltered: newState
  }
}

function jumpPrev(history) {
  const {
    present
  } = history;

  const presentId = idOfState(present, history);
  const parentId = getParentOfState(presentId, history);
  const newState = getStateById(parentId, history);

  return {
    ...history,
    present: newState,
    _latestUnfiltered: newState
  }
}

// helper to dynamically match in the reducer's switch-case
function actionTypeAmongClearHistoryType (actionType, clearHistoryType) {
  return clearHistoryType.indexOf(actionType) > -1 ? actionType : !actionType
}

// redux-undo higher order reducer
export default function undoable (reducer, rawConfig = {}) {
  debug.set(rawConfig.debug)

  const config = {
    limit: undefined,
    filter: () => true,
    groupBy: () => null,
    undoType: ActionTypes.UNDO,
    redoType: ActionTypes.REDO,
    jumpToPastType: ActionTypes.JUMP_TO_PAST,
    jumpToFutureType: ActionTypes.JUMP_TO_FUTURE,
    jumpType: ActionTypes.JUMP,
    neverSkipReducer: false,
    ignoreInitialState: false,
    syncFilter: false,

    ...rawConfig,

    initTypes: parseActions(rawConfig.initTypes, ['@@redux-undo/INIT']),
    clearHistoryType: parseActions(
      rawConfig.clearHistoryType,
      [ActionTypes.CLEAR_HISTORY]
    )
  }

  // Allows the user to call the reducer with redux-undo specific actions
  const skipReducer = config.neverSkipReducer
    ? (res, action, ...slices) => ({
      ...res,
      present: reducer(res.present, action, ...slices)
    })
    : (res) => res

  let initialState
  return (state = initialState, action = {}, ...slices) => {
    debug.start(action, state)

    let history = state
    if (!initialState) {
      debug.log('history is uninitialized')

      if (state === undefined) {
        const createHistoryAction = { type: '@@redux-undo/CREATE_HISTORY' }
        const start = reducer(state, createHistoryAction, ...slices)

        history = createHistory(
          start,
          config.ignoreInitialState
        )

        debug.log('do not set initialState on probe actions')
        debug.end(history)
        return history
      } else if (isHistory(state)) {
        history = initialState = config.ignoreInitialState
          ? state : {...state, _latestUnfiltered: state.present}
        debug.log(
          'initialHistory initialized: initialState is a history',
          initialState
        )
      } else {
        history = initialState = createHistory(
          state,
          config.ignoreInitialState
        )
        debug.log(
          'initialHistory initialized: initialState is not a history',
          initialState
        )
      }
    }

    let res
    switch (action.type) {
      case undefined:
        return history

      case config.undoType:
        res = jumpPrev(history)
        debug.log('perform undo')
        debug.end(res)
        return skipReducer(res, action, ...slices)

      case config.redoType:
        res = jumpNext(history)
        debug.log('perform redo')
        debug.end(res)
        return skipReducer(res, action, ...slices)

      // case config.jumpToPastType:
      //   res = jumpToPast(history, action.index)
      //   debug.log(`perform jumpToPast to ${action.index}`)
      //   debug.end(res)
      //   return skipReducer(res, action, ...slices)

      // case config.jumpToFutureType:
      //   res = jumpToFuture(history, action.index)
      //   debug.log(`perform jumpToFuture to ${action.index}`)
      //   debug.end(res)
      //   return skipReducer(res, action, ...slices)

      case config.jumpType:
        res = jumpTo(history, action.index)
        debug.log(`perform jump to ${action.index}`)
        debug.end(res)
        return skipReducer(res, action, ...slices)

      case actionTypeAmongClearHistoryType(action.type, config.clearHistoryType):
        res = createHistory(history.present, config.ignoreInitialState)
        debug.log('perform clearHistory')
        debug.end(res)
        return skipReducer(res, action, ...slices)

      default:
        res = reducer(
          history.present,
          action,
          ...slices
        )

        if (config.initTypes.some((actionType) => actionType === action.type)) {
          debug.log('reset history due to init action')
          debug.end(initialState)
          return initialState
        }

        if (history._latestUnfiltered === res) {
          // Don't handle this action. Do not call debug.end here,
          // because this action should not produce side effects to the console
          return history
        }

        /* eslint-disable-next-line no-case-declarations */
        const filtered = typeof config.filter === 'function' && !config.filter(
          action,
          res,
          history
        )

        if (filtered) {
          // if filtering an action, merely update the present
          const presentId = idOfState(history.present, history);
          history._allStates[presentId] = res;
          const filteredState = {
            ...history,
            present: res,
            _latestUnfiltered: res
          }
          if (!config.syncFilter) {
            filteredState._latestUnfiltered = history._latestUnfiltered
          }
          debug.log('filter ignored action, not storing it in past')
          debug.end(filteredState)
          return filteredState
        }

        /* eslint-disable-next-line no-case-declarations */
        const group = config.groupBy(action, res, history)

        if (group != null && group === history.group) {
          // if grouping with the previous action, only update the present
          const presentId = idOfState(history.present, history);
          history._allStates[presentId] = res;
          const groupedState = {
            ...history,
            present: res,
            _latestUnfiltered: res
          }
          debug.log('groupBy grouped the action with the previous action')
          debug.end(groupedState)
          return groupedState
        }

        // If the action wasn't filtered or grouped, insert normally
        history = insert(history, res, config.limit, group)

        debug.log('inserted new state into history')
        debug.end(history)
        return history
    }
  }
}

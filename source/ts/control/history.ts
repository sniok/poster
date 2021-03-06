// Copyright (c) Jonathan Frederic, see the LICENSE file for more info.

import utils = require('../utils/utils');
import keymap = require('./map');

export interface IHistoryPush { 
    (
        forward_name: string, 
        forward_params: any[], 
        backward_name: string,
        backward_params: any[],
        autogroup_delay?: number
    ): void; 
}

export interface IHistory {
    push_action: IHistoryPush;
}

export interface IHistoricAction {
    forward: {
        name: string;
        parameters: any[];
    };
    backward: {
        name: string;
        parameters: any[];
    };
}

/**
 * Reversible action history.
 */
export class History extends utils.PosterClass implements IHistory {
    private _map: keymap.Map;
    private _actions: IHistoricAction[];
    private _action_groups: IHistoricAction[][];
    private _undone: IHistoricAction[][];
    private _autogroup: number;
    private _action_lock: boolean;

    public constructor(map) {
        super();
        this._map = map;
        this._actions = [];
        this._action_groups = [];
        this._undone = [];
        this._autogroup = null;
        this._action_lock = false;

        keymap.Map.register('history.undo', utils.proxy(this.undo, this));
        keymap.Map.register('history.redo', utils.proxy(this.redo, this));
    }

    /**
     * Push a reversible action to the history.
     * @param forward_name - name of the forward action
     * @param forward_params - parameters to use when invoking the forward action
     * @param backward_name - name of the backward action
     * @param backward_params - parameters to use when invoking the backward action
     * @param [autogroup_delay] - time to wait to automatically group the actions.
     *                            If this is undefined, autogrouping will not occur.
     */
    public push_action(forward_name: string, forward_params: any[], backward_name: string, backward_params: any[], autogroup_delay?: number): void {
        if (this._action_lock) return;

        this._actions.push({
            forward: {
                name: forward_name,
                parameters: forward_params,
            },
            backward: {
                name: backward_name,
                parameters: backward_params,
            }
        });
        this._undone = [];

        // If a delay is defined, prepare a timeout to autogroup.
        if (autogroup_delay !== undefined) {

            // If another timeout was already set, cancel it.
            if (this._autogroup !== null) {
                clearTimeout(this._autogroup);
            }

            // Set a new timeout.
            this._autogroup = setTimeout(() => {
                this.group_actions();
            }, autogroup_delay);
        }
    }

    /**
     * Commit the pushed actions to one group.
     */
    public group_actions(): void {
        this._autogroup = null;
        if (this._action_lock) return;
        
        this._action_groups.push(this._actions);
        this._actions = [];
        this._undone = [];
    }

    /**
     * Undo one set of actions.
     */
    public undo(): boolean {
        // If a timeout is set, group now.
        if (this._autogroup !== null) {
            clearTimeout(this._autogroup);
            this.group_actions();
        }

        var undo: IHistoricAction[];
        if (this._actions.length > 0) {
            undo = this._actions;
        } else if (this._action_groups.length > 0) {
            undo = this._action_groups.pop();
            undo.reverse();
        } else {
            return true;
        }

        // Undo the actions.
        if (!this._action_lock) {
            this._action_lock = true;
            try {
                undo.forEach((action: IHistoricAction) => {
                    this._map.invoke(action.backward.name, action.backward.parameters);
                });
            } finally {
                this._action_lock = false;
            }
        }

        // Allow the action to be redone.
        this._undone.push(undo);
        return true;
    }

    /**
     * Redo one set of actions.
     */
    public redo(): boolean {
        if (this._undone.length > 0) {
            var redo: IHistoricAction[] = this._undone.pop();
            
            // Redo the actions.
            if (!this._action_lock) {
                this._action_lock = true;
                try {
                    redo.forEach((action: IHistoricAction) => {
                        this._map.invoke(action.forward.name, action.forward.parameters);
                    });
                } finally {
                    this._action_lock = false;
                }
            }

            // Allow the action to be undone.
            this._action_groups.push(redo);
        }
        return true;
    }
}
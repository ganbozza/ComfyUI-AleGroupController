/**
 *  Match, Alternate & Exclude Group Controller
 *
 * Right-click a Ale Group Controller node → "Properties" or
 * "Properties Panel" and fill in any/all of the new fields.
 *
 * Each property accepts comma-separated sets. Within a set, group names are
 * separated by colons. Sets may contain TWO OR MORE groups:
 *
 * Alternate Groups - comma-separated sets separated by ":"
 *                     Example:  "Load Video:Load Image:Load Webcam"
 *                               "Save Video:Save Image, Mode A:Mode B:Mode C"
 *                     Effect:   Enabling any member disables all others in
 *                               the set (radio-button style). Relationship is one directional.
 *
 * Match Groups : Only list groups with matching title (regexp style)
 *              Example : ^Group|OtherGroup
 *              Effect : List Group A, Group B, Group C and OtherGroup... 
 *
 * Exclude Groups : List all other groups EXCEPT with matching title (regexp style)
 *                   Example : ^OtherGroup|Group D
 *                   Effect : List all group excep OtherGroup A, OtherGroup B & Group D.
 *
 *                   
**/
import { app } from "../../scripts/app.js";

import { ALEGROUPCONTROLLER_SERVICE } from "./controller_service.js";
const MODE_MUTE = 2;
const MODE_BYPASS = 4;
const EXCLUDE_KEY = "Exclude Groups";
const ALTERNATE_KEY = "Alternate Groups";
const MATCH_KEY = "Match Groups";
const MUTE_KEY = "Mute Groups";
const SORT_A_KEY = "Sort Alphanumeric";

/*
function findNodeInAllGraphs(currentGraph, nodeId) {
    // 1. Check the current graph level
    let node = currentGraph.getNodeById(nodeId);
    if (node) return node;

    // 2. Iterate through all nodes on this level to find subgraphs
    for (const topNode of currentGraph._nodes) {
        // Check if the node acts as a subgraph container
        if (topNode.subgraph) {
            // Recursively search inside the subgraph
            node = findNodeInAllGraphs(topNode.subgraph, nodeId);
            if (node) return node;
        }
    }

    // 3. Return null if not found anywhere in this branch
    return null;
}
*/

function getBypassOrMute(node, group_name) {
    return (node.properties?.[MUTE_KEY].split(",").map(item => item.trim()).includes(group_name)) ? MODE_MUTE : MODE_BYPASS;
}

function addBooleanWidgetToNode(node, title, default_value, key) {
  const boolNode = node.addWidget(
        "toggle",
        title,
        default_value,
        (value) => {
            ALEGROUPCONTROLLER_SERVICE._updatingWidget++;
            //const mode_val = (value===true) ? LiteGraph.ALWAYS : getBypassOrMute(node, title);
            ALEGROUPCONTROLLER_SERVICE.group_collections.get(key).value = value;
            const available_groups = ALEGROUPCONTROLLER_SERVICE.getAllGroups();
            for(const _group of available_groups.filter((available_group)=>available_group.title==title)) {
               ALEGROUPCONTROLLER_SERVICE.processNodeInsideGroup(_group, (value===true) ? LiteGraph.ALWAYS : getBypassOrMute(node, title), true);
            }
            const myAltGroupNames = [...new Set(parseSets(node.properties?.[ALTERNATE_KEY]  || "").get(title))];
            if(myAltGroupNames.length>0) {
                myAltGroupNames.forEach((alt_group_name) => {
                   for(const _group of available_groups.filter((available_group)=>available_group.title==alt_group_name)) {
                       ALEGROUPCONTROLLER_SERVICE.processNodeInsideGroup(_group, ((value===false) ? LiteGraph.ALWAYS : getBypassOrMute(node, title)), true);
                   }
                });
            }
            
            /*
            if(gc) {
                gc.value = mode_val;
                ALEGROUPCONTROLLER_SERVICE.updateNodeInsideGroupByTitle(gc.title, mode_val);
                const myAltGroupNames = [...new Set(parseSets(node.properties?.[ALTERNATE_KEY]  || "").get(title))];
                if(myAltGroupNames.length>0) {
                    const available_groups = ALEGROUPCONTROLLER_SERVICE.getAllGroups();
                   myAltGroupNames.forEach((alt_group_name) => {
                       for(const group of available_groups.filter((available_group)=>available_group.title==alt_group_name)) {
                           ALEGROUPCONTROLLER_SERVICE.processNodeInsideGroup(group, (mode_val===4) ? 0 : 4, true);
                       }
                   });
                }
            }
            */
            ALEGROUPCONTROLLER_SERVICE._updatingWidget--;
        },
          //function(value) { booleanWidgetCallback(value, key); },
      /*
        (value) => {
          // Optional: callback when toggle changes
          const mode_val = (value===true) ? MODE_BYPASS : LiteGraph.ALWAYS;
          const gc = ALEGROUPCONTROLLER_SERVICE.group_collections.get(key);
          gc.value = mode_val;
          ALEGROUPCONTROLLER_SERVICE.updateNodeInsideGroupByTitle(gc.title, mode_val);
        },
        */
        { serialize: true, title: title }
      );
    boolNode._hash_ref = [...Array(12)].map(() => Math.random().toString(36)[2]).join('');
    return boolNode;
}
/*
function booleanWidgetCallback(value, key)
{
    const mode_val = (value===true) ? MODE_BYPASS : LiteGraph.ALWAYS;
    const gc = ALEGROUPCONTROLLER_SERVICE.group_collections.get(key);
    if(gc) {
        gc.value = mode_val;
        ALEGROUPCONTROLLER_SERVICE.updateNodeInsideGroupByTitle(gc.title, mode_val);
        const group_alternate = parseSets(node.properties?.[ALTERNATE_KEY]  || "");
    }
}
*/

function parseSets(str) {
  const group_map = new Map();
  if (!str?.trim()) return group_map;

  for (const part of str.split(",")) {
    // Split on ":" to get every member of this set
    //const members = part.split(":").map((s) => s.trim()).filter(Boolean);
    // only get member that exists in group_collections
    const groups = part.split(":").map((s) => s.trim()).filter(Boolean).filter(num => ALEGROUPCONTROLLER_SERVICE.group_collections.has(num.trim().toLowerCase()));
    if (groups.length < 2) continue; // need at least a pair
      const group = groups[0];
      const others = groups.filter((_, j) => j !== 0);
        if (group_map.has(group)) {
            const entry = group_map.get(group);
            for (const o of others) {
              if (!entry.includes(o)) entry.push(o);
            }
        } else {
            group_map.set(group, others) ;
        }
  }
  return group_map;
}

function refreshWidgets(node) {
    if (node._refreshInProgress) return;
 requestAnimationFrame(() => {    
    node._refreshInProgress = true;
    let updated = false;

    try {
        if (!node.graph) { console.log(`[${node.__dbgId||"??"}] refreshWidgets: no graph, bailing`); return; }

        console.log(`[${node.__dbgId||"??"}] refreshWidgets: node.inputs =`, node.inputs, "node.widgets =", node.widgets);


        let service_groups_collection;
        if (node.properties?.[SORT_A_KEY]) {
            service_groups_collection = new Map([...ALEGROUPCONTROLLER_SERVICE.group_collections.entries()].sort(
                (a, b) => ALEGROUPCONTROLLER_SERVICE.ALPHABETICAL_COLLATOR.compare(a[1].title, b[1].title) || a[1].key.localeCompare(b[1].key),
            ));
        } else {
            service_groups_collection = ALEGROUPCONTROLLER_SERVICE.group_collections;
        }

        console.log(`[${node.__dbgId||"??"}] refreshWidgets: group_collections size:`, ALEGROUPCONTROLLER_SERVICE.group_collections.size, "properties:", JSON.stringify(node.properties));
        
        if (service_groups_collection.size > 0) node._groupcollected = true;

        // Desired final order
        const desiredOrder = [];
        for (const [gkey, gval] of service_groups_collection) {
            try {
                if (((node.properties?.[MATCH_KEY]?.trim().length > 0) && (!new RegExp(node.properties?.[MATCH_KEY], "i").exec(gval.title))) ||
                    ((node.properties?.[EXCLUDE_KEY]?.trim().length > 0) && (new RegExp(node.properties?.[EXCLUDE_KEY], "i").exec(gval.title)))) {
                    continue;
                }
            } catch (e) { continue; }
            desiredOrder.push(gval);
        }

        console.log(`[${node.__dbgId||"??"}] refreshWidgets: desiredOrder length =`, desiredOrder.length, "titles:", desiredOrder.map(g=>g.title));
        
        const desiredTitles = new Set(desiredOrder.map(g => g.title));

        // PHASE 1: remove filtered-out groups via engine methods (handles disconnects safely)
        for (let i = node.inputs.length - 1; i >= 0; i--) {
            if (!desiredTitles.has(node.inputs[i].name)) {
                const w = node.widgets?.find(w => (w.options?.title ?? w.name) === node.inputs[i].name);
                if (w) node.removeWidget(w);
                node.removeInput(i);
                updated = true;
            }
        }

        // Snapshot survivors AFTER removal
        const survivorIndexByTitle = new Map();
        node.inputs.forEach((input, idx) => survivorIndexByTitle.set(input.name, idx));

        // PHASE 2: compute final desired index for every survivor
        const oldToNewSlot = new Map();
        let orderChanged = false;
           desiredOrder.forEach((gval, finalIdx) => {
                if (survivorIndexByTitle.has(gval.title)) {
                    const oldIdx = survivorIndexByTitle.get(gval.title);
                    oldToNewSlot.set(oldIdx, finalIdx);
                    if (oldIdx !== finalIdx) orderChanged = true;
                }
            });

        // PHASE 3: patch target_slot on affected links BEFORE moving objects
        // ⚠️ VERIFY: confirm removeInput() above doesn't already shift target_slot
        // for survivors, or this will double-shift. Test per the checklist below.
        if (orderChanged) {
            for (const link of node.graph.links.values()) {
                if (link.target_id === node.id && oldToNewSlot.has(link.target_slot)) {
                    link.target_slot = oldToNewSlot.get(link.target_slot);
                }
            }
            updated = true;
        }

        // PHASE 4: rebuild inputs/widgets in final order (reuse survivor refs)
        const newInputs = new Array(desiredOrder.length);
        const newWidgets = [];
        const currentInputs = node.inputs.slice();
        const currentWidgetByTitle = new Map((node.widgets || []).map(w => [(w.options?.title ?? w.name), w]));

        desiredOrder.forEach((gval, finalIdx) => {
            const oldIdx = survivorIndexByTitle.get(gval.title);
            if (oldIdx !== undefined) {
                // Input slot already exists...
                newInputs[finalIdx] = currentInputs[oldIdx];
                let w = currentWidgetByTitle.get(gval.title);
                if (!w) {
                    // ...but its paired widget is missing (e.g. after Unpack Subgraph,
                    // where only .inputs survives serialization, not live widgets).
                    // Recreate the widget and re-link it to the EXISTING input —
                    // do NOT create a new input, that would duplicate/orphan the old one.
                    w = addBooleanWidgetToNode(node, gval.title, gval.value, gval.key);
                    newInputs[finalIdx].widget = { name: gval.title, _hash_ref: w._hash_ref };
                    updated = true;
                }
                newWidgets.push(w);
            } else {
                // Genuinely new group: create both input and widget
                const boolWidget = addBooleanWidgetToNode(node, gval.title, gval.value, gval.key);
                node.addInput(gval.title, "BOOLEAN");
                const addedInput = node.inputs[node.inputs.length - 1];
                addedInput.widget = { name: gval.title, _hash_ref: boolWidget._hash_ref };
                node.inputs.pop();
                newInputs[finalIdx] = addedInput;
                newWidgets.push(boolWidget);
                updated = true;
            }
        });
        newWidgets.sort((a, b) => {
            const ta = a.options?.title ?? a.name, tb = b.options?.title ?? b.name;
            return desiredOrder.findIndex(g => g.title === ta) - desiredOrder.findIndex(g => g.title === tb);
        });

        node.inputs = newInputs;   // setter splices into _inputs in place
        node.widgets = newWidgets; // plain property, direct assign confirmed safe

        // _inputs setter does NOT refresh _concreteInputs — must do it ourselves
        node._setConcreteSlots();
        node._arrangeWidgetInputSlots();

        // PHASE 5: re-sync promotion for every still-linked input (idempotent, any depth)
        for (const input of node.inputs) {
            if (input.link == null) continue;
            const link_info = node.graph.links.get(input.link); // links is a Map
            if (!link_info) continue;
            const upstreamWidget = ALEGROUPCONTROLLER_SERVICE.getUpstreamWidgetByLink(link_info, node.graph);
            const localWidget = node.widgets.find(w => w._hash_ref === input.widget?._hash_ref);
            if (upstreamWidget && localWidget) syncPromotedWidgetCallback(upstreamWidget, localWidget);
        }
        
       console.log(`[${node.__dbgId||"??"}] refreshWidgets pass complete. widgets now:`, node.widgets?.length, "updated:", updated);
        
        if (updated) app.graph?.setDirtyCanvas?.(true, true);
   } catch (err) {
        console.error(`[${node.__dbgId||"??"}] refreshWidgets THREW:`, err);
    } finally {
        node._refreshInProgress = false;
        setTimeout(() => refreshWidgets(node), 100);
    }
});
}

function setWidgetValue(widget, value=null) {
    if(value!==null)
        widget.value = value;

    if (typeof widget.callback === "function") {
        widget.callback(widget.value);
    }
}

function bindNode(node) {
  if (node.__groupBypasserBound) {
    return;
  }
  node.__groupBypasserBound = true;
  
  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    // Clean up service references safely when deleted from canvas
    ALEGROUPCONTROLLER_SERVICE.unregisterNode(this);
    return originalOnRemoved?.apply(this, arguments);
  };

  const originalOnStateChanged = node.onStateChanged;
  node.onStateChanged = function() {
    console.log("State changed...");
  }
 
}
/*
function widgetCallback(value) {
    console.log("Widget callback explicitly executed with value:", value);
    // Put your frontend UI update properties logic here!
}
*/
/*
// Hook directly into the global websocket stream
api.addEventListener("my_custom_node_finished", (event) => {
    const data = event.detail;
    console.log("[FRONTEND WEB EVENT RECEIVED]", data);
    
    if (!data || !data.node_id) return;

    const targetNode = app.graph.getNodeById(data.node_id);
    if (targetNode) {
        const widget = targetNode.widgets.find(w => w.name === "dynamic_bool_input");
        if (widget) {
            // Force synchronize the state values
            widget.value = data.resolved_value;
            
            // Execute your custom widget properties trigger logic manually
            if (typeof widget.callback === "function") {
                widget.callback(data.resolved_value);
            }
            targetNode.setDirtyCanvas(true, true);
        }
    }
});
*/


function findParentSubgraphNode(node) {
    if (node.graph && node.graph._subgraph_node) {
        return node.graph._subgraph_node;
    }
    // Fallback: search main canvas arrays if initialization is lagging
    if (app.graph && app.graph._nodes) {
        for (const outerNode of app.graph._nodes) {
            if (outerNode.subgraph && outerNode.subgraph._nodes) {
                if (outerNode.subgraph._nodes.includes(node)) {
                    return outerNode;
                }
            }
        }
    }
    return null;
}
function syncPromotedWidgetCallback(promotedWidget, sourceWidget) {
    if((!promotedWidget) || (!sourceWidget) || (promotedWidget._is_hijacked)) return;
    requestAnimationFrame(() => {
        //const origPromotedCallback = (typeof promotedWidget.origPromotedCallback === "function") ? promotedWidget.origPromotedCallback : promotedWidget.callback;
        let origPromotedCallback = promotedWidget.callback;
        
        // Hijack the top-level master proxy toggle box safely
        const newCallback = function(value) {
            if (typeof origPromotedCallback === "function") {
                origPromotedCallback?.apply(this, arguments);
            }
            
            // Push the changed state down to our interior node widget
            sourceWidget.value = value;
            
            // FORCED TRIGGER: Instantly execute custom frontend logic callback
            if (typeof sourceWidget.callback === "function") {
                sourceWidget.callback(value);
            }
        };

        // Initialize the widget with our new custom callback
        promotedWidget.callback = newCallback;

         // Mark as hijacked to prevent endless callback attachment stacks
         promotedWidget._is_hijacked = true;
        
        // 4. Lock it down using a getter and setter
        Object.defineProperty(promotedWidget, "callback", {
            get() { 
                return newCallback; 
            },
            set(newEngineCallback) { 
                // If ComfyUI or another extension tries to change the callback later:
                if (newEngineCallback !== newCallback) {
                    console.log("Intercepted an engine callback update. Saving it to fallback.");
                    // Update our pointer so the engine's new function gets executed inside our wrapper
                    origPromotedCallback = newEngineCallback;
                }
            },
            configurable: true,
            enumerable: true
        });        
    });
}
/*
// --- Helper: Bind callbacks directly between inner widgets and outer promoted proxies ---
function syncPromotedWidgetCallback(node, slotName) {
  const localWidget = node.widgets?.find(w => w.name === slotName);
  if (!localWidget) return;
  
  const parentSubgraphNode = findParentSubgraphNode(node);
  if (parentSubgraphNode) {
      // Locate the newly generated proxy widget exposed on the outer super-node frame
      const promotedWidget = parentSubgraphNode.widgets?.find(w => w.name === slotName || w.label === slotName);
      
      if (promotedWidget && !promotedWidget._is_hijacked) {
        const origPromotedCallback = promotedWidget.callback;
      
        // Hijack the top-level master proxy toggle box safely
        promotedWidget.callback = function(value) {
            origPromotedCallback?.apply(this, arguments);
            
            // Push the changed state down to our interior node widget
            localWidget.value = value;
            
            // FORCED TRIGGER: Instantly execute custom frontend logic callback
            if (typeof localWidget.callback === "function") {
                localWidget.callback(value);
            }
        };
        
        // Mark as hijacked to prevent endless callback attachment stacks
        promotedWidget._is_hijacked = true;
      
        // Foundational immediate value sync upon initial load/promotion
        if (promotedWidget.value !== undefined && localWidget.value !== promotedWidget.value) {
            localWidget.value = promotedWidget.value;
            if (typeof localWidget.callback === "function") {
                localWidget.callback(promotedWidget.value);
            }
        }
      }
  } else {

      
  }
}
*/

app.registerExtension({
    name: "ale.group.controller",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (String(nodeData?.name || "") !== "AleGroupController") {
          return;
        }
        
        // Module-scoped, keyed by node identity — survives across all instances
        // without ever polluting the node object itself or its serialized state.
        const _initializedNodes = new WeakSet();
        
        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            this.__dbgId = Math.random().toString(36).slice(2, 8);
            console.log(`[${this.__dbgId}] onNodeCreated fired. graph attached:`, !!this.graph);
            const result = originalOnNodeCreated?.apply(this, arguments);
            if (_initializedNodes.has(this)) { console.log(`[${this.__dbgId}] already initialized, skipping`); return result; }
            _initializedNodes.add(this)
        
            if (!this.properties || typeof this.properties !== "object") {
                this.properties = {};
            }
            if (typeof this.properties[SORT_A_KEY] !== "boolean") this.properties[SORT_A_KEY] = true;
            if (typeof this.properties[MATCH_KEY] !== "string") this.properties[MATCH_KEY] = "";
            if (typeof this.properties[ALTERNATE_KEY] !== "string") this.properties[ALTERNATE_KEY] = "";
            if (typeof this.properties[EXCLUDE_KEY] !== "string") this.properties[EXCLUDE_KEY] = "";
            if (typeof this.properties[MUTE_KEY] !== "string") this.properties[MUTE_KEY] = "";
        
            bindNode(this);
            ALEGROUPCONTROLLER_SERVICE.init();
            ALEGROUPCONTROLLER_SERVICE.registerNode(this);
            refreshWidgets(this); // safe to call immediately now — it self-guards on node.graph and self-retries
            
            return result;
        };

        const origOnAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function(graph) {
            console.log(`[${this.__dbgId || "??"}] onAdded. widgets:`, this.widgets?.length);
            const result = origOnAdded?.apply(this, arguments);
            return result;
        };
        
        const originalOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            console.log(`[${this.__dbgId || "??"}] onConfigure. widgets:`, this.widgets?.length, "values:", info?.widgets_values, "graph attached:", !!this.graph);
            const result = originalOnConfigure?.apply(this, arguments);
            return result;
        };
      
      const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
      // 2. Override the prototype method for all nodes of this type
      nodeType.prototype.onConnectionsChange = function (side, slot, connect, link_info, output) {
          
          // 3. Always run the original LiteGraph/Comfy logic first to prevent UI breaking
          const result = origOnConnectionsChange?.apply(this, arguments);

           // --- Hook 4: Link Wire Alteration Fallback ---
          // 'side' or 'type': 1 = Input (Left side), 2 = Output (Right side)
          // 'connect': true if a wire was plugged in, false if a wire was removed
          if (side === 1 && this.inputs[slot] && output.widget && output.widget._hash_ref) {
             // this.inputs[slot].widget = { name: this.inputs[slot].name, _hash_ref : output.widget._hash_ref };
              if(connect && link_info) {
                 
              }
          }         

          // Always return the original execution result
          return result;
      }; 

        const origOnDrawBackground = nodeType.prototype.onDrawBackground;
        nodeType.prototype.onDrawBackground = function(ctx) {
            const result = origOnDrawBackground?.apply(this, arguments);

            
            return result;
        };
    },

});

    

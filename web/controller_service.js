import { app } from "../../scripts/app.js";

const MODE_ACTIVE = LiteGraph.ALWAYS;
const MODE_BYPASS = 4;

function normalizeTitle(title) {
  return String(title || "").trim();
}

function toKey(title) {
  return normalizeTitle(title).toLowerCase();
}

class AleGroupControllerService {
  constructor() {
    this.initialized = false;
    this._updatingWidget = false;
    this.nodes = new Set();
    this.group_collections = new Map();    
    this.ALPHABETICAL_COLLATOR = new Intl.Collator(undefined, {
                                    sensitivity: "base",
                                    numeric: true,
                                  });
    
  }
  
  init() {
      const self = this;
      if (self.initialized) return;
      self.initialized = true;

    /*
    // 1. Capture the original LiteGraph layout instantiation method safely
      const origGraphAdd = LGraph.prototype.add;
    // 2. Override the baseline graph prototype globally
      LGraph.prototype.add = function(obj, ...args) {
          //3. Run the native instantiation system first to ensure LiteGraph registers the object properties
          const result = origGraphAdd.apply(this, arguments);
  
        if (obj && obj.constructor && obj.constructor.name === "LGraphGroup") {
            self.addGroupToCollection(obj);            
        }
          
        return result;
      };
      */
      /*
        const origGraphRemove = LGraph.prototype.remove;
      LGraph.prototype.remove = function(obj, ...args) {
          const result = origGraphRemove.apply(this, arguments);
  
        if (obj && obj.constructor && obj.constructor.name === "LGraphGroup") {
            self.removeGroupFromCollection(obj);            
        }
          
        return result;
      };
     */
      // Intercept LiteGraph drawing loop
      
      const origDraw = LGraphCanvas.prototype.draw;
      LGraphCanvas.prototype.draw = function(...args) {
        if (!app.canvas.isDragging) {
          
          const available_groups = self.getAllGroups();
          // remove non-existent group in group_collection
          self.group_collections = new Map([...self.group_collections].filter(([_, val]) => available_groups.some(b => b.title === val.title))); 
          for (const group of available_groups.filter((item, index, self) => self.findIndex(t => t.title === item.title) === index) /* contains unique array*/ ) {
              if(self.group_collections.has(normalizeTitle(group.title).toLowerCase())) {
                  continue;
              }
              // add group to collection
              self.addGroupToCollection(group);
          }
          
          self.processGroupCollection(available_groups);
          self._groupSignature = [...self.group_collections.keys()].join("|");
          // update widget state in each bypasser node to follow group_collection state
          self.syncNodesWidgetValue();            
        }
        return origDraw.apply(this, args);
      };

      //this.available_groups = self.getAllGroups();
      //for (const group of this.available_groups.filter((item, index, self) => self.findIndex(t => t.title === item.title) === index) /* contains unique array*/) {
      //    // add group to collection
      //    self.addGroupToCollection(group);
      //}

    console.log("AleGroupController_Service initialized...");
  }

  getAllGroups(graphContext = app.graph) {
    let gatheredGroups = [];
    
    // 1. Grab all groups present in the current graph layer context
    if (graphContext._groups && graphContext._groups.length > 0) {
      for (const group of graphContext._groups) {
          // We append a helpful 'layer' property so you know exactly where this group lives
          gatheredGroups.push(group);
      }
    }
    
    // 2. Scan all nodes in this layer to check for nested Subgraphs
    if (graphContext._nodes) {
      for (const node of graphContext._nodes) {
          // Check if the node contains an internal nested subgraph
          if (node.subgraph && node.subgraph instanceof LGraph) {    
              // Recurse into the sub-graph layer and merge the results
              const subGroups = this.getAllGroups(node.subgraph);
              gatheredGroups = gatheredGroups.concat(subGroups);
          }
      }
    }
    
    return gatheredGroups;
  }
  
  addGroupToCollection(group) {
    const title = normalizeTitle(group.title);
    if(!title) { 
      return; 
    }
    const key = toKey(group.title);
    if(!this.group_collections.has(key)) {
        this.group_collections.set(key, {
            key,
            title,
            value : true,
            hasActiveNodes : true,
            hasNonActiveNodes : true
        });
      console.log("A new group is being added to the collection.");
    }
  /*
    if (this.group_collections.get(key).value === MODE_BYPASS) { // ignore if group already in active state
      this.group_collections.get(key).value =  (this.processNodeInsideGroup(group, MODE_BYPASS)) ? MODE_ACTIVE : MODE_BYPASS;
    }
  */  
  }
  /*
  removeGroupFromCollection(group) {
    const title = normalizeTitle(group.title);
    if(!title) { 
      return; 
    }
    this.available_groups.splice(this.available_groups.indexOf(group.title), 1)
    this.group_collections = this.available_groups.filter((item, index, self) => self.findIndex(t => t.title === item.title) === index);
    console.log("Group has been removed from collection.");

  }
  */
  
  syncNodesWidgetValue(ms=300) {
      if(this._updatingWidget>0) return;
      this._updatingWidget++;
      setTimeout(() => {
          for (const node of this.nodes) {
            if(this._updatingWidget>1) return;
            if(node.widgets && node.graph) {
                for(const w of node.widgets) {
                  let widget = w;
                  const link = [...node.graph.links.values()].find((l)=>l.id===node.inputs[node.findInputSlot(w.name)]?.link);
                  if(link) {
                    widget = this.getUpstreamWidgetByLink(link, node.graph);
                  }
                  const group = this.group_collections.get(this.nameToKey(w.name));
                  if(group && widget)
                  {
                    if(this._updatingWidget>1) return;
                    if(widget.value!==group.value) {
                      console.log("Changing value for "+w.name);               
                      widget.value = group.value;
                      node.setDirtyCanvas(true, true);
                    }
                  }
                }
              }
          }
        this._updatingWidget--;
      }, ms);    
  }
  
  nameToKey(name) {
    return name.trim().toLowerCase();
  }
  
    findWidget(node, name) {
      return (node.widgets || []).find((widget) => widget.name === name);
    }    
  
    processGroupCollection(available_groups) {
      /*
      if(this.group_collections.size > available_groups.length) {
        const ag_titles = [];
        for (const ag of available_groups) {
          ag_titles.push(ag.title);
        }
        for (const [key, val] of this.group_collections) {
          if(!ag_titles.includes(val.title)) {
            this.group_collections.delete(key);              
            console.log("Group removed from collection...");
          }
        }
      }
      */
      // sync state in group_collections with group's node mode
      for (const [key, val] of this.group_collections) {
        val.hasActiveNodes = false;
        val.hasNonActiveNodes = false;
        for (const group of available_groups) {
          if (group.title==val.title) {
             if(this.processNodeInsideGroup(group, MODE_ACTIVE)) {
               val.hasActiveNodes = true;
             } else {
               val.hasNonActiveNodes = true
             }
            if(val.hasActiveNodes && val.hasNonActiveNodes) {
               break;
            }
          }
        }
      }
      for (const [key, val] of this.group_collections) {
        if((val.value && !val.hasActiveNodes) || (!val.value && !val.hasNonActiveNodes)) {
          val.value = (val.value===true) ? false : true;
        }
      }

    }
      
    /*
    updateNodeInsideGroupByTitle(title, mode) {
       const available_groups = app.graph?._groups || [];
       for (const group of available_groups) {
          if(normalizeTitle(group.title)===title) {
              this.processNodeInsideGroup(group, mode, true);
          }
       }
    }
    */
  
    processNodeInsideGroup(group, mode, is_set=false) {
         if (app.canvas.isDragging)
            return;
        try {
        for (const node of group.graph.nodes) {
            //const nodeBounding = node.getBounding();
            const nodeBounding = ((node._boundingRect[2]>0) || (node._boundingRect[3]>0)) ? node._boundingRect : node._posSize;
            const nodeCenter = nodeBounding &&
                [nodeBounding[0] + nodeBounding[2] * 0.5, nodeBounding[1] + nodeBounding[3] * 0.5];
            if (nodeCenter) {
              const grouBounds = group._bounding;
              if (nodeCenter[0] >= grouBounds[0] &&
                  nodeCenter[0] < grouBounds[0] + grouBounds[2] &&
                  nodeCenter[1] >= grouBounds[1] &&
                  nodeCenter[1] < grouBounds[1] + grouBounds[3]) {
                  if(!is_set && node.mode===mode) {
                    return true;
                  } else if (is_set && node.mode!==mode) {
                      node.mode = mode;
                      node.setDirtyCanvas(true, true);
                  }
              }
          }
        }
        }catch(e) {
          console.log('e');
        }
        //if(!is_set)
        //  console.log("all bypassed...");
        return false;
    }
  
    /*
    getGroupNodes(group) {
        return Array.from(group._children).filter((c) => c instanceof LGraphNode);
    }
    */
    
    registerNode(node) {
      if(this.nodes.has(node)) {
        console.log("Nodes already exists...");
        return;
      }
        this.nodes.add(node);
        console.log("Adding node...");
    }

    unregisterNode(node) {
        this.nodes.delete(node);
        console.log("Removing node...");
    }
  
    /*
    // Helper: Find which canvas group contains a node's position coordinates
    getGroupContainingNode(node) {
        const groups = app.graph?._groups || [];
        const [nX, nY] = node.pos;

        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            const [gX, gY] = group.pos;
            const [gW, gH] = group.size;

            if (nX >= gX && nX <= gX + gW && nY >= gY && nY <= gY + gH) {
                return group;
            }
        }
        return null;
    }

    // Main Engine: Scan controllers, find their groups, and toggle nested nodes
    updateAllGroupsState() {
        if (!app.graph) return;

        this.nodes.forEach(node => {
            const targetGroup = this.getGroupContainingNode(node);
            if (!targetGroup) return;

            // Get target operational state from the node's widget value
            // Custom state logic: "Active" (0), "Mute" (2), "Bypass" (4)
            const targetMode = node.widgets[0].value; 
            
            const [gX, gY] = targetGroup.pos;
            const [gW, gH] = targetGroup.size;
            const allNodes = app.graph._nodes || [];

            allNodes.forEach(_node => {
                // Ignore the controller itself to prevent infinite logic loops
                if (_node === node) return;

                const [nX, nY] = _node.pos;
                const isInside = nX >= gX && nX <= gX + gW && nY >= gY && nY <= gY + gH;

                if (isInside) {
                    const currentMode = _node.mode ?? 0;
                    if (currentMode !== targetMode) {
                        _node.mode = targetMode;
                        _node.setDirtyCanvas(true, true);
                    }
                }
            });
        });
    }
    */
  
  // inputs[1]._subgraphSlot.linkIds (subgraph punya input yg related dgn link id) dari link id tu boleh tgh node target_id & target_slot
  // one liner : [...app.graph._nodes.values()].filter(m => m.subgraph).find((m) => m.subgraph.links === app.graph.nodes[2].subgraph.links).inputs.find((i)=>i._subgraphSlot.linkIds.find(li => li===2))
  getUpstreamWidgetByLink(link, graphContext) {
    if(link.origin_id>0) {
        return graphContext.getNodeById(link.origin_id)?.inputs[link.origin_slot].widget;
    } else {
      return [...graphContext._rootGraph._nodes.values()].filter(n => n.subgraph).find((n) => [...n.subgraph.links.values()].find((l)=>l===link))?.inputs[link.origin_slot].widget;
    }
  }
  getUpstreamWidgetByLinka(link, graphContext) {
      /*
      if(link.origin_id>0) {
          const upstreamNode = graphContext.getNodeById(link.origin_id);
          const next_link =  [...graphContext.links.values()].filter(m => m.target_id===upstreamNode.id);
          if(next_link)
              return getUpstreamNodeById(next_link, graphContext);
          return upstreamNode;
      }
      */
      if(link.origin_id>0) {
          const nextUpstreamLink = [...graphContext.links.values()].find(m => m.target_id===link.origin_id)
          if(nextUpstreamLink)
              return this.getUpstreamWidgetByLink(nextUpstreamLink, graphContext);
          return graphContext.getNodeById(link.origin_id).widgets[link.origin_slot];
      } 
      // upstream is subgraph
      return this.getUpstreamWidgetInSubgraphByLink(link, graphContext._rootGraph);
  }
  
  getUpstreamWidgetInSubgraphByLinka(link, graphContext) {
      const upstreamSubgraph = [...graphContext._nodes.values()].filter(n => n.subgraph).find((n) => [...n.subgraph.links.values()].find((l)=>l===link))?.subgraph;
      if(upstreamSubgraph) {
        // takyah kut ni : const inputSlot = inputs.find((i)=>i._subgraphSlot.linkIds.find(li => li===link.id))
        const nextUpstreamLink = upstreamSubgraph.inputs[link.origin_slot].link;
        if (nextUpstreamLink) {
            return this.getUpstreamWidgetByLink(upstreamSubgraph.graph.links.get(nextUpstreamLink), upstreamSubgraph.graph);
        }
        const widgetId = upstreamSubgraph.inputs[link.origin_slot].widgetId;
        return upstreamSubgraph.widgets.find((w)=>w.widgetId===upstreamSubgraph.inputs[link.origin_slot].widgetId);
      }
      /*
      [...app.graph._nodes.values()].filter(m => m.subgraph).find((m) => m.subgraph.links === app.graph.nodes[2].subgraph.links).inputs.find((i)=>i._subgraphSlot.linkIds.find(li => li===link.id))
      if(graphContext.links===link) {
        const subgraphNode = [...app.graph.nodes.values()].filter(m => m.subgraph).find((m) => m.subgraph.links === link);
        return graphContext;
      }
      
      // Iterate through all nodes on this level to find subgraphs
      if (graphContext._nodes) {
        for (const node of graphContext._nodes) {
          // Check if the node contains an internal nested subgraph
          if (node.subgraph && node.subgraph instanceof LGraph) {    
              // Recurse into the sub-graph layer and merge the results
              const upstreamWidget = findWidgetInSubgraphByLink(link, node.subgraph);
              if(upstreamWidget) {
                  return upstreamWidget;
              }
          }
        }
      }
      */
      return null;
  }
}

export const ALEGROUPCONTROLLER_SERVICE = new AleGroupControllerService();

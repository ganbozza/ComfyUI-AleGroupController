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
        return false;
    }
  

    
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
  
getUpstreamWidgetByLink(link, graphContext) {
    if (link.origin_id > 0) {
        return graphContext.getNodeById(link.origin_id)?.inputs[link.origin_slot]?.widget;
    } else {
        const owner = findOwningSubgraphNode(graphContext.rootGraph, graphContext);
        return owner?.node.inputs[link.origin_slot]?.widget;
    }
}
  

export const ALEGROUPCONTROLLER_SERVICE = new AleGroupControllerService();

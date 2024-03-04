import { OrderEngine } from "./order-engine.js";
import { Flexibility, FlexibleLoad, Dependency } from "./flexibilities.js";

let flex = new Flexibility({
    unlimited: true
})

let load1 = new FlexibleLoad({
    start: 19,
    end: 24,
    power: 27,
    duration: 1
})

let load2 = new FlexibleLoad({
    start: 17,
    end: 22,
    power: 18,
    duration: 2
})

let load3 = new FlexibleLoad({
    start: 19,
    end: 24,
    power: 1,
    duration: 1
})

let load4 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 6,
    duration: 1
})

flex.addLoad(load1)
flex.addLoad(load2)
flex.addLoad(load3)
flex.addLoad(load4)

let dep1 = new Dependency({
    triggerID: load1.id,
    targetID: load2.id,
    logicalType: "implies"
})

let dep2 = new Dependency({
    triggerID: load1.id,
    targetID: load3.id,
    logicalType: "implies"
})

let dep3 = new Dependency({
    triggerID: load3.id,
    targetID: load4.id,
    logicalType: "implies",
    temporalTypes: [{trigger: 'end', target: 'start', time: 0}]
})

flex.addDependency(dep1)
flex.addDependency(dep2)
flex.addDependency(dep3)

let oe = new OrderEngine(flex)
oe.transform(true)
oe.writeFile('collection')
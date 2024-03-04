import { OrderEngine } from "./order-engine.js";
import { Flexibility, FlexibleLoad, Dependency } from "./flexibilities.js";

let flex = new Flexibility({
    unlimited: true
})

let load1 = new FlexibleLoad({
    start: 9.5,
    power: 10,
    duration: 1
})

let load2 = new FlexibleLoad({
    power: 20,
    duration: 1
})

let load3 = new FlexibleLoad({
    power: 25,
    duration: 1
})

let load4 = new FlexibleLoad({
    end: 17,
    power: 15,
    duration: 1
})

flex.addLoad(load1)
flex.addLoad(load2)
flex.addLoad(load3)
flex.addLoad(load4)

let dep1 = new Dependency({
    triggerID: load1.id,
    targetID: load2.id,
    logicalType: "implies",
    temporalTypes: [{trigger: 'end', target: 'start', time: 0}]
})

let dep2 = new Dependency({
    triggerID: load2.id,
    targetID: load3.id,
    logicalType: "implies",
    temporalTypes: [{trigger: 'end', target: 'start', time: 0}]
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
oe.writeFile('profile')
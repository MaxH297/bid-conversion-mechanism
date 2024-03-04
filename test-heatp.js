import { OrderEngine } from "./order-engine.js";
import { Flexibility, FlexibleLoad, Dependency } from "./flexibilities.js";

let flex = new Flexibility({
    unlimited: true
})

let load1 = new FlexibleLoad({
    start: 12,
    end: 14.5,
    power: 10,
    duration: 1
})

let load2 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 5,
    duration: 0.75,
    maxDuration: 3.75,
    durationSteps: 4
})

flex.addLoad(load1)
flex.addLoad(load2)

let dep1 = new Dependency({
    triggerID: load1.id,
    targetID: load2.id,
    logicalType: "implies",
    temporalTypes: [{trigger: 'end', target: 'start', time: 0}]
})

flex.addDependency(dep1)

let oe = new OrderEngine(flex)
oe.transform(true)
oe.writeFile('heatprocess')
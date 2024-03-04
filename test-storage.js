import { OrderEngine } from "./order-engine.js";
import { Flexibility, FlexibleLoad, Dependency } from "./flexibilities.js";

let flex = new Flexibility({
    unlimited: true
})

let load1 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 20,
    duration: 24
})

let load2 = new FlexibleLoad({
    start: 0,
    end: 6,
    power: 18,
    duration: 2

})

let load3 = new FlexibleLoad({
    start: 15,
    end: 22,
    power: 1,
    duration: 2,
    maxDuration: 4,
    durationSteps: 2
})

flex.addLoad(load1)
flex.addLoad(load2)
flex.addLoad(load3)

let dep1 = new Dependency({
    triggerID: load1.id,
    targetID: load2.id,
    logicalType: "implies"
})

let dep2 = new Dependency({
    triggerID: load2.id,
    targetID: load3.id,
    logicalType: "implies",
    effects: [{affected: 'tot-pow', val: -1, calc: 'mult'}]
})

flex.addDependency(dep1)
flex.addDependency(dep2)

let oe = new OrderEngine(flex)
oe.transform(true)
oe.writeFile('storage')
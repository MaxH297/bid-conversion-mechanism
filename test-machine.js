import { OrderEngine } from "./order-engine.js";
import { Flexibility, FlexibleLoad, Dependency } from "./flexibilities.js";

let flex = new Flexibility({
    unlimited: true
})

let load1 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 6,
    duration: 5
})

let load2 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 22,
    duration: 3
})

let load3 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 16,
    duration: 6
})

let load4 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 10,
    duration: 7
})

let load5 = new FlexibleLoad({
    start: 0,
    end: 24,
    power: 20,
    duration: 8
})

flex.addLoad(load1)
flex.addLoad(load2)
flex.addLoad(load3)
flex.addLoad(load4)
flex.addLoad(load5)

let dep1 = new Dependency({
    triggerID: load1.id,
    targetID: load3.id,
    logicalType: "excludes"
})

let dep2 = new Dependency({
    triggerID: load1.id,
    targetID: load4.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep3 = new Dependency({
    triggerID: load1.id,
    targetID: load5.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep4 = new Dependency({
    triggerID: load3.id,
    targetID: load4.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep5 = new Dependency({
    triggerID: load3.id,
    targetID: load5.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep6 = new Dependency({
    triggerID: load4.id,
    targetID: load5.id,
    logicalType: "implies",
    temporalTypes: [{trigger: 'end', target: 'start', time: 0, timeMax: 24}]
})

let dep7 = new Dependency({
    triggerID: load1.id,
    targetID: load2.id,
    logicalType: "implies",
    temporalTypes: [{trigger: 'end', target: 'start', time: 0}]
})

let dep8 = new Dependency({
    triggerID: load2.id,
    targetID: load4.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep9 = new Dependency({
    triggerID: load2.id,
    targetID: load5.id,
    logicalType: "implies",
    notAtSameTime: true
})

flex.addDependency(dep1)
flex.addDependency(dep2)
flex.addDependency(dep3)
flex.addDependency(dep4)
flex.addDependency(dep5)
flex.addDependency(dep6)
flex.addDependency(dep7)
flex.addDependency(dep8)
flex.addDependency(dep9)

let oe = new OrderEngine(flex)
oe.transform(true)
oe.writeFile('machine')
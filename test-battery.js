import { OrderEngine } from "./order-engine.js";
import { Flexibility, FlexibleLoad, Dependency } from "./flexibilities.js";

let flex = new Flexibility({
    unlimited: true
})

let load1 = new FlexibleLoad({
    start: 1,
    end: 8,
    power: 11,
    duration: 1
})

let load2 = new FlexibleLoad({
    start: 1,
    end: 8,
    power: 11,
    duration: 1
})

let load3 = new FlexibleLoad({
    start: 1,
    end: 8,
    power: 11,
    duration: 1
})

let load4 = new FlexibleLoad({
    start: 1,
    end: 8,
    power: 5,
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
    notAtSameTime: true
})

let dep2 = new Dependency({
    triggerID: load1.id,
    targetID: load3.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep3 = new Dependency({
    triggerID: load1.id,
    targetID: load4.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep4 = new Dependency({
    triggerID: load2.id,
    targetID: load3.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep5 = new Dependency({
    triggerID: load2.id,
    targetID: load4.id,
    logicalType: "implies",
    notAtSameTime: true
})

let dep6 = new Dependency({
    triggerID: load3.id,
    targetID: load4.id,
    logicalType: "implies",
    notAtSameTime: true
})

flex.addDependency(dep1)
flex.addDependency(dep2)
flex.addDependency(dep3)
flex.addDependency(dep4)
flex.addDependency(dep5)
flex.addDependency(dep6)

let oe = new OrderEngine(flex)
oe.transform(true)
oe.writeFile('battery')